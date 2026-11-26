// Accesso ai dati: Supabase (REST + Auth) oppure modalità prova nel browser.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const SESSION_KEY = 'bf.session';
const DEMO_KEY = 'bf.demo.db';
const PAGE = 1000;

const KEYS = {
  macro: ['codice'], voci: ['id'], metodi: ['nome'], movimenti: ['id'],
  preventivi: ['anno', 'voce_id'], conti: ['id'], saldi: ['conto_id', 'data'], membri: ['email'],
  scadenze: ['id'], scadenze_fatte: ['scadenza_id', 'data'], impostazioni: ['chiave'],
};
const IDENTITY = { voci: true, movimenti: true, conti: true, scadenze: true };

function qs(match) {
  return Object.entries(match).map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`).join('&');
}

const oggi = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

async function net(url, opts) {
  try { return await fetch(url, opts); }
  catch { throw new Error('Impossibile collegarsi al database: controlla la connessione internet (o l\'indirizzo in config.js).'); }
}

// ---------------------------------------------------------------- Supabase
class SupabaseApi {
  constructor(url, key) {
    this.mode = 'supabase';
    this.url = url.replace(/\/$/, '');
    this.key = key;
    try { this.session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { this.session = null; }
    // l'accesso vale solo per il giorno in cui è stato fatto
    if (this.session && localStorage.getItem(SESSION_KEY + '.giorno') !== oggi()) this._save(null);
  }
  get user() { return this.session?.user ? { email: this.session.user.email } : null; }

  _save(s) {
    if (s && !s.expires_at && s.expires_in) s.expires_at = Math.floor(Date.now() / 1000) + s.expires_in;
    this.session = s;
    try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch {}
  }

  async _auth(path, body) {
    const r = await net(`${this.url}/auth/v1/${path}`, {
      method: 'POST', headers: { apikey: this.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j.error_description || j.msg || j.message || `Errore ${r.status}`;
      throw new Error(/invalid login/i.test(msg) ? 'Email o password non corretti' : msg);
    }
    return j;
  }

  async login(email, password) {
    this._save(await this._auth('token?grant_type=password', { email, password }));
    try { localStorage.setItem(SESSION_KEY + '.giorno', oggi()); } catch {}
    return this.user;
  }

  async logout() {
    const t = this.session?.access_token;
    this._save(null);
    if (t) fetch(`${this.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: this.key, Authorization: `Bearer ${t}` } }).catch(() => {});
  }

  async _token() {
    if (this.session && localStorage.getItem(SESSION_KEY + '.giorno') !== oggi()) this._save(null);
    if (!this.session) throw Object.assign(new Error('Sessione scaduta: accedi di nuovo'), { auth: true });
    const now = Math.floor(Date.now() / 1000);
    if ((this.session.expires_at || 0) - now < 60) {
      try { this._save(await this._auth('token?grant_type=refresh_token', { refresh_token: this.session.refresh_token })); }
      catch { this._save(null); throw Object.assign(new Error('Sessione scaduta: accedi di nuovo'), { auth: true }); }
    }
    return this.session.access_token;
  }

  async _rest(method, path, { body, prefer, range } = {}) {
    const headers = { apikey: this.key, Authorization: `Bearer ${await this._token()}`, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    if (range) { headers['Range-Unit'] = 'items'; headers.Range = range; }
    const r = await net(`${this.url}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) { this._save(null); throw Object.assign(new Error('Sessione scaduta: accedi di nuovo'), { auth: true }); }
    const txt = await r.text();
    const j = txt ? JSON.parse(txt) : null;
    if (!r.ok) throw new Error(j?.message || `Errore ${r.status}`);
    return j;
  }

  async all(table) {
    const order = KEYS[table].join(',');
    let out = [], from = 0;
    for (;;) {
      const rows = await this._rest('GET', `${table}?select=*&order=${order}`, { range: `${from}-${from + PAGE - 1}` });
      out = out.concat(rows);
      if (rows.length < PAGE) return out;
      from += PAGE;
    }
  }
  insert(table, rows) { return this._rest('POST', table, { body: rows, prefer: 'return=representation' }); }
  upsert(table, rows) {
    return this._rest('POST', `${table}?on_conflict=${KEYS[table].join(',')}`, { body: rows, prefer: 'resolution=merge-duplicates,return=representation' });
  }
  update(table, match, patch) { return this._rest('PATCH', `${table}?${qs(match)}`, { body: patch, prefer: 'return=representation' }); }
  remove(table, match) { return this._rest('DELETE', `${table}?${qs(match)}`, { prefer: 'return=minimal' }); }

  // ---- foto (Supabase Storage, cartella privata "scontrini")
  async _storage(method, path, body, ctype) {
    const headers = { apikey: this.key, Authorization: `Bearer ${await this._token()}` };
    if (ctype) headers['Content-Type'] = ctype;
    const r = await net(`${this.url}/storage/v1/${path}`, { method, headers, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = j.message || j.error || `Errore ${r.status}`;
      throw new Error(/bucket not found/i.test(m) ? 'Cartella foto non trovata: esegui su Supabase lo script v1.5_scontrini.sql' : 'Foto: ' + m);
    }
    return j;
  }
  uploadFile(path, blob) { return this._storage('POST', `object/scontrini/${path}`, blob, blob.type || 'image/jpeg'); }
  async fileUrl(path) {
    const j = await this._storage('POST', `object/sign/scontrini/${path}`, JSON.stringify({ expiresIn: 3600 }), 'application/json');
    return `${this.url}/storage/v1${j.signedURL || j.signedUrl}`;
  }
  removeFile(path) { return this._storage('DELETE', 'object/scontrini', JSON.stringify({ prefixes: [path] }), 'application/json'); }
}

// ---------------------------------------------------------------- Prova
class DemoApi {
  constructor() {
    this.mode = 'demo';
    let db = null;
    try { db = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch {}
    this.db = db || { seq: {}, t: {} };
    for (const k of Object.keys(KEYS)) this.db.t[k] ||= [];
    if (!this.db.t.membri.length) this.db.t.membri = [{ email: 'prova@famiglia', nome: 'Marco' }, { email: 'simona@famiglia', nome: 'Simona' }];
    this.session = JSON.parse(localStorage.getItem(SESSION_KEY + '.demo') || 'null');
  }
  get user() { return this.session; }
  _persist() {
    clearTimeout(this._t);
    this._t = setTimeout(() => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(this.db)); } catch (e) { console.warn('Spazio locale esaurito', e); } }, 200);
  }
  async login(email) { this.session = { email: email || 'prova@famiglia' }; localStorage.setItem(SESSION_KEY + '.demo', JSON.stringify(this.session)); return this.session; }
  async logout() { this.session = null; localStorage.removeItem(SESSION_KEY + '.demo'); }
  _match(row, m) { return Object.entries(m).every(([k, v]) => String(row[k]) === String(v)); }
  _key(table, r) { return KEYS[table].map(k => r[k]).join('|'); }
  async all(table) { return this.db.t[table].map(r => ({ ...r })); }
  async insert(table, rows) {
    const out = rows.map(r => {
      const x = { ...r };
      if (IDENTITY[table]) { this.db.seq[table] = (this.db.seq[table] || 0) + 1; x.id = this.db.seq[table]; }
      else if (this.db.t[table].some(y => this._key(table, y) === this._key(table, x))) throw new Error('duplicate key value');
      if (table === 'movimenti') { x.creato_il ||= new Date().toISOString(); x.creato_da ||= this.session?.email; }
      this.db.t[table].push(x); return { ...x };
    });
    this._persist(); return out;
  }
  async upsert(table, rows) {
    const t = this.db.t[table];
    const out = rows.map(r => {
      const i = t.findIndex(x => this._key(table, x) === this._key(table, r));
      if (i >= 0) { t[i] = { ...t[i], ...r }; return { ...t[i] }; }
      t.push({ ...r }); return { ...r };
    });
    this._persist(); return out;
  }
  async update(table, match, patch) {
    const out = [];
    this.db.t[table].forEach((r, i, a) => { if (this._match(r, match)) { a[i] = { ...r, ...patch }; out.push({ ...a[i] }); } });
    this._persist(); return out;
  }
  async remove(table, match) { this.db.t[table] = this.db.t[table].filter(r => !this._match(r, match)); this._persist(); }
  reset() { localStorage.removeItem(DEMO_KEY); }
  // foto in prova: restano solo in memoria (si perdono ricaricando la pagina)
  async uploadFile(path, blob) { (this.files ||= new Map()).set(path, blob); return { Key: path }; }
  async fileUrl(path) { const b = this.files?.get(path); if (!b) throw new Error('Foto non disponibile in modalità prova dopo il ricaricamento'); return URL.createObjectURL(b); }
  async removeFile(path) { this.files?.delete(path); }
}

export const api = SUPABASE_URL ? new SupabaseApi(SUPABASE_URL, SUPABASE_ANON_KEY) : new DemoApi();
