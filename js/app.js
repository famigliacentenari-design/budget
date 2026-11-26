import { api } from './api.js';
import { columns, line } from './charts.js';
import { NOVITA } from './novita.js';
import { comprimi, leggiTesto, interpreta } from './ocr.js';
import { gLogin, gLogout, gTokenValid, gPrimary, gCreateCalendar, gShare, gSync } from './gcal.js';

export const VERSIONE = '1.6.2';
export const DATA_VERSIONE = '26/11/2026';

// ------------------------------------------------------------------ stato
const S = { macro: [], voci: [], metodi: [], membri: [], movimenti: [], preventivi: [], conti: [], saldi: [], scadenze: [], scadenze_fatte: [], imp: {}, stipendio: [] };
const TODAY = new Date();
const UI = {
  anno: TODAY.getFullYear(),
  f: { anno: String(TODAY.getFullYear()), mese: '', tipo: '', voce: '', macro: '', metodo: '', q: '' },
  limit: 150, confronto: 'periodo', trendVoce: '', soloRischio: false, tipo: 'U',
};
const COL = { E: '#1baf7a', U: '#eb6834', prev: '#b4b2a9', accent: '#2a78d6', warn: '#eda100', bad: '#e34948' };
const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const MESI_L = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// ------------------------------------------------------------------ utilità
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf2 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur = v => nf2.format(v || 0);
const eur0 = v => nf0.format(Math.round(v || 0));
const pct = v => (isFinite(v) ? Math.round(v * 100) : 0) + '%';
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayISO = () => iso(new Date());
const fmtDate = s => { const [y, m, d] = s.split('-'); return `${+d} ${MESI[+m - 1]} ${y}`; };
const fmtDay = s => { const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); };
const sum = (a, f = x => x) => a.reduce((s, x) => s + (+f(x) || 0), 0);
const round2 = v => Math.round(v * 100) / 100;
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('bf.' + k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('bf.' + k, JSON.stringify(v)); } catch {} } };

// importo: accetta "12,50", "1.234,56", "30,9-15", "10+5,5"
function parseAmount(s) {
  s = String(s || '').trim().replace(/\s/g, '').replace(/€/g, '');
  if (!s) return NaN;
  if (!/^[-+]?[\d.,]+([-+][\d.,]+)*$/.test(s)) return NaN;
  const toNum = t => {
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
    return parseFloat(t);
  };
  const parts = s.match(/[-+]?[^-+]+/g);
  return round2(parts.reduce((a, p) => a + (p[0] === '-' ? -toNum(p.slice(1)) : toNum(p.replace(/^\+/, ''))), 0));
}

const voce = id => S._voci.get(id);
const tipoMov = m => voce(m.voce_id)?.tipo || 'U';
const macroNome = c => S.macro.find(m => m.codice === c)?.nome || c;
const anni = () => {
  const ys = new Set(S.movimenti.map(m => +m.data.slice(0, 4)));
  ys.add(TODAY.getFullYear());
  return [...ys].sort((a, b) => b - a);
};
function fracAnno(y) {
  const cy = TODAY.getFullYear();
  if (y < cy) return 1;
  if (y > cy) return 0;
  const start = new Date(y, 0, 1), end = new Date(y + 1, 0, 1);
  return (TODAY - start + 864e5 / 2) / (end - start);
}
function me() {
  const email = (api.user?.email || '').toLowerCase();
  return S.membri.find(m => m.email.toLowerCase() === email)?.nome || S.membri[0]?.nome || '';
}

function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${msg}</span>` + (action ? `<button class="link">${esc(action.label)}</button>` : '');
  t.classList.add('show');
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); action.fn(); };
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2500);
}
async function guard(fn) {
  try { return await fn(); }
  catch (e) {
    console.error(e);
    if (e.auth) { renderLogin(e.message); return; }
    toast('⚠️ ' + esc(e.message || e));
  }
}

// ------------------------------------------------------------------ dati
function index() {
  S._voci = new Map(S.voci.map(v => [v.id, v]));
  S._vociNome = new Map(S.voci.map(v => [v.nome.toLowerCase(), v]));
  S.voci.sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome));
  S.metodi.sort((a, b) => a.ordine - b.ordine);
  S.conti.sort((a, b) => a.ordine - b.ordine);
  S.movimenti.forEach(m => { m.importo = +m.importo; });
  S.preventivi.forEach(p => { p.importo = +p.importo; });
  S.saldi.forEach(s => { s.saldo = +s.saldo; });
  S.scadenze.forEach(s => { if (s.importo != null) s.importo = +s.importo; });
  S.movimenti.sort((a, b) => (b.data > a.data ? 1 : b.data < a.data ? -1 : b.id - a.id));
}
async function loadAll() {
  const t = ['macro', 'voci', 'metodi', 'membri', 'movimenti', 'preventivi', 'conti', 'saldi'];
  const r = await Promise.all(t.map(x => api.all(x)));
  t.forEach((x, i) => { S[x] = r[i]; });
  // tabelle della 1.3: se lo script SQL non è ancora stato eseguito l'app funziona lo stesso
  try { [S.scadenze, S.scadenze_fatte] = await Promise.all([api.all('scadenze'), api.all('scadenze_fatte')]); S._scadOk = true; }
  catch (e) { if (e.auth) throw e; S.scadenze = []; S.scadenze_fatte = []; S._scadOk = false; }
  // sezione privata: il database restituisce i dati solo all'account autorizzato
  try { S._stip = (await api.all('stipendio_accesso')).length > 0; S.stipendio = S._stip ? (await api.all('stipendio')).map(r => { for (const k of ['trasferta', 'premi', 'lordo', 'rimborso', 'netto', 'vettura']) if (r[k] != null) r[k] = +r[k]; return r; }) : []; }
  catch (e) { if (e.auth) throw e; S._stip = false; S.stipendio = []; }
  try { S.imp = Object.fromEntries((await api.all('impostazioni')).map(r => [r.chiave, r.valore])); S._impOk = true; }
  catch (e) { if (e.auth) throw e; S.imp = {}; S._impOk = false; }
  index();
}

// ------------------------------------------------------------------ shell
const ROUTES = {
  nuovo: { label: 'Nuovo', icon: 'plus', render: renderNuovo },
  movimenti: { label: 'Movimenti', icon: 'list', render: renderMovimenti },
  scadenze: { label: 'Scadenze', icon: 'calendar', render: renderScadenze },
  analisi: { label: 'Analisi', icon: 'chart', render: renderAnalisi },
  preventivo: { label: 'Preventivo', icon: 'target', render: renderPreventivo },
  patrimonio: { label: 'Patrimonio', icon: 'bank', render: renderPatrimonio },
  stipendio: { label: 'Stipendio', icon: 'wallet', render: renderStipendio, privata: true },
  impostazioni: { label: 'Impostazioni', icon: 'gear', render: renderImpostazioni, hidden: true },
};
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h12v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13.5h2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  bank: '<path d="M3 10h18L12 4 3 10zM5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
const icon = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

function shell() {
  document.body.innerHTML = `
    <header class="top">
      <div class="brand">Budget famiglia${api.mode === 'demo' ? ' <span class="pill warn">prova</span>' : ''}</div>
      <nav class="tabs">${Object.entries(ROUTES).filter(([, r]) => !r.hidden && (!r.privata || S._stip)).map(([k, r]) => `<a href="#${k}" data-r="${k}">${icon(r.icon)}<span>${r.label}</span></a>`).join('')}</nav>
      <a class="gear" href="#impostazioni" aria-label="Impostazioni">${icon('gear')}</a>
    </header>
    <main id="view"></main>
    <div id="toast" role="status"></div>`;
}
function route() {
  const [name, q] = (location.hash.slice(1) || 'nuovo').split('?');
  const r = ROUTES[name] || ROUTES.nuovo;
  $$('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.r === name));
  const params = Object.fromEntries(new URLSearchParams(q || ''));
  const v = $('#view');
  v.innerHTML = '';
  v.className = 'view-' + name;
  guard(() => r.render(v, params));
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ login
function renderLogin(msg) {
  document.body.innerHTML = `
    <main class="login">
      <h1>Budget famiglia</h1>
      <p class="muted">Accedi con l'account creato su Supabase.</p>
      <form id="lf" class="card">
        <label>Email<input type="email" name="email" autocomplete="username" required></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
        <p class="err">${esc(msg || '')}</p>
        <button class="primary" type="submit">Accedi</button>
      </form>
    </main><div id="toast"></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Accesso…';
    try { await api.login(f.get('email').trim(), f.get('password')); await start(); }
    catch (err) { $('.err').textContent = err.message; b.disabled = false; b.textContent = 'Accedi'; }
  };
}

// ------------------------------------------------------------------ NUOVO / MODIFICA
function vociFrequenti(tipo, n = 8) {
  const since = iso(new Date(Date.now() - 120 * 864e5));
  const c = new Map();
  for (const m of S.movimenti) {
    if (m.data < since) break;
    const v = voce(m.voce_id);
    if (v && v.attiva && v.tipo === tipo) c.set(v.id, (c.get(v.id) || 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => voce(id));
}
function voceOptions(tipo, sel) {
  const groups = S.macro.filter(m => m.tipo === tipo);
  return `<option value="">Scegli la voce…</option>` + groups.map(g => {
    const vs = S.voci.filter(v => v.macro === g.codice && (v.attiva || v.id === sel));
    return vs.length ? `<optgroup label="${esc(g.nome)}">${vs.map(v => `<option value="${v.id}" ${v.id === sel ? 'selected' : ''}>${esc(v.nome)}</option>`).join('')}</optgroup>` : '';
  }).join('');
}

// Movimenti dello stesso mese con lo stesso importo e la stessa voce (o la stessa descrizione)
function possibiliDoppioni({ id, data, voce_id, importo, descrizione }) {
  const mese = data.slice(0, 7), desc = (descrizione || '').trim().toLowerCase(), tipo = voce(voce_id)?.tipo;
  return S.movimenti.filter(m => m.id !== id && m.data.slice(0, 7) === mese && Math.abs(m.importo - importo) < 0.005
    && (m.voce_id === voce_id || (desc && (m.descrizione || '').trim().toLowerCase() === desc && tipoMov(m) === tipo)));
}

function renderNuovo(v, params) {
  const edit = params.id ? S.movimenti.find(m => String(m.id) === params.id) : null;
  if (params.id && !edit) { v.innerHTML = `<p class="muted">Movimento non trovato.</p>`; return; }
  const last = store.get('last', {});
  const st = {
    tipo: edit ? tipoMov(edit) : UI.tipo,
    voce_id: edit?.voce_id || null,
    metodo: edit ? edit.metodo : (last.metodo || 'Bancomat'),
    data: edit?.data || todayISO(),
    foto: null,
  };
  v.innerHTML = `
    <form id="mf" class="card form" autocomplete="off">
      <h2>${edit ? 'Modifica movimento' : 'Nuovo movimento'}</h2>
      <div class="seg" id="tipo">
        <button type="button" data-t="U">Uscita</button><button type="button" data-t="E">Entrata</button>
      </div>
      ${S.imp?.vision_key ? `<div class="scan"><label class="btn scanbtn"><input type="file" id="foto" accept="image/*" capture="environment" hidden>${icon('camera')}<span>Leggi scontrino</span></label>
        <div id="fotoBox" class="fotobox"></div></div>` : ''}
      <div id="scanInfo"></div>
      <label class="amount"><span>Importo</span>
        <div class="amt-wrap"><input id="imp" inputmode="decimal" placeholder="0,00" value="${edit ? String(edit.importo).replace('.', ',') : ''}" required><span>€</span></div>
        <small id="impHint" class="muted">Puoi scrivere anche un calcolo, es. 30,90-15</small>
      </label>
      <div class="field"><span class="lbl">Voce</span>
        <div class="chips" id="freq"></div>
        <select id="voce"></select>
        <small id="hint" class="muted"></small>
      </div>
      <label>Descrizione<input id="desc" list="descList" placeholder="es. Esselunga, farmacia…" value="${esc(edit?.descrizione || '')}"><datalist id="descList"></datalist></label>
      <div class="row2">
        <label>Data<input type="date" id="data" value="${st.data}" required></label>
        <div class="field"><span class="lbl">&nbsp;</span><div class="chips"><button type="button" class="chip" data-d="0">Oggi</button><button type="button" class="chip" data-d="1">Ieri</button></div></div>
      </div>
      <div class="field"><span class="lbl">Pagamento</span><div class="chips" id="metodo"></div></div>
      <details ${edit?.note ? 'open' : ''}><summary>Note</summary><textarea id="note" rows="2">${esc(edit?.note || '')}</textarea></details>
      <p class="err" id="ferr"></p>
      <div id="dup"></div>
      <div class="actions">
        <button class="primary" type="submit">${edit ? 'Salva modifiche' : 'Salva'}</button>
        ${edit ? '<button type="button" class="danger" id="del">Elimina</button><button type="button" id="cancel">Annulla</button>' : ''}
      </div>
      ${edit?.voce_originale ? `<small class="muted">Voce nel file Excel originale: ${esc(edit.voce_originale)}</small>` : ''}
    </form>
    ${edit ? '' : '<section class="card"><h3>Ultimi inseriti</h3><div id="recent"></div></section>'}`;
  if (!edit) {
    const ev = scadenzeInEvidenza(), late = ev.filter(x => x.d <= todayISO()).length;
    if (ev.length) v.insertAdjacentHTML('afterbegin', `<a class="card banner ${late ? 'late' : ''}" href="#scadenze">${icon('calendar')}<span><b>${late ? `${late} da gestire` : `${ev.length} in arrivo`}</b> · ${ev.slice(0, 3).map(x => esc(x.s.titolo) + ' ' + fmtDate(x.d).replace(/ \d{4}$/, '')).join(', ')}${ev.length > 3 ? '…' : ''}</span><span class="go">→</span></a>`);
  }

  const paint = () => {
    $$('#tipo button').forEach(b => b.classList.toggle('on', b.dataset.t === st.tipo));
    const fq = vociFrequenti(st.tipo);
    $('#freq').innerHTML = fq.map(x => `<button type="button" class="chip ${x.id === st.voce_id ? 'on' : ''}" data-v="${x.id}">${esc(x.nome)}</button>`).join('');
    $('#voce').innerHTML = voceOptions(st.tipo, st.voce_id);
    const vv = voce(st.voce_id);
    $('#hint').textContent = vv?.suggerimento || '';
    const descs = [...new Set(S.movimenti.filter(m => m.voce_id === st.voce_id && m.descrizione).slice(0, 300).map(m => m.descrizione.trim()))].slice(0, 40);
    $('#descList').innerHTML = descs.map(d => `<option value="${esc(d)}">`).join('');
    const metodi = S.metodi.filter(m => m.attivo || m.nome === st.metodo).map(m => m.nome);
    $('#metodo').innerHTML = metodi.map(m => `<button type="button" class="chip ${m === st.metodo ? 'on' : ''}" data-m="${esc(m)}">${esc(m)}</button>`).join('');
    $$('[data-d]').forEach(b => b.classList.toggle('on', $('#data').value === iso(new Date(Date.now() - b.dataset.d * 864e5))));
  };
  paint();

  $('#tipo').onclick = e => { const t = e.target.dataset.t; if (t && t !== st.tipo) { st.tipo = t; UI.tipo = t; st.voce_id = null; paint(); } };
  $('#freq').onclick = e => { const id = +e.target.dataset.v; if (id) { st.voce_id = id; paint(); } };
  $('#voce').onchange = e => { st.voce_id = +e.target.value || null; paint(); };
  $('#metodo').onclick = e => { if (e.target.dataset.m !== undefined) { st.metodo = e.target.dataset.m; paint(); } };
  $$('[data-d]').forEach(b => b.onclick = () => { $('#data').value = iso(new Date(Date.now() - b.dataset.d * 864e5)); paint(); });
  $('#data').onchange = paint;
  $('#imp').oninput = () => {
    const raw = $('#imp').value, n = parseAmount(raw);
    $('#impHint').textContent = /[-+]/.test(raw.replace(/^[-+]/, '')) && isFinite(n) ? `= ${eur(n)}` : 'Puoi scrivere anche un calcolo, es. 30,90-15';
  };
  if (!edit) setTimeout(() => $('#imp').focus(), 50);

  // --- foto dello scontrino
  const paintFoto = async () => {
    const box = $('#fotoBox'); if (!box) return;
    const url = st.foto?.url || null;
    box.innerHTML = url ? `<img src="${url}" alt="Scontrino letto">` : '';
  };
  paintFoto();
  if ($('#foto')) $('#foto').onchange = e => guard(async () => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const info = $('#scanInfo');
    info.innerHTML = '<div class="scaninfo">Preparo la foto…</div>';
    const blob = await comprimi(f);
    if (st.foto) URL.revokeObjectURL(st.foto.url);
    st.foto = { blob, url: URL.createObjectURL(blob) }; paintFoto();
    const key = S.imp?.vision_key;
    info.innerHTML = '<div class="scaninfo">Leggo lo scontrino…</div>';
    let r;
    try { r = interpreta(await leggiTesto(blob, key)); }
    catch (err) { info.innerHTML = `<div class="scaninfo bad">${esc(err.message)} Completa i dati a mano.</div>`; return; }
    const letti = [];
    if (r.importo != null) { $('#imp').value = String(r.importo.toFixed(2)).replace('.', ','); letti.push('importo'); }
    if (r.data) { $('#data').value = r.data; letti.push('data'); }
    if (r.negozio && !$('#desc').value.trim()) { $('#desc').value = r.negozio; letti.push('negozio'); }
    if (r.metodo && S.metodi.some(m => m.nome === r.metodo)) { st.metodo = r.metodo; letti.push('pagamento'); }
    st.tipo = 'U';
    const sug = suggerisciVoce(r.negozio, r.articoli);
    if (sug && !st.voce_id) { st.voce_id = sug.id; letti.push('voce'); }
    paint();
    info.innerHTML = letti.length
      ? `<div class="scaninfo ok">Letti: ${letti.join(', ')}. <b>Controlla i dati</b> prima di salvare.</div>`
      : `<div class="scaninfo bad">Non sono riuscito a leggere i dati: completa a mano.</div>`;
    $('#imp').focus();
  });

  $('#mf').onsubmit = e => {
    e.preventDefault();
    guard(async () => {
      const importo = parseAmount($('#imp').value);
      const err = !isFinite(importo) || importo === 0 ? 'Inserisci un importo valido' : !st.voce_id ? 'Scegli una voce' : !$('#data').value ? 'Inserisci la data' : '';
      $('#ferr').textContent = err;
      if (err) return;
      // possibile doppione nello stesso mese
      const dups = possibiliDoppioni({ id: edit?.id, data: $('#data').value, voce_id: st.voce_id, importo, descrizione: $('#desc').value });
      const firma = dups.map(d => d.id).join(',') + '|' + importo + '|' + st.voce_id + '|' + $('#data').value.slice(0, 7);
      if (dups.length && st.dupOk !== firma) {
        $('#dup').innerHTML = `<div class="dupbox"><b>⚠️ Forse l'hai già inserita</b>
          <p>Nello stesso mese ${dups.length === 1 ? 'c\'è già un movimento simile' : `ci sono già ${dups.length} movimenti simili`}:</p>
          ${movList(dups, false)}
          <div class="actions"><button type="button" class="primary" id="dupYes">Salva comunque</button><button type="button" id="dupNo">Non salvare</button></div></div>`;
        $('#dupYes').onclick = () => { st.dupOk = firma; $('#mf').requestSubmit(); };
        $('#dupNo').onclick = () => { $('#dup').innerHTML = ''; };
        $('#dup').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      $('#dup').innerHTML = ''; st.dupOk = null;
      const row = {
        data: $('#data').value, voce_id: st.voce_id, importo, descrizione: $('#desc').value.trim() || null,
        metodo: st.metodo || null, note: $('#note').value.trim() || null,
      };
      const btn = $('#mf button[type=submit]'); btn.disabled = true;
      try {
        if (edit) {
          const [r] = await api.update('movimenti', { id: edit.id }, { ...row, modificato_il: new Date().toISOString() });
          Object.assign(edit, r || row); index();
          toast('Modifica salvata'); history.back();
        } else {
          const [r] = await api.insert('movimenti', [row]);
          S.movimenti.push(r); index();
          store.set('last', { metodo: st.metodo });
          toast(`Salvato · ${esc(voce(st.voce_id).nome)} ${eur(importo)}`, {
            label: 'Annulla', fn: () => guard(async () => { await api.remove('movimenti', { id: r.id }); S.movimenti = S.movimenti.filter(m => m.id !== r.id); toast('Annullato'); route(); }),
          });
          $('#imp').value = ''; $('#desc').value = ''; $('#note').value = ''; $('#impHint').textContent = '';
          if (st.foto) URL.revokeObjectURL(st.foto.url); st.foto = null; st.voce_id = null; $('#scanInfo').innerHTML = ''; paintFoto();
          paint(); renderRecent(); $('#imp').focus();
        }
      } finally { btn.disabled = false; btn.textContent = edit ? 'Salva modifiche' : 'Salva'; }
    });
  };
  if (edit) {
    $('#cancel').onclick = () => history.back();
    $('#del').onclick = () => guard(async () => {
      if (!confirm(`Eliminare definitivamente "${voce(edit.voce_id)?.nome} ${eur(edit.importo)}" del ${fmtDate(edit.data)}?`)) return;
      await api.remove('movimenti', { id: edit.id });
      S.movimenti = S.movimenti.filter(m => m.id !== edit.id);
      toast('Movimento eliminato'); history.back();
    });
  }
  const renderRecent = () => {
    const el = $('#recent'); if (!el) return;
    const rec = [...S.movimenti].filter(m => m.creato_il && m.creato_da !== 'import excel').sort((a, b) => (b.creato_il > a.creato_il ? 1 : -1)).slice(0, 6);
    el.innerHTML = rec.length ? movList(rec, false) : '<p class="muted">Nessun movimento inserito dall\'app finora.</p>';
  };
  renderRecent();
}

function movRow(m) {
  const v = voce(m.voce_id), t = v?.tipo || 'U';
  const sub = [m.descrizione, m.metodo].filter(Boolean).map(esc).join(' · ');
  return `<a class="mov" href="#nuovo?id=${m.id}">
    <div class="mv-main"><div class="mv-voce">${esc(v?.nome || '?')}</div><div class="mv-sub">${sub}${m.note ? ' · <i>' + esc(m.note) + '</i>' : ''}</div></div>
    <div class="mv-amt ${t}">${m.creato_da === 'automatico' ? '<span class="pill auto">auto</span> ' : ''}${t === 'E' ? '+' : '−'}${eur(m.importo)}</div></a>`;
}
function movList(rows, groupByDay = true) {
  if (!groupByDay) return `<div class="movs">${rows.map(m => `<div class="mv-date">${fmtDate(m.data)}</div>${movRow(m)}`).join('')}</div>`;
  let out = '', day = '';
  for (const m of rows) {
    if (m.data !== day) {
      day = m.data;
      const dayRows = rows.filter(x => x.data === day);
      const u = sum(dayRows.filter(x => tipoMov(x) === 'U'), x => x.importo);
      out += `<div class="day"><span>${fmtDay(day)}</span><span>${u ? '−' + eur(u) : ''}</span></div>`;
    }
    out += movRow(m);
  }
  return `<div class="movs">${out}</div>`;
}

// ------------------------------------------------------------------ MOVIMENTI
function filtra(f) {
  const q = f.q.trim().toLowerCase();
  return S.movimenti.filter(m => {
    if (f.anno && !m.data.startsWith(f.anno)) return false;
    if (f.mese && +m.data.slice(5, 7) !== +f.mese) return false;
    const v = voce(m.voce_id);
    if (f.tipo && v?.tipo !== f.tipo) return false;
    if (f.voce && String(m.voce_id) !== f.voce) return false;
    if (f.macro && v?.macro !== f.macro) return false;
    if (f.metodo && m.metodo !== f.metodo) return false;
    if (q && !`${m.descrizione || ''} ${m.note || ''} ${v?.nome || ''} ${String(m.importo).replace('.', ',')}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
function renderMovimenti(v, params) {
  Object.assign(UI.f, params);
  const f = UI.f;
  const opt = (arr, sel, all) => `<option value="">${all}</option>` + arr.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  v.innerHTML = `
    <section class="card filters">
      <input id="q" type="search" placeholder="Cerca descrizione, nota, importo…" value="${esc(f.q)}">
      <div class="fgrid">
        <select data-k="anno">${opt(anni().map(y => [y, y]), f.anno, 'Tutti gli anni')}</select>
        <select data-k="mese">${opt(MESI_L.map((m, i) => [i + 1, m[0].toUpperCase() + m.slice(1)]), f.mese, 'Tutti i mesi')}</select>
        <select data-k="tipo">${opt([['U', 'Uscite'], ['E', 'Entrate']], f.tipo, 'Uscite ed entrate')}</select>
        <select data-k="macro">${opt(S.macro.map(m => [m.codice, m.nome]), f.macro, 'Tutte le categorie')}</select>
        <select data-k="voce">${opt(S.voci.map(x => [x.id, x.nome + (x.attiva ? '' : ' (non più usata)')]), f.voce, 'Tutte le voci')}</select>
        <select data-k="metodo">${opt([...new Set(S.movimenti.map(m => m.metodo).filter(Boolean))].sort().map(m => [m, m]), f.metodo, 'Tutti i pagamenti')}</select>
        <button id="reset" type="button">Azzera filtri</button>
      </div>
    </section>
    <section class="sumbar" id="sumbar"></section>
    <section id="list"></section>`;
  const draw = () => {
    const rows = filtra(f);
    const u = sum(rows.filter(m => tipoMov(m) === 'U'), m => m.importo), e = sum(rows.filter(m => tipoMov(m) === 'E'), m => m.importo);
    $('#sumbar').innerHTML = `<div><small>Movimenti</small><b>${rows.length.toLocaleString('it-IT')}</b></div>
      <div><small>Uscite</small><b class="U">${eur(u)}</b></div><div><small>Entrate</small><b class="E">${eur(e)}</b></div>
      <button id="csv" type="button">Esporta CSV</button>`;
    $('#list').innerHTML = rows.length ? movList(rows.slice(0, UI.limit)) + (rows.length > UI.limit ? `<button class="more" id="more">Mostra altri (${rows.length - UI.limit})</button>` : '') : '<p class="muted center">Nessun movimento con questi filtri.</p>';
    const more = $('#more'); if (more) more.onclick = () => { UI.limit += 300; draw(); };
    $('#csv').onclick = () => exportCSV(rows, 'movimenti');
  };
  $$('.filters select').forEach(s => s.onchange = () => { f[s.dataset.k] = s.value; UI.limit = 150; draw(); });
  let t; $('#q').oninput = e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; UI.limit = 150; draw(); }, 200); };
  $('#reset').onclick = () => { Object.assign(f, { anno: String(TODAY.getFullYear()), mese: '', tipo: '', voce: '', macro: '', metodo: '', q: '' }); renderMovimenti(v, {}); };
  draw();
}

function exportCSV(rows, name) {
  const head = ['Data', 'Anno', 'Mese', 'Tipo', 'Categoria', 'Voce', 'Descrizione', 'Importo', 'Pagamento', 'Note'];
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map(m => {
    const v = voce(m.voce_id);
    return [m.data, m.data.slice(0, 4), +m.data.slice(5, 7), v?.tipo === 'E' ? 'Entrata' : 'Uscita', macroNome(v?.macro), v?.nome, m.descrizione, String(m.importo).replace('.', ','), m.metodo, m.note].map(q).join(';');
  });
  const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${name}_${todayISO()}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ------------------------------------------------------------------ SCADENZE, APPUNTAMENTI, RICORRENZE
const pad2 = n => String(n).padStart(2, '0');
const dISO = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
const giorniMese = (y, m) => new Date(y, m, 0).getDate();
const addDays = (s, n) => iso(new Date(new Date(s + 'T12:00:00').getTime() + n * 864e5));
const GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const CAT_SCAD = [['casa', 'Casa e condominio'], ['polizza', 'Polizze'], ['auto', 'Auto'], ['documento', 'Documenti'], ['contratto', 'Contratti e abbonamenti'], ['tasse', 'Tasse'], ['figli', 'Figli'], ['salute', 'Salute'], ['altro', 'Altro']];
const catNome = c => CAT_SCAD.find(x => x[0] === c)?.[1] || 'Altro';

const _fest = {};
function festivi(y) {
  if (_fest[y]) return _fest[y];
  // Pasqua (algoritmo di Meeus) -> Lunedì dell'Angelo
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  const pasquetta = iso(new Date(y, mese - 1, giorno + 1)).slice(5);
  return (_fest[y] = new Set(['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26', pasquetta]));
}
const lavorativo = (y, m, d) => { const wd = new Date(y, m - 1, d).getDay(); return wd > 0 && wd < 6 && !festivi(y).has(`${pad2(m)}-${pad2(d)}`); };

function giornoNelMese(s, y, m) {
  const dm = giorniMese(y, m);
  if (s.regola === 'primo_feriale') { for (let d = 1; d <= dm; d++) if (lavorativo(y, m, d)) return d; return null; }
  if (s.regola === 'ultimo') return dm;
  if (s.regola === 'nth') {
    const target = (+s.giorno_sett || 1) % 7; // 1=lun ... 7=dom -> getDay
    const days = [];
    for (let d = 1; d <= dm; d++) if (new Date(y, m - 1, d).getDay() === target) days.push(d);
    return +s.nth === -1 ? days[days.length - 1] : days[(+s.nth || 1) - 1] || null;
  }
  return Math.min(+s.data_inizio.slice(8, 10), dm);
}
function occorrenze(s, from, to) {
  const out = [], start = s.data_inizio;
  const end = s.data_fine && s.data_fine < to ? s.data_fine : to;
  if (s.freq === 'una') { if (start >= from && start <= end) out.push(start); return out; }
  if (s.freq === 'settimane') {
    const step = 7 * (+s.intervallo || 1);
    let d = start;
    if (d < from) { const diff = Math.round((new Date(from) - new Date(d)) / 864e5); d = addDays(d, Math.floor(diff / step) * step); }
    for (; d <= end && out.length < 800; d = addDays(d, step)) if (d >= from && d >= start) out.push(d);
    return out;
  }
  const step = (s.freq === 'anni' ? 12 : 1) * (+s.intervallo || 1);
  let y = +start.slice(0, 4), m = +start.slice(5, 7);
  const fy = +from.slice(0, 4), fm = +from.slice(5, 7);
  const salto = Math.max(0, Math.floor(((fy - y) * 12 + fm - m) / step) - 1);
  m += salto * step; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12) + 1;
  while (out.length < 800) {
    if (dISO(y, m, 1) > end) break;
    const g = giornoNelMese(s, y, m);
    if (g) { const d = dISO(y, m, g); if (d > end) break; if (d >= start && d >= from) out.push(d); }
    m += step; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12) + 1;
  }
  return out;
}
function descriviRegola(s) {
  const n = +s.intervallo || 1;
  if (s.freq === 'una') return 'una volta';
  if (s.freq === 'settimane') return n === 1 ? 'ogni settimana' : `ogni ${n} settimane`;
  const ogni = s.freq === 'anni' ? (n === 1 ? 'ogni anno' : `ogni ${n} anni`) : ({ 1: 'ogni mese', 2: 'ogni 2 mesi', 3: 'ogni trimestre', 6: 'ogni semestre', 12: 'ogni anno' }[n] || `ogni ${n} mesi`);
  const nel = s.freq === 'anni' ? ` di ${MESI_L[+s.data_inizio.slice(5, 7) - 1]}` : '';
  const quando = s.regola === 'primo_feriale' ? `il primo giorno lavorativo${nel}` : s.regola === 'ultimo' ? `l'ultimo giorno${nel}` :
    s.regola === 'nth' ? `${+s.nth === -1 ? "l'ultimo" : `il ${s.nth}°`} ${GIORNI[(+s.giorno_sett || 1) - 1]}${nel}` : `il giorno ${+s.data_inizio.slice(8, 10)}${nel}`;
  return `${ogni}, ${quando}`;
}

const fatte = id => new Set(S.scadenze_fatte.filter(f => f.scadenza_id === id).map(f => f.data));
// ricorrenze ancora da gestire, dalla più vecchia (max 13 mesi indietro) fino a "to"
function daGestire(s, to) {
  const from = s.data_inizio > addDays(todayISO(), -400) ? s.data_inizio : addDays(todayISO(), -400);
  const done = fatte(s.id);
  return occorrenze(s, from, to).filter(d => !done.has(d));
}
function prossima(s) { return daGestire(s, addDays(todayISO(), 800)).find(d => d >= todayISO()) || null; }

// Registra i movimenti automatici maturati (e collega quelli già inseriti a mano)
async function registraAutomatici() {
  if (!S._scadOk) return 0;
  let n = 0;
  for (const s of S.scadenze.filter(x => x.attiva && x.tipo === 'movimento' && x.modalita === 'auto' && x.voce_id && x.importo)) {
    for (const d of daGestire(s, todayISO())) {
      const gia = possibiliDoppioni({ data: d, voce_id: s.voce_id, importo: +s.importo, descrizione: '' })
        .find(m => !S.scadenze_fatte.some(f => f.movimento_id === m.id));
      try { await api.insert('scadenze_fatte', [{ scadenza_id: s.id, data: d, movimento_id: gia ? gia.id : null }]); }
      catch { continue; } // già gestita da un altro dispositivo
      const f = { scadenza_id: s.id, data: d, movimento_id: gia ? gia.id : null };
      S.scadenze_fatte.push(f);
      if (gia) continue;
      const [mv] = await api.insert('movimenti', [{ data: d, voce_id: s.voce_id, importo: +s.importo, descrizione: s.titolo, metodo: s.metodo || null, note: null, creato_da: 'automatico' }]);
      S.movimenti.push(mv); f.movimento_id = mv.id; n++;
      await api.update('scadenze_fatte', { scadenza_id: s.id, data: d }, { movimento_id: mv.id });
    }
  }
  if (n) index();
  return n;
}

function scadenzeInEvidenza() {
  if (!S._scadOk) return [];
  const oggi = todayISO(), out = [];
  for (const s of S.scadenze.filter(x => x.attiva && !(x.tipo === 'movimento' && x.modalita === 'auto'))) {
    const limite = addDays(oggi, Math.max(0, +s.preavviso_gg || 0));
    for (const d of daGestire(s, limite)) {
      if (s.tipo === 'appuntamento' && d < oggi) continue;
      out.push({ s, d });
    }
  }
  return out.sort((a, b) => (a.d > b.d ? 1 : -1));
}

function scadItem(s, d, actions = true) {
  const oggi = todayISO();
  const stato = d < oggi ? 'late' : d === oggi ? 'today' : 'soon';
  const gg = Math.round((new Date(d) - new Date(oggi)) / 864e5);
  const quando = gg === 0 ? 'oggi' : gg === 1 ? 'domani' : gg === -1 ? 'ieri' : gg < 0 ? `${-gg} giorni fa` : `tra ${gg} giorni`;
  const imp = s.importo ? `<b class="${voce(s.voce_id)?.tipo === 'E' ? 'E' : 'U'}">${eur(s.importo)}</b>` : '';
  const sub = [catNome(s.categoria), s.tipo === 'appuntamento' && s.ora ? s.ora.slice(0, 5) : '', s.luogo, descriviRegola(s)].filter(Boolean).map(esc).join(' · ');
  const btns = !actions ? '' : s.tipo === 'appuntamento' ? `<button type="button" data-done="${s.id}|${d}">Fatto</button>`
    : s.voce_id ? `<button type="button" class="primary" data-pay="${s.id}|${d}">${s.tipo === 'movimento' ? 'Conferma' : 'Paga'}</button><button type="button" data-skip="${s.id}|${d}">Salta</button>`
    : `<button type="button" class="primary" data-done="${s.id}|${d}">Fatto</button>`;
  return `<div class="sitem ${stato}" data-row="${s.id}|${d}">
    <div class="s-date"><span>${+d.slice(8)}</span><small>${MESI[+d.slice(5, 7) - 1]}</small></div>
    <div class="s-main"><a href="#scadenze?id=${s.id}">${esc(s.titolo)}</a><div class="mv-sub">${sub}</div><div class="s-when ${stato}">${quando}</div></div>
    <div class="s-right">${imp}<div class="s-btns">${btns}</div></div></div>`;
}

function renderScadenze(v, params) {
  if (!S._scadOk) {
    v.innerHTML = `<section class="card"><h3>Scadenze non ancora attive</h3><p>Per usare questa sezione esegui una volta su Supabase lo script <code>supabase/v1.3_scadenze.sql</code> (SQL Editor → New query → incolla → Run), poi ricarica l'app.</p></section>`;
    return;
  }
  if (params.id || params.nuovo) return renderScadenzaForm(v, params);
  const oggi = todayISO();
  const evid = scadenzeInEvidenza();
  const daFare = evid.filter(x => x.d <= oggi), presto = evid.filter(x => x.d > oggi);
  const attive = S.scadenze.filter(s => s.attiva);
  const auto = attive.filter(s => s.tipo === 'movimento' && s.modalita === 'auto');
  const futuri = attive.filter(s => !auto.includes(s)).map(s => ({ s, d: prossima(s) })).filter(x => x.d && !evid.some(e => e.s.id === x.s.id && e.d === x.d))
    .sort((a, b) => (a.d > b.d ? 1 : -1));
  v.innerHTML = `${gcalBar()}
    <div class="actions left" style="margin:0 0 1rem">
      <a class="btn primary" href="#scadenze?nuovo=scadenza">+ Scadenza</a>
      <a class="btn" href="#scadenze?nuovo=appuntamento">+ Appuntamento</a>
      <a class="btn" href="#scadenze?nuovo=movimento">+ Movimento fisso</a></div>
    <section class="card"><h3>Da fare${daFare.length ? ` <span class="pill bad">${daFare.length}</span>` : ''}</h3>
      ${daFare.length ? daFare.map(x => scadItem(x.s, x.d)).join('') : '<p class="muted">Niente in ritardo o in scadenza oggi.</p>'}</section>
    <section class="card"><h3>In arrivo</h3><p class="muted small">Scadenze e appuntamenti entro il preavviso impostato.</p>
      ${presto.length ? presto.map(x => scadItem(x.s, x.d)).join('') : '<p class="muted">Nulla in arrivo a breve.</p>'}</section>
    <section class="card"><h3>Movimenti automatici</h3><p class="muted small">Vengono registrati da soli alla data prevista quando l'app viene aperta.</p>
      ${auto.length ? auto.map(s => { const p = prossima(s); const last = S.scadenze_fatte.filter(f => f.scadenza_id === s.id).sort((a, b) => (a.data > b.data ? -1 : 1))[0];
        return `<a class="srow" href="#scadenze?id=${s.id}"><div><b>${esc(s.titolo)}</b><div class="mv-sub">${esc(descriviRegola(s))}${last ? ` · ultimo ${fmtDate(last.data)}` : ''}</div></div>
          <div class="s-right"><b class="U">${eur(s.importo)}</b><div class="mv-sub">${p ? 'prossimo ' + fmtDate(p) : 'terminato'}</div></div></a>`; }).join('')
        : '<p class="muted">Nessun movimento automatico.</p>'}</section>
    <section class="card"><h3>Più avanti</h3>
      ${futuri.length ? futuri.map(x => scadItem(x.s, x.d, false)).join('') : '<p class="muted">Nessuna altra scadenza in programma.</p>'}</section>
    ${S.scadenze.some(s => !s.attiva) ? `<details class="card"><summary>Disattivate (${S.scadenze.filter(s => !s.attiva).length})</summary>${S.scadenze.filter(s => !s.attiva).map(s => `<a class="srow" href="#scadenze?id=${s.id}"><span>${esc(s.titolo)}</span><span class="muted small">${esc(descriviRegola(s))}</span></a>`).join('')}</details>` : ''}`;

  wireGcalBar(v);
  const key = el => { const [id, d] = el.split('|'); return { s: S.scadenze.find(x => x.id === +id), d }; };
  $$('[data-pay]', v).forEach(b => b.onclick = () => {
    const { s, d } = key(b.dataset.pay);
    const row = b.closest('.sitem');
    if (row.nextElementSibling?.classList.contains('payform')) { row.nextElementSibling.remove(); return; }
    const metodi = S.metodi.filter(m => m.attivo || m.nome === s.metodo).map(m => m.nome);
    row.insertAdjacentHTML('afterend', `<div class="payform">
      <label>Importo<input inputmode="decimal" class="pf-imp" value="${String(s.importo).replace('.', ',')}"></label>
      <label>Data<input type="date" class="pf-data" value="${d > todayISO() ? todayISO() : d}"></label>
      <label>Pagamento<select class="pf-met">${metodi.map(m => `<option ${m === s.metodo ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
      <button type="button" class="primary pf-ok">Registra ${esc(voce(s.voce_id)?.nome || '')}</button></div>`);
    const pf = row.nextElementSibling;
    pf.querySelector('.pf-ok').onclick = () => guard(async () => {
      const importo = parseAmount(pf.querySelector('.pf-imp').value);
      if (!isFinite(importo) || !importo) return toast('Importo non valido');
      try { await api.insert('scadenze_fatte', [{ scadenza_id: s.id, data: d }]); } catch { toast('Già registrata da un altro dispositivo'); return start(); }
      const [mv] = await api.insert('movimenti', [{ data: pf.querySelector('.pf-data').value, voce_id: s.voce_id, importo, descrizione: s.titolo, metodo: pf.querySelector('.pf-met').value || null, note: null }]);
      await api.update('scadenze_fatte', { scadenza_id: s.id, data: d }, { movimento_id: mv.id });
      S.movimenti.push(mv); S.scadenze_fatte.push({ scadenza_id: s.id, data: d, movimento_id: mv.id }); index();
      toast(`Registrato · ${esc(voce(s.voce_id)?.nome)} ${eur(importo)}`); route(); gcalDopoModifica();
    });
  });
  const segna = (s, d, msg) => guard(async () => {
    try { await api.insert('scadenze_fatte', [{ scadenza_id: s.id, data: d }]); } catch { /* già fatta */ }
    S.scadenze_fatte.push({ scadenza_id: s.id, data: d, movimento_id: null }); toast(msg); route(); gcalDopoModifica();
  });
  $$('[data-skip]', v).forEach(b => b.onclick = () => { const { s, d } = key(b.dataset.skip); if (confirm(`Saltare "${s.titolo}" del ${fmtDate(d)} senza registrare nulla?`)) segna(s, d, 'Saltata'); });
  $$('[data-done]', v).forEach(b => b.onclick = () => { const { s, d } = key(b.dataset.done); segna(s, d, 'Segnata come fatta'); });
}

function renderScadenzaForm(v, params) {
  const ed = params.id ? S.scadenze.find(s => String(s.id) === params.id) : null;
  if (params.id && !ed) { v.innerHTML = '<p class="muted">Voce non trovata.</p>'; return; }
  const tipo = ed?.tipo || params.nuovo || 'scadenza';
  const s = ed ? { ...ed } : { tipo, titolo: '', categoria: tipo === 'movimento' ? 'casa' : 'altro', voce_id: null, importo: null, metodo: tipo === 'movimento' ? 'Addebito diretto c/c' : null,
    modalita: tipo === 'movimento' ? 'auto' : null, freq: tipo === 'appuntamento' ? 'una' : 'mesi', intervallo: 1, regola: 'giorno', nth: 1, giorno_sett: 1,
    data_inizio: todayISO(), data_fine: null, ora: null, durata_min: 60, luogo: null, preavviso_gg: tipo === 'movimento' ? 0 : tipo === 'appuntamento' ? 2 : 10, note: null, attiva: true };
  const titoli = { movimento: 'movimento fisso', scadenza: 'scadenza', appuntamento: 'appuntamento' };
  const isMov = tipo === 'movimento', isApp = tipo === 'appuntamento';
  const sel = (arr, val) => arr.map(([k, l]) => `<option value="${k}" ${String(k) === String(val ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
  v.innerHTML = `<form id="sf" class="card form" autocomplete="off">
    <h2>${ed ? 'Modifica' : 'Nuovo'} ${titoli[tipo]}</h2>
    ${isMov ? `<p class="muted small">Un movimento che si ripete sempre uguale (es. mutuo, abbonamenti). In automatico viene registrato da solo; "da confermare" te lo propone e lo confermi tu.</p>` : ''}
    <label>Titolo<input id="sTit" required value="${esc(s.titolo)}" placeholder="${isMov ? 'es. Rata mutuo' : isApp ? 'es. Visita pediatra Rebecca' : 'es. Rata condominio, Assicurazione casa'}"></label>
    <div class="row2b">
      <label>Categoria<select id="sCat">${sel(CAT_SCAD, s.categoria)}</select></label>
      ${isApp ? '' : `<label>Voce di budget${isMov ? '' : ' (per registrare il pagamento)'}<select id="sVoce"><option value="">${isMov ? 'Scegli…' : 'Nessuna'}</option>${S.macro.map(g => { const vs = S.voci.filter(x => x.macro === g.codice && (x.attiva || x.id === s.voce_id)); return vs.length ? `<optgroup label="${esc(g.nome)}">${vs.map(x => `<option value="${x.id}" ${x.id === s.voce_id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select></label>`}
    </div>
    ${isApp ? '' : `<div class="row2b">
      <label>Importo${isMov ? '' : ' previsto'}<input id="sImp" inputmode="decimal" value="${s.importo != null ? String(s.importo).replace('.', ',') : ''}" placeholder="0,00"></label>
      <label>Pagamento<select id="sMet"><option value="">—</option>${sel(S.metodi.map(m => [m.nome, m.nome]), s.metodo)}</select></label></div>`}
    ${isMov ? `<div class="field"><span class="lbl">Modalità</span><div class="seg" id="sMod"><button type="button" data-m="auto">Automatico</button><button type="button" data-m="conferma">Da confermare</button></div></div>` : ''}
    <h4>Quando</h4>
    <div class="row2b">
      <label>Si ripete<select id="sFreq">${sel([['una', 'Una volta'], ['settimane', 'Ogni settimana / N settimane'], ['mesi', 'Ogni mese / N mesi'], ['anni', 'Ogni anno / N anni']], s.freq)}</select></label>
      <label id="lInt">Ogni quanti<input id="sInt" type="number" min="1" max="60" value="${s.intervallo}"></label></div>
    <div class="row2b" id="rRegola">
      <label>Giorno<select id="sReg">${sel([['giorno', 'Stesso giorno della data di inizio'], ['primo_feriale', 'Primo giorno lavorativo'], ['ultimo', 'Ultimo giorno del mese'], ['nth', 'Un giorno della settimana (es. 1° lunedì)']], s.regola)}</select></label>
      <div class="row2b" id="rNth"><label>Quale<select id="sNth">${sel([[1, '1°'], [2, '2°'], [3, '3°'], [4, '4°'], [-1, 'Ultimo']], s.nth)}</select></label>
        <label>Giorno<select id="sWd">${sel(GIORNI.map((g, i) => [i + 1, g]), s.giorno_sett)}</select></label></div></div>
    <div class="row2b">
      <label><span id="lInizio">${s.freq === 'una' ? 'Data' : 'A partire dal'}</span><input type="date" id="sIni" required value="${s.data_inizio}"></label>
      <label id="lFine">Fino al (facoltativo)<input type="date" id="sFin" value="${s.data_fine || ''}"></label></div>
    ${isApp ? `<div class="row2b"><label>Ora<input type="time" id="sOra" value="${s.ora ? s.ora.slice(0, 5) : ''}"></label><label>Durata (minuti)<input type="number" id="sDur" min="0" step="15" value="${s.durata_min || ''}"></label></div>
      <label>Luogo<input id="sLuogo" value="${esc(s.luogo || '')}"></label>` : ''}
    ${isMov && s.modalita === 'auto' ? '' : `<label id="lPre">Avvisami quanti giorni prima<input type="number" id="sPre" min="0" max="120" value="${s.preavviso_gg}"></label>`}
    <div class="preview" id="sPrev"></div>
    <label>Note<textarea id="sNote" rows="2">${esc(s.note || '')}</textarea></label>
    ${ed ? `<label class="switch"><input type="checkbox" id="sAtt" ${s.attiva ? 'checked' : ''}> attiva</label>` : ''}
    <p class="err" id="sErr"></p>
    <div class="actions"><button class="primary" type="submit">Salva</button>
      ${ed ? '<button type="button" class="danger" id="sDel">Elimina</button>' : ''}<button type="button" id="sBack">Annulla</button></div>
  </form>`;
  const read = () => ({
    titolo: $('#sTit').value.trim(), categoria: $('#sCat').value, voce_id: $('#sVoce') ? (+$('#sVoce').value || null) : null,
    importo: $('#sImp') && $('#sImp').value.trim() ? parseAmount($('#sImp').value) : null, metodo: $('#sMet') ? ($('#sMet').value || null) : null,
    modalita: isMov ? s.modalita : null, freq: $('#sFreq').value, intervallo: Math.max(1, +$('#sInt').value || 1), regola: $('#sReg').value,
    nth: +$('#sNth').value, giorno_sett: +$('#sWd').value, data_inizio: $('#sIni').value, data_fine: $('#sFin').value || null,
    ora: $('#sOra') ? ($('#sOra').value || null) : null, durata_min: $('#sDur') ? (+$('#sDur').value || null) : null, luogo: $('#sLuogo') ? ($('#sLuogo').value.trim() || null) : null,
    preavviso_gg: $('#sPre') ? Math.max(0, +$('#sPre').value || 0) : 0, note: $('#sNote').value.trim() || null, attiva: $('#sAtt') ? $('#sAtt').checked : true,
  });
  const upd = () => {
    const r = read();
    $$('#sMod button').forEach(b => b.classList.toggle('on', b.dataset.m === s.modalita));
    $('#lInt').style.display = r.freq === 'una' ? 'none' : '';
    $('#rRegola').style.display = r.freq === 'mesi' || r.freq === 'anni' ? '' : 'none';
    $('#rNth').style.display = r.regola === 'nth' ? '' : 'none';
    $('#lFine').style.display = r.freq === 'una' ? 'none' : '';
    $('#lInizio').textContent = r.freq === 'una' ? 'Data' : 'A partire dal';
    if (!r.data_inizio) { $('#sPrev').innerHTML = ''; return; }
    const prova = { ...r, id: ed?.id ?? -1 };
    const date = occorrenze(prova, todayISO() < r.data_inizio ? r.data_inizio : todayISO(), addDays(todayISO(), 1500)).slice(0, 4);
    $('#sPrev').innerHTML = `<b>${esc(descriviRegola(prova))}</b><br>${date.length ? 'Prossime date: ' + date.map(d => `${GIORNI[(new Date(d + 'T12:00').getDay() + 6) % 7].slice(0, 3)} ${fmtDate(d)}`).join(' · ') : 'Nessuna data futura.'}`;
  };
  upd();
  $('#sf').oninput = upd; $('#sf').onchange = upd;
  const mod = $('#sMod'); if (mod) mod.onclick = e => { if (e.target.dataset.m) { s.modalita = e.target.dataset.m; upd(); } };
  $('#sBack').onclick = () => { location.hash = '#scadenze'; };
  $('#sf').onsubmit = e => {
    e.preventDefault();
    guard(async () => {
      const r = read();
      const err = !r.titolo ? 'Scrivi un titolo' : !r.data_inizio ? 'Indica la data' : isMov && !r.voce_id ? 'Scegli la voce di budget' : isMov && !(r.importo > 0 || r.importo < 0) ? "Indica l'importo"
        : r.importo !== null && !isFinite(r.importo) ? 'Importo non valido' : r.data_fine && r.data_fine < r.data_inizio ? 'La data di fine è prima di quella di inizio' : '';
      $('#sErr').textContent = err; if (err) return;
      r.tipo = tipo;
      if (!isMov) r.modalita = null;
      if (r.regola !== 'nth') { r.nth = null; r.giorno_sett = null; }
      if (ed) {
        const [x] = await api.update('scadenze', { id: ed.id }, r); Object.assign(ed, x || r);
      } else {
        const [x] = await api.insert('scadenze', [r]); S.scadenze.push(x);
      }
      const n = await registraAutomatici();
      toast('Salvato' + (n ? ` · ${n} movimenti registrati` : '')); location.hash = '#scadenze'; gcalDopoModifica();
    });
  };
  if (ed) $('#sDel').onclick = () => guard(async () => {
    if (!confirm(`Eliminare "${ed.titolo}"? I movimenti già registrati restano nel budget.`)) return;
    await api.remove('scadenze', { id: ed.id });
    S.scadenze = S.scadenze.filter(x => x.id !== ed.id); S.scadenze_fatte = S.scadenze_fatte.filter(f => f.scadenza_id !== ed.id);
    toast('Eliminato'); location.hash = '#scadenze'; gcalDopoModifica();
  });
}

// ------------------------------------------------------------------ GOOGLE CALENDAR
const gcfg = () => S.imp.gcal || {};
const gcalAttivo = () => !!(S._impOk && S.imp.google_client_id && gcfg().calendarId);
async function setImp(chiave, valore) {
  await api.upsert('impostazioni', [{ chiave, valore }]);
  S.imp[chiave] = valore;
}
function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
const hm = t => { const [h, m] = (t || '09:00').split(':').map(Number); return h * 60 + m; };
const dt = (d, minuti) => `${d}T${pad2(Math.floor(minuti / 60))}:${pad2(minuti % 60)}:00`;
const clampRem = arr => [...new Set(arr.filter(m => m >= 0 && m <= 40320))].slice(0, 5).map(minutes => ({ method: 'popup', minutes }));

function eventoGoogle(s, d, fatto) {
  const imp = s.importo ? ` · ${eur(s.importo)}` : '';
  const vn = voce(s.voce_id)?.nome;
  const link = `${location.origin}${location.pathname}#scadenze?id=${s.id}`;
  const p = Math.max(0, +s.preavviso_gg || 0);
  let summary, start, end, rem = [], colorId;
  const desc = [];
  if (s.tipo === 'movimento') {
    const auto = s.modalita === 'auto';
    summary = auto ? `${s.titolo}${imp} · addebito automatico` : `Da confermare: ${s.titolo}${imp}`;
    start = { dateTime: dt(d, 540), timeZone: 'Europe/Rome' }; end = { dateTime: dt(d, 555), timeZone: 'Europe/Rome' };
    rem = auto || !fatto ? [0] : [];
    colorId = auto ? '10' : '5';
    desc.push(auto ? `Registrato automaticamente nel budget${vn ? ` alla voce "${vn}"` : ''}.` : `Da confermare nell'app (sezione Scadenze)${vn ? `, voce "${vn}"` : ''}.`);
  } else if (s.tipo === 'appuntamento' && s.ora) {
    const t = hm(s.ora), dur = +s.durata_min || 60;
    summary = s.titolo;
    start = { dateTime: dt(d, t), timeZone: 'Europe/Rome' };
    end = t + dur < 1440 ? { dateTime: dt(d, t + dur), timeZone: 'Europe/Rome' } : { dateTime: dt(d, 1439), timeZone: 'Europe/Rome' };
    rem = fatto ? [] : [60, ...(p >= 1 ? [p * 1440 + t - 540] : [])];
    colorId = '9';
  } else {
    summary = `${s.tipo === 'scadenza' ? 'Scadenza: ' : ''}${s.titolo}${imp}`;
    start = { date: d }; end = { date: addDays(d, 1) };
    rem = fatto ? [] : [900, ...(p >= 1 ? [p * 1440 - 540] : [])]; // 9:00 del giorno prima e del giorno di preavviso
    colorId = s.tipo === 'appuntamento' ? '9' : '6';
  }
  if (fatto) { summary = '✓ ' + summary; if (s.tipo !== 'movimento' || s.modalita !== 'auto') colorId = '8'; }
  if (s.luogo) desc.push('Luogo: ' + s.luogo);
  if (s.note) desc.push(s.note);
  desc.push(descriviRegola(s) + ' · ' + catNome(s.categoria), 'Apri nell\'app: ' + link);
  const ev = {
    id: `bf${s.id}d${d.replace(/-/g, '')}`, summary, description: desc.join('\n'), start, end, colorId,
    location: s.luogo || undefined, transparency: 'transparent',
    reminders: { useDefault: false, overrides: clampRem(rem) },
  };
  ev.extendedProperties = { private: { bf: '1', sid: String(s.id), d, h: hashStr(JSON.stringify(ev)) } };
  return ev;
}
function eventiDesiderati(from, to) {
  const out = [];
  for (const s of S.scadenze) {
    if (!s.attiva || s.tipo === 'movimento') continue; // in calendario solo scadenze e appuntamenti
    const done = fatte(s.id);
    for (const d of occorrenze(s, from, to)) out.push(eventoGoogle(s, d, done.has(d)));
  }
  return out;
}

let gcalBusy = false;
async function gcalSync(interattivo, onProgress) {
  if (!gcalAttivo() || gcalBusy) return null;
  const cfg = gcfg();
  if (!gTokenValid()) {
    if (!interattivo) { if (!cfg.daSync) await setImp('gcal', { ...cfg, daSync: true }); return null; }
    await gLogin(S.imp.google_client_id, cfg.account);
  }
  gcalBusy = true;
  try {
    const from = addDays(todayISO(), -60), to = addDays(todayISO(), 365);
    const r = await gSync(cfg.calendarId, eventiDesiderati(from, to), from, to, onProgress);
    await setImp('gcal', { ...gcfg(), ultimaSync: new Date().toISOString(), daSync: false, da: me() });
    return r;
  } finally { gcalBusy = false; }
}
// dopo ogni modifica: sincronizza subito se l'accesso Google è attivo, altrimenti segna "da sincronizzare"
function gcalDopoModifica() {
  if (!gcalAttivo()) return;
  guard(async () => { const r = await gcalSync(false); if (r && (r.nuovi || r.aggiornati || r.eliminati)) toast('Google Calendar aggiornato'); });
}
const fmtQuando = isoTs => { const d = new Date(isoTs); return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) + ' alle ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); };

function gcalBar() {
  if (!gcalAttivo()) return S._impOk && !S.imp.gcal?.calendarId ? `<a class="card gbar" href="#impostazioni">${icon('calendar')}<span>Collega Google Calendar per ricevere le notifiche sul telefono</span><span class="go">→</span></a>` : '';
  const c = gcfg(), vecchia = !c.ultimaSync || Date.now() - new Date(c.ultimaSync) > 7 * 864e5;
  return `<div class="card gbar ${c.daSync || vecchia ? 'warn' : ''}">${icon('calendar')}<span>${c.daSync ? '<b>Modifiche da inviare a Google Calendar</b>' : c.ultimaSync ? `Google Calendar aggiornato il ${fmtQuando(c.ultimaSync)}` : 'Google Calendar non ancora sincronizzato'}</span>
    <button type="button" id="gSyncBar">Sincronizza</button></div>`;
}
function wireGcalBar(v) {
  const b = $('#gSyncBar', v); if (!b) return;
  b.onclick = () => guard(async () => {
    b.disabled = true; b.textContent = 'In corso…';
    try {
      const r = await gcalSync(true, (n, t) => { b.textContent = `${n}/${t}`; });
      if (r) toast(`Calendario aggiornato: ${r.nuovi} nuovi, ${r.aggiornati} modificati, ${r.eliminati} tolti`);
    } finally { route(); }
  });
}

function gcalSection() {
  if (!S._impOk) return `<section class="card"><h3>Google Calendar</h3><p class="muted small">Per attivarlo esegui una volta su Supabase lo script <code>supabase/v1.4_impostazioni.sql</code>, poi ricarica l'app.</p></section>`;
  const c = gcfg(), cid = S.imp.google_client_id || '';
  return `<section class="card" id="gcal"><h3>Google Calendar e notifiche</h3>
    <p class="muted small">Scadenze e appuntamenti vengono copiati in un calendario Google "Famiglia – Scadenze", con le notifiche sul telefono. Guida completa nel file LEGGIMI della versione 1.4.</p>
    <label>ID client Google (da Google Cloud)<input id="gCid" value="${esc(cid)}" placeholder="123456789-abc….apps.googleusercontent.com"></label>
    ${!cid ? '' : c.calendarId ? `
      <div class="ginfo"><div><small class="muted">Calendario</small><b>${esc(c.nome || 'Famiglia – Scadenze')}</b></div>
        <div><small class="muted">Account Google</small><b>${esc(c.account || '—')}</b></div>
        <div><small class="muted">Ultima sincronizzazione</small><b>${c.ultimaSync ? fmtQuando(c.ultimaSync) + (c.da ? ' (' + esc(c.da) + ')' : '') : 'mai'}</b></div></div>
      <div class="actions left"><button type="button" class="primary" id="gSync">Sincronizza ora</button><button type="button" id="gOff">Scollega</button></div>
      <h4>Condividi il calendario</h4>
      <p class="muted small">Invia l'invito a un account Google (es. quello personale di Simona). Riceverà le notifiche secondo le sue impostazioni per questo calendario.</p>
      <div class="vrow add"><input id="gMail" type="email" placeholder="email Google"><select id="gRole"><option value="reader">Solo lettura</option><option value="writer">Può modificare</option></select><button type="button" id="gShare">Invia invito</button></div>`
      : `<div class="actions left"><button type="button" class="primary" id="gConn">Accedi a Google e crea il calendario</button></div>
         <p class="muted small">Accedi con l'<b>account Google di famiglia</b>. Se compare "Google non ha verificato questa app", scegli Avanzate → Vai a … (non sicura): l'app è la vostra.</p>`}
    <p class="err" id="gErr"></p></section>`;
}
function wireGcal(v) {
  const sec = $('#gcal', v); if (!sec) return;
  const err = m => { $('#gErr').textContent = m || ''; };
  const run = fn => async () => { err(''); try { await fn(); } catch (e) { console.error(e); err(e.message); } };
  $('#gCid').onchange = run(async () => {
    const val = $('#gCid').value.trim();
    if (val && !/\.apps\.googleusercontent\.com$/.test(val)) return err("L'ID client deve finire con .apps.googleusercontent.com");
    await setImp('google_client_id', val); toast('ID client salvato'); renderImpostazioni(v);
  });
  const conn = $('#gConn');
  if (conn) conn.onclick = run(async () => {
    conn.disabled = true; conn.textContent = 'Accesso a Google…';
    try {
      await gLogin(S.imp.google_client_id);
      const prim = await gPrimary();
      conn.textContent = 'Creo il calendario…';
      const cal = await gCreateCalendar('Famiglia – Scadenze');
      await setImp('gcal', { calendarId: cal.id, nome: cal.summary, account: prim.id, daSync: true });
      conn.textContent = 'Copio le scadenze…';
      const r = await gcalSync(true);
      toast(`Calendario creato · ${r ? r.nuovi : 0} eventi inseriti`);
    } finally { renderImpostazioni(v); }
  });
  const sy = $('#gSync');
  if (sy) sy.onclick = run(async () => {
    sy.disabled = true; sy.textContent = 'In corso…';
    try {
      const r = await gcalSync(true, (n, t) => { sy.textContent = `${n}/${t}`; });
      if (r) toast(`Calendario aggiornato: ${r.nuovi} nuovi, ${r.aggiornati} modificati, ${r.eliminati} tolti`);
    } finally { renderImpostazioni(v); }
  });
  const off = $('#gOff');
  if (off) off.onclick = run(async () => {
    if (!confirm("Scollegare Google Calendar? Il calendario e i suoi eventi restano su Google (puoi eliminarli da lì); l'app smette di aggiornarlo.")) return;
    gLogout(); await setImp('gcal', {}); toast('Google Calendar scollegato'); renderImpostazioni(v);
  });
  const sh = $('#gShare');
  if (sh) sh.onclick = run(async () => {
    const mail = $('#gMail').value.trim(); if (!/^\S+@\S+\.\S+$/.test(mail)) return err('Scrivi un indirizzo email valido');
    if (!gTokenValid()) await gLogin(S.imp.google_client_id, gcfg().account);
    await gShare(gcfg().calendarId, mail, $('#gRole').value);
    toast('Invito inviato a ' + mail); $('#gMail').value = '';
  });
}


// ------------------------------------------------------------------ SCONTRINI: voce proposta e impostazioni
// cosa c'è sullo scontrino (vale più del nome del negozio)
const ARTICOLI = [
  [/CAPPUCCIN|CAFF[EÈ']|ESPRESSO|BRIOCHE|CORNETTO|CROISSANT|GELATO|APERITIVO|SPRITZ/, 'Tempo Libero'],
  [/BENZINA|GASOLIO|DIESEL|SELF\s*SERVICE|CARBURANTE|\bGPL\b|METANO/, 'Spese Auto'],
  [/FARMAC|TICKET|PRESTAZIONE SANITARIA|MEDICINAL/, 'Spese Mediche'],
  [/COPERTO|PIZZA|PRIMO|SECONDO|MENU/, 'Ristorante'],
];
const NEGOZI = [
  [/esselunga|coop|conad|lidl|carrefour|eurospin|aldi|penny|\bpam\b|iper|bennet|tigros|famila|despar|\bmd\b|in's|unes|crai|sigma|supermerc|market/i, 'Supermercato'],
  [/farmacia|parafarm|sanitari|ottica|dentist|medic/i, 'Spese Mediche'],
  [/ristorante|pizzeria|trattoria|osteria|sushi|braceria|mcdonald|burger/i, 'Ristorante'],
  [/\bbar\b|caff|gelat|pasticc/i, 'Tempo Libero'],
  [/decathlon|piscina|palestra|ippic|maneggio|equitazione/i, 'Sport e attività ludiche'],
  [/zara|h&m|ovs|primark|calzedonia|coin|benetton/i, 'Shopping'],
];
function suggerisciVoce(negozio, articoli = '') {
  if (!negozio && !articoli) return null;
  negozio = negozio || '';
  const parole = negozio.toLowerCase().split(/[^a-zà-ú0-9]+/).filter(w => w.length >= 3 && !['farmacia', 'bar', 'ristorante', 'pizzeria', 'supermercato', 'negozio', 'store', 'shop', 'punto', 'vendita', 'market', 'spa', 'srl', 'via', 'centro', 'easy', 'the', 'del', 'della', 'dei', 'club', 'snc', 'sas', 'group', 'italia'].includes(w));
  if (parole.length) {
    const c = new Map();
    for (const m of S.movimenti.slice(0, 4000)) {
      const d = (m.descrizione || '').toLowerCase();
      const hit = parole.filter(w => d.includes(w)).length;
      if (d && hit >= Math.min(2, parole.length) && tipoMov(m) === 'U' && voce(m.voce_id)?.attiva) c.set(m.voce_id, (c.get(m.voce_id) || 0) + 1);
    }
    const best = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2) return voce(best[0]);
  }
  const daArticoli = ARTICOLI.find(([re]) => re.test(articoli));
  const regole = daArticoli ? [daArticoli, ...NEGOZI] : NEGOZI;
  for (const [re, nome] of regole) if (re.test(negozio) || re === daArticoli?.[0]) {
    const v = S.voci.find(x => x.attiva && x.tipo === 'U' && x.nome.toLowerCase().startsWith(nome.toLowerCase()));
    if (v) return v;
  }
  return null;
}
function visionSection() {
  if (!S._impOk) return '';
  const k = S.imp.vision_key || '';
  return `<section class="card" id="vis"><h3>Lettura automatica degli scontrini</h3>
    <p class="muted small">Con il pulsante "Leggi scontrino" l'app fotografa lo scontrino e compila importo, data, negozio e pagamento. La foto serve solo per la lettura: non viene salvata né nell'app né nel rullino. Serve una chiave di Google Cloud Vision (gratis fino a 1.000 letture al mese): guida nel LEGGIMI della versione 1.5.</p>
    <label>Chiave API Google Vision<input id="vKey" value="${esc(k)}" placeholder="AIza…" autocomplete="off"></label>
    <p class="small ${k ? 'ok-t' : 'muted'}">${k ? 'Lettura attiva.' : 'Non attiva: il pulsante "Leggi scontrino" comparirà dopo aver inserito la chiave.'}</p></section>`;
}
function wireVision(v) {
  const i = $('#vKey', v); if (!i) return;
  i.onchange = () => guard(async () => {
    const val = i.value.trim();
    if (val && !/^AIza[0-9A-Za-z_-]{30,}$/.test(val)) { toast('La chiave deve iniziare con "AIza…"'); return; }
    await setImp('vision_key', val); toast(val ? 'Lettura scontrini attivata' : 'Lettura scontrini disattivata'); renderImpostazioni(v);
  });
}


// ------------------------------------------------------------------ AGGIORNAMENTO AUTOMATICO
// se online c'è una versione più recente, ricarica la pagina scavalcando la cache del telefono
async function controllaAggiornamento() {
  try {
    const t = await (await fetch('js/novita.js?t=' + Date.now(), { cache: 'no-store' })).text();
    const v = (t.match(/v:\s*'([\d.]+)'/) || [])[1];
    if (v && confrontaVersioni(v, VERSIONE) > 0 && sessionStorage.getItem('bf.ricarica') !== v) {
      sessionStorage.setItem('bf.ricarica', v);
      location.replace(location.pathname + '?v=' + v + location.hash);
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (api.mode !== 'demo' && !api.user) start(); else controllaAggiornamento(); } });

// ------------------------------------------------------------------ NOVITÀ
// Al primo avvio dopo un aggiornamento mostra le novità delle versioni non ancora viste (su questo dispositivo)
function confrontaVersioni(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}
function mostraNovita(tutte) {
  const vista = store.get('versioneVista', null);
  if (!tutte && vista === VERSIONE) return;
  // primo utilizzo su questo dispositivo: mostra solo l'ultima versione
  const elenco = tutte ? NOVITA : vista ? NOVITA.filter(n => confrontaVersioni(n.v, vista) > 0) : NOVITA.slice(0, 1);
  store.set('versioneVista', VERSIONE);
  if (!elenco.length) return;
  document.querySelector('.novita')?.remove();
  const el = document.createElement('div');
  el.className = 'novita';
  el.innerHTML = `<div class="nov-card" role="dialog" aria-modal="true" aria-labelledby="novT">
    <h2 id="novT">${tutte ? 'Novità delle versioni' : `Novità della versione ${esc(VERSIONE)}`}</h2>
    <div class="nov-body">${elenco.map(n => `<section><h4>Versione ${esc(n.v)} · ${esc(n.data)}</h4><ul>${n.voci.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>`).join('')}</div>
    <button type="button" class="primary" id="novOk">Ho capito</button></div>`;
  document.body.appendChild(el);
  const chiudi = () => el.remove();
  el.querySelector('#novOk').onclick = chiudi;
  el.onclick = e => { if (e.target === el) chiudi(); };
  el.querySelector('#novOk').focus();
}

// ------------------------------------------------------------------ STIPENDIO (privato, solo per l'account autorizzato)
const PERIODI = [...MESI_L.map(m => m[0].toUpperCase() + m.slice(1)), '13ª', '14ª'];
const CAMPI = [['trasferta', 'Trasferta'], ['premi', 'Premi'], ['lordo', 'Lordo'], ['rimborso', 'Rimborso'], ['netto', 'Netto'], ['vettura', 'Vettura']];
const nsr = r => r && r.netto != null ? r.netto - (r.rimborso || 0) : null;
const stipAnno = y => { const m = new Map(); S.stipendio.filter(r => r.anno === y).forEach(r => m.set(r.mese, r)); return m; };
const eurN = v => v == null ? '—' : eur0(v);

function renderStipendio(v, params) {
  if (!S._stip) { v.innerHTML = '<p class="muted">Sezione non disponibile per questo account.</p>'; return; }
  if (params.mese) return renderStipendioForm(v, params);
  const anni = [...new Set([TODAY.getFullYear(), ...S.stipendio.map(r => r.anno)])].sort((a, b) => b - a);
  const y = UI.stipAnno || anni[0]; UI.stipAnno = y;
  const cur = stipAnno(y), prev = stipAnno(y - 1);
  const somma = (map, f, soloMesi) => sum([...map.values()].filter(r => !soloMesi || r.mese <= 12), f);
  const mesiCon = [...cur.values()].filter(r => r.netto != null);
  const totN = somma(cur, nsr), totP = sum([...prev.values()].filter(r => cur.has(r.mese)), nsr);
  const mediaN = mesiCon.length ? sum(mesiCon, nsr) / mesiCon.length : 0;
  v.innerHTML = `
    <div class="yearbar"><label>Anno <select id="stA">${anni.map(a => `<option ${a === y ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <span class="muted small">🔒 visibile solo a questo account</span>
      <a class="btn primary" href="#stipendio?mese=nuovo">+ Inserisci mese</a></div>
    <section class="kpis">
      <div class="kpi"><small>Netto senza rimborso ${y}</small><b>${eur0(totN)}</b><span>${totP ? `${totN >= totP ? '+' : ''}${eur0(totN - totP)} vs ${y - 1} (stessi mesi)` : ''}</span></div>
      <div class="kpi"><small>Media netto s/r (mesi + 13ª e 14ª)</small><b>${eur0(mediaN)}</b><span>su ${mesiCon.length} ${mesiCon.length === 1 ? 'mensilità inserita' : 'mensilità inserite'}</span></div>
      <div class="kpi"><small>Lordo ${y}</small><b>${eur0(somma(cur, r => r.lordo))}</b><span>premi ${eur0(somma(cur, r => r.premi))}</span></div>
    </section>
    <section class="card"><h3>Netto senza rimborso: ${y} e ${y - 1}</h3>
      <div class="legend"><span><i style="background:${COL.accent}"></i>${y}</span><span><i style="background:${COL.prev}"></i>${y - 1}</span></div>
      <div id="chSt"></div></section>
    <section class="card"><h3>Dettaglio ${y}</h3><p class="muted small">Tocca una riga per modificarla.</p>
      <div class="stab"><table><thead><tr><th></th>${CAMPI.map(c => `<th>${c[1]}</th>`).join('')}<th>Netto s/r</th><th>vs ${y - 1}</th></tr></thead><tbody>
      ${PERIODI.map((p, i) => { const r = cur.get(i + 1), q = prev.get(i + 1); const d = r && q && nsr(r) != null && nsr(q) != null ? nsr(r) - nsr(q) : null;
        return `<tr data-m="${i + 1}" class="${r ? '' : 'vuoto'}"><th>${p}</th>${CAMPI.map(c => `<td>${r ? eurN(r[c[0]]) : ''}</td>`).join('')}<td><b>${r ? eurN(nsr(r)) : ''}</b></td><td class="${d == null ? '' : d >= 0 ? 'E' : 'bad'}">${d == null ? '' : (d >= 0 ? '+' : '') + eur0(d)}</td></tr>`; }).join('')}
      </tbody><tfoot><tr><th>Totale</th>${CAMPI.map(c => `<td>${eur0(somma(cur, r => r[c[0]]))}</td>`).join('')}<td><b>${eur0(totN)}</b></td><td class="${totN - totP >= 0 ? 'E' : 'bad'}">${totP ? (totN - totP >= 0 ? '+' : '') + eur0(totN - totP) : ''}</td></tr></tfoot></table></div></section>
    <section class="card"><h3>Netto annuo negli anni</h3><p class="muted small">Netto senza rimborso, 13ª e 14ª comprese.</p><div id="chStY"></div></section>`;
  $('#stA').onchange = e => { UI.stipAnno = +e.target.value; renderStipendio(v, {}); };
  $$('.stab tbody tr', v).forEach(tr => tr.onclick = () => { location.hash = `#stipendio?mese=${tr.dataset.m}&anno=${y}`; });
  columns($('#chSt'), { labels: [...MESI, '13ª', '14ª'], tipLabels: PERIODI, height: 220, fmt: eur0,
    series: [{ name: String(y), color: COL.accent, values: PERIODI.map((_, i) => nsr(cur.get(i + 1)) || 0) }, { name: String(y - 1), color: COL.prev, values: PERIODI.map((_, i) => nsr(prev.get(i + 1)) || 0) }] });
  const ya = [...anni].sort((a, b) => a - b);
  line($('#chStY'), { labels: ya.map(String), values: ya.map(a => sum(S.stipendio.filter(r => r.anno === a), nsr)), color: COL.E, fmt: eur0, height: 220,
    tipLabels: ya.map(a => a === TODAY.getFullYear() ? `${a} (in corso)` : String(a)) });
}

function renderStipendioForm(v, params) {
  const y = +(params.anno || UI.stipAnno || TODAY.getFullYear());
  let m = params.mese === 'nuovo' ? null : +params.mese;
  if (!m) { const fatti = stipAnno(y); m = [...Array(14)].map((_, i) => i + 1).find(i => !fatti.has(i)) || 1; }
  const r = S.stipendio.find(x => x.anno === y && x.mese === m);
  const p = S.stipendio.find(x => x.anno === y && x.mese === (m === 1 ? 12 : m - 1)) || S.stipendio.find(x => x.anno === y - 1 && x.mese === 12);
  v.innerHTML = `<form id="stf" class="card form" autocomplete="off"><h2>Stipendio</h2>
    <div class="row2b"><label>Anno<input id="fA" type="number" value="${y}"></label>
      <label>Mese<select id="fM">${PERIODI.map((x, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
    ${CAMPI.map(([k, l]) => `<label>${l}<input inputmode="decimal" data-k="${k}" value="${r && r[k] != null ? String(r[k]).replace('.', ',') : ''}" placeholder="${!r && p && p[k] != null && (k === 'trasferta' || k === 'vettura') ? String(p[k]).replace('.', ',') : ''}"></label>`).join('')}
    <p class="muted small" id="fNsr"></p><p class="err" id="fErr"></p>
    <div class="actions"><button class="primary" type="submit">Salva</button>${r ? '<button type="button" class="danger" id="fDel">Elimina</button>' : ''}<button type="button" id="fBack">Annulla</button></div></form>`;
  const calc = () => { const n = parseAmount($('[data-k=netto]').value), rb = parseAmount($('[data-k=rimborso]').value) || 0; $('#fNsr').textContent = isFinite(n) ? `Netto senza rimborso: ${eur(n - rb)}` : ''; };
  calc(); $('#stf').oninput = calc;
  $('#fM').onchange = () => { location.hash = `#stipendio?mese=${$('#fM').value}&anno=${$('#fA').value}`; };
  $('#fBack').onclick = () => { location.hash = '#stipendio'; };
  $('#stf').onsubmit = e => { e.preventDefault(); guard(async () => {
    const row = { anno: +$('#fA').value, mese: +$('#fM').value };
    for (const [k] of CAMPI) { const s = $(`[data-k=${k}]`).value.trim(); const n = s ? parseAmount(s) : null; if (s && !isFinite(n)) { $('#fErr').textContent = 'Controlla gli importi'; return; } row[k] = n; }
    if (row.netto == null) { $('#fErr').textContent = 'Inserisci almeno il netto'; return; }
    await api.upsert('stipendio', [row]);
    S.stipendio = S.stipendio.filter(x => !(x.anno === row.anno && x.mese === row.mese)).concat(row);
    UI.stipAnno = row.anno; toast('Salvato'); location.hash = '#stipendio';
  }); };
  if (r) $('#fDel').onclick = () => guard(async () => {
    if (!confirm(`Eliminare ${PERIODI[m - 1]} ${y}?`)) return;
    await api.remove('stipendio', { anno: y, mese: m }); S.stipendio = S.stipendio.filter(x => x !== r); toast('Eliminato'); location.hash = '#stipendio';
  });
}

// ------------------------------------------------------------------ PERIODI (grafici comandabili)
const GRAN = [['M', 'Mese'], ['T', 'Trimestre'], ['S', 'Semestre'], ['A', 'Anno'], ['B', 'Biennio']];
const ym = d => d.slice(0, 7);
const addMonths = (s, n) => { let [y, m] = s.split('-').map(Number); m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; return `${y}-${String(m).padStart(2, '0')}`; };
const lastDay = s => { const [y, m] = s.split('-').map(Number); return `${s}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
function buckets(from, to, g) {
  const size = { M: 1, T: 3, S: 6, A: 12, B: 24 }[g];
  let [y, m] = from.split('-').map(Number);
  if (g !== 'M') m = Math.floor((m - 1) / (g === 'B' ? 12 : size)) * (g === 'B' ? 12 : size) + 1;
  let cur = `${y}-${String(m).padStart(2, '0')}`;
  const out = [];
  while (cur <= to && out.length < 400) {
    const end = addMonths(cur, size - 1);
    const [cy, cm] = cur.split('-').map(Number);
    const yy = String(cy).slice(2);
    const label = { M: `${MESI[cm - 1]} ${yy}`, T: `T${Math.ceil(cm / 3)} ${yy}`, S: `S${cm <= 6 ? 1 : 2} ${yy}`, A: String(cy), B: `${cy}–${String(cy + 1).slice(2)}` }[g];
    const long = { M: `${MESI_L[cm - 1]} ${cy}`, T: `${Math.ceil(cm / 3)}° trimestre ${cy}`, S: `${cm <= 6 ? 1 : 2}° semestre ${cy}`, A: `anno ${cy}`, B: `biennio ${cy}–${cy + 1}` }[g];
    out.push({ label, long, start: `${cur}-01`, end: lastDay(end) });
    cur = addMonths(cur, size);
  }
  return out;
}
function periodState(key, def) {
  UI[key] ||= store.get(key, def);
  return UI[key];
}
function periodControls(host, key, bounds, onChange) {
  const st = UI[key];
  const today = ym(todayISO());
  const quick = [['12m', 'Ultimi 12 mesi', addMonths(today, -11)], ['24m', 'Ultimi 2 anni', addMonths(today, -23)], ['60m', 'Ultimi 5 anni', addMonths(today, -59)], ['all', 'Tutto', bounds.min]];
  host.innerHTML = `<div class="pctl">
    <div class="seg small">${GRAN.map(([k, l]) => `<button type="button" data-g="${k}" class="${st.g === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="chips">${quick.map(([k, l]) => `<button type="button" class="chip ${st.q === k ? 'on' : ''}" data-q="${k}">${l}</button>`).join('')}</div>
    <div class="pdates"><label>Dal<input type="month" data-f value="${st.from}" min="${bounds.min}" max="${today}"></label>
      <label>Al<input type="month" data-t value="${st.to}" min="${bounds.min}" max="${today}"></label></div></div>`;
  const fire = () => { store.set(key, st); periodControls(host, key, bounds, onChange); onChange(); };
  host.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { st.g = b.dataset.g; fire(); });
  host.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
    const q = quick.find(x => x[0] === b.dataset.q); st.q = q[0]; st.from = q[2] < bounds.min ? bounds.min : q[2]; st.to = today; fire();
  });
  host.querySelector('[data-f]').onchange = e => { if (e.target.value) { st.from = e.target.value; st.q = ''; if (st.from > st.to) st.to = st.from; fire(); } };
  host.querySelector('[data-t]').onchange = e => { if (e.target.value) { st.to = e.target.value; st.q = ''; if (st.to < st.from) st.from = st.to; fire(); } };
}
function periodRange(key) {
  // l'intervallo "rapido" si aggiorna al mese corrente
  const st = UI[key], today = ym(todayISO());
  if (st.q === '12m') st.from = addMonths(today, -11); else if (st.q === '24m') st.from = addMonths(today, -23); else if (st.q === '60m') st.from = addMonths(today, -59);
  if (st.q) st.to = today;
  return st;
}

// ------------------------------------------------------------------ ANALISI
function consuntivo(y, filterFn = () => true) {
  const map = new Map();
  for (const m of S.movimenti) {
    if (!m.data.startsWith(y) || !filterFn(m)) continue;
    map.set(m.voce_id, (map.get(m.voce_id) || 0) + m.importo);
  }
  return map;
}
const preventivoAnno = y => new Map(S.preventivi.filter(p => p.anno === +y).map(p => [p.voce_id, p.importo]));

function renderAnalisi(v) {
  const ys = anni();
  if (!ys.includes(UI.anno)) UI.anno = ys[0];
  const y = UI.anno, py = y - 1, fr = fracAnno(y);
  const cutoff = y === TODAY.getFullYear() ? iso(TODAY).slice(5) : '12-31';
  const rowsY = S.movimenti.filter(m => m.data.startsWith(y));
  const U = sum(rowsY.filter(m => tipoMov(m) === 'U'), m => m.importo);
  const E = sum(rowsY.filter(m => tipoMov(m) === 'E'), m => m.importo);
  const prev = preventivoAnno(y);
  const PU = sum(S.voci.filter(x => x.tipo === 'U'), x => prev.get(x.id) || 0);
  const PE = sum(S.voci.filter(x => x.tipo === 'E'), x => prev.get(x.id) || 0);
  const mesiPassati = y < TODAY.getFullYear() ? 12 : Math.max(1, TODAY.getMonth() + (TODAY.getDate() / 30));
  const ytdPrev = S.movimenti.filter(m => m.data.startsWith(py) && m.data.slice(5) <= cutoff);
  const Uprev = sum(ytdPrev.filter(m => tipoMov(m) === 'U'), m => m.importo);

  v.innerHTML = `
    <div class="yearbar"><label>Anno <select id="anno">${ys.map(a => `<option ${a === y ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <span class="muted">${y === TODAY.getFullYear() ? `dati al ${fmtDate(todayISO())} · ${pct(fr)} dell'anno trascorso` : 'anno concluso'}</span></div>
    <section class="kpis">
      <div class="kpi"><small>Entrate</small><b class="E">${eur0(E)}</b>${PE ? `<span>${pct(E / PE)} del previsto</span>` : ''}</div>
      <div class="kpi"><small>Uscite</small><b class="U">${eur0(U)}</b>${PU ? `<span>${pct(U / PU)} del previsto</span>` : ''}</div>
      <div class="kpi"><small>Saldo</small><b class="${E - U >= 0 ? 'E' : 'bad'}">${eur0(E - U)}</b><span>${E ? 'risparmio ' + pct((E - U) / E) : ''}</span></div>
      <div class="kpi"><small>Uscite medie/mese</small><b>${eur0(U / mesiPassati)}</b>${Uprev ? `<span>${U >= Uprev ? '+' : ''}${pct((U - Uprev) / Uprev)} vs ${py} stesso periodo</span>` : ''}</div>
    </section>

    <section class="card"><h3>Mese per mese</h3>
      <div class="legend"><span><i style="background:${COL.E}"></i>Entrate</span><span><i style="background:${COL.U}"></i>Uscite</span><span class="muted">tocca un mese per i dettagli</span></div>
      <div id="chMesi"></div><div id="meseDett"></div></section>

    <section class="card"><h3>Entrate e uscite nel tempo</h3>
      <div id="ctlTempo"></div>
      <div class="legend"><span><i style="background:${COL.E}"></i>Entrate</span><span><i style="background:${COL.U}"></i>Uscite</span><span class="muted">tocca una colonna per i valori</span></div>
      <div id="chTempo"></div><div id="sumTempo" class="sumline"></div></section>

    <section class="card"><div class="h-row"><h3>Preventivo e consuntivo per voce</h3>
      <label class="switch"><input type="checkbox" id="rischio" ${UI.soloRischio ? 'checked' : ''}> solo voci da tenere d'occhio</label></div>
      <p class="muted small">${fr < 1 ? `La tacca indica quanto avreste dovuto spendere a oggi con un ritmo regolare (${pct(fr)} del preventivo); la proiezione stima il totale a fine anno al ritmo attuale.` : 'Anno concluso: confronto tra preventivo e speso effettivo.'}</p>
      <div id="budget"></div></section>

    <section class="card"><h3>Per categoria</h3>
      <div class="legend"><span><i style="background:${COL.U}"></i>${y}</span><span><i style="background:${COL.prev}"></i>${py}${cutoff !== '12-31' ? ' (stesso periodo)' : ''}</span></div>
      <div id="macro"></div></section>

    <section class="card"><div class="h-row"><h3>Confronto tra anni</h3>
      <div class="seg small" id="conf"><button data-c="periodo">Stesso periodo</button><button data-c="intero">Anno intero</button></div></div>
      <div class="legend"><span><i style="background:${COL.E}"></i>Entrate</span><span><i style="background:${COL.U}"></i>Uscite</span></div>
      <div id="chAnni"></div></section>

    <section class="card"><h3>Andamento di una voce negli anni</h3>
      <select id="trendVoce">${voceOptions('U', null).replace('Scegli la voce…', 'Scegli una voce…')}${voceOptions('E', null).replace('<option value="">Scegli la voce…</option>', '')}</select>
      <div class="legend"><span><i style="background:${COL.accent}"></i>Speso/incassato</span><span><i style="background:${COL.prev}"></i>Preventivo</span></div>
      <div id="chTrend"></div></section>

    <div class="grid2">
      <section class="card"><h3>Come pagate le uscite</h3><div id="metodi"></div></section>
      <section class="card"><h3>Le 10 uscite più grandi del ${y}</h3><div id="top"></div></section>
    </div>`;

  $('#anno').onchange = e => { UI.anno = +e.target.value; renderAnalisi(v); };

  // --- mesi
  const mE = Array(12).fill(0), mU = Array(12).fill(0);
  rowsY.forEach(m => { const i = +m.data.slice(5, 7) - 1; (tipoMov(m) === 'E' ? mE : mU)[i] += m.importo; });
  columns($('#chMesi'), {
    labels: MESI, tipLabels: MESI_L.map(m => m + ' ' + y), height: 220, fmt: eur0,
    series: [{ name: 'Entrate', color: COL.E, values: mE }, { name: 'Uscite', color: COL.U, values: mU }],
    extra: i => `<div>Saldo: <b>${eur0(mE[i] - mU[i])}</b></div>`,
    onClick: i => meseDettaglio(i),
  });
  function meseDettaglio(i) {
    const rows = rowsY.filter(m => +m.data.slice(5, 7) === i + 1 && tipoMov(m) === 'U');
    const by = [...consuntivoRows(rows)].sort((a, b) => b[1] - a[1]).slice(0, 8);
    $('#meseDett').innerHTML = `<div class="mdet"><b>Uscite di ${MESI_L[i]}: ${eur0(mU[i])}</b>
      ${hbars(by.map(([id, val]) => ({ label: voce(id)?.nome, value: val, color: COL.U })), mU[i])}
      <a href="#movimenti?anno=${y}&mese=${i + 1}&tipo=U&voce=&macro=">Vedi tutti i movimenti di ${MESI_L[i]} →</a></div>`;
  }
  const consuntivoRows = rows => { const mm = new Map(); rows.forEach(m => mm.set(m.voce_id, (mm.get(m.voce_id) || 0) + m.importo)); return mm; };

  // --- entrate/uscite nel tempo, periodo a scelta
  const minMov = S.movimenti.length ? ym(S.movimenti[S.movimenti.length - 1].data) : ym(todayISO());
  periodState('pTempo', { g: 'T', q: '24m', from: addMonths(ym(todayISO()), -23), to: ym(todayISO()) });
  const drawTempo = () => {
    const st = periodRange('pTempo');
    const bs = buckets(st.from < minMov ? minMov : st.from, st.to, st.g);
    const e = bs.map(() => 0), u = bs.map(() => 0);
    const lo = bs[0]?.start, hi = bs[bs.length - 1]?.end;
    for (const m of S.movimenti) {
      if (m.data < lo || m.data > hi) continue;
      const i = bs.findIndex(b => m.data >= b.start && m.data <= b.end); if (i < 0) continue;
      (tipoMov(m) === 'E' ? e : u)[i] += m.importo;
    }
    columns($('#chTempo'), {
      labels: bs.map(b => b.label), tipLabels: bs.map(b => b.long + (b.end > todayISO() ? ' (in corso)' : '')), height: 240, fmt: eur0,
      series: [{ name: 'Entrate', color: COL.E, values: e }, { name: 'Uscite', color: COL.U, values: u }],
      extra: i => `<div>Saldo: <b>${eur0(e[i] - u[i])}</b></div>`,
    });
    const te = sum(e), tu = sum(u), n = bs.length;
    const eff = bs.length ? `${fmtDate(bs[0].start)} – ${fmtDate(bs[bs.length - 1].end > todayISO() ? todayISO() : bs[bs.length - 1].end)}` : '';
    $('#sumTempo').innerHTML = `<span class="muted">Dal ${eff}</span><br>Entrate <b class="E">${eur0(te)}</b> · uscite <b class="U">${eur0(tu)}</b> · saldo <b class="${te - tu >= 0 ? 'E' : 'bad'}">${eur0(te - tu)}</b> · uscite medie per ${GRAN.find(x => x[0] === st.g)[1].toLowerCase()} <b>${eur0(tu / Math.max(1, n))}</b>`;
  };
  periodControls($('#ctlTempo'), 'pTempo', { min: minMov }, drawTempo);
  drawTempo();

  // --- budget per voce
  const cons = consuntivo(String(y));
  const drawBudget = () => {
    const rows = S.voci.filter(x => (prev.get(x.id) || cons.get(x.id))).map(x => {
      const P = prev.get(x.id) || 0, C = cons.get(x.id) || 0, A = P * fr;
      const proj = fr > 0 && fr < 1 ? C / fr : C;
      let st = 'ok';
      if (x.tipo === 'U') {
        if (P === 0) st = 'np';
        else if (C > P) st = 'over';
        else if (fr < 1 && C > A * 1.1 && C - A > 50) st = 'warn';
      } else {
        st = P && C < A * 0.9 && fr < 1 ? 'warn' : 'ok';
      }
      return { x, P, C, A, proj, st };
    });
    const order = { over: 0, warn: 1, np: 2, ok: 3 };
    const draw = (tipo, title) => {
      let rs = rows.filter(r => r.x.tipo === tipo);
      if (UI.soloRischio) rs = rs.filter(r => r.st !== 'ok');
      rs.sort((a, b) => order[a.st] - order[b.st] || (b.C - b.A) - (a.C - a.A));
      if (!rs.length) return '';
      return `<h4>${title}</h4>` + rs.map(r => {
        const scale = Math.max(r.P, r.C, 1);
        const lab = { over: 'oltre il preventivo', warn: tipo === 'U' ? 'sopra il ritmo' : 'sotto il ritmo', np: 'non previsto', ok: '' }[r.st];
        return `<a class="brow ${r.st}" href="#movimenti?anno=${y}&voce=${r.x.id}&mese=&tipo=&macro=">
          <div class="b-top"><span class="b-name">${esc(r.x.nome)}${lab ? ` <em>${lab}</em>` : ''}</span>
            <span class="b-val"><b>${eur0(r.C)}</b> / ${eur0(r.P)}</span></div>
          <div class="b-track"><div class="b-fill" style="width:${(r.C / scale) * 100}%"></div>
            ${r.P ? `<div class="b-p" style="left:${(r.P / scale) * 100}%"></div>` : ''}
            ${r.P && fr < 1 ? `<div class="b-a" style="left:${(r.A / scale) * 100}%"></div>` : ''}</div>
          <div class="b-sub">${r.P ? `${pct(r.C / r.P)} usato` : ''}${fr < 1 && r.P ? ` · atteso a oggi ${eur0(r.A)} · proiezione ${eur0(r.proj)}` : ''}${fr === 1 && r.P ? ` · ${r.C > r.P ? 'sforato di' : 'avanzati'} ${eur0(Math.abs(r.P - r.C))}` : ''}</div></a>`;
      }).join('');
    };
    $('#budget').innerHTML = (draw('U', 'Uscite') + draw('E', 'Entrate')) || '<p class="muted">Nessuna voce da segnalare.</p>';
  };
  drawBudget();
  $('#rischio').onchange = e => { UI.soloRischio = e.target.checked; drawBudget(); };

  // --- macro categorie
  const inWin = (m, yy) => m.data.startsWith(yy) && m.data.slice(5) <= cutoff;
  const macroTot = yy => { const mm = new Map(); S.movimenti.forEach(m => { if (inWin(m, yy) && tipoMov(m) === 'U') { const k = voce(m.voce_id).macro; mm.set(k, (mm.get(k) || 0) + m.importo); } }); return mm; };
  const mc = macroTot(String(y)), mp = macroTot(String(py));
  const maxM = Math.max(...mc.values(), ...mp.values(), 1);
  $('#macro').innerHTML = S.macro.filter(m => m.tipo === 'U' && (mc.get(m.codice) || mp.get(m.codice)))
    .sort((a, b) => (mc.get(b.codice) || 0) - (mc.get(a.codice) || 0)).map(m => {
      const c = mc.get(m.codice) || 0, p = mp.get(m.codice) || 0, d = p ? (c - p) / p : null;
      return `<a class="mrow" href="#movimenti?anno=${y}&macro=${m.codice}&voce=&mese=&tipo=">
        <div class="b-top"><span>${esc(m.nome)}</span><span><b>${eur0(c)}</b>${d !== null ? ` <em class="${d > 0.1 ? 'up' : d < -0.1 ? 'down' : ''}">${d >= 0 ? '+' : ''}${pct(d)}</em>` : ''}</span></div>
        <div class="b-track thin"><div class="b-fill" style="width:${(c / maxM) * 100}%;background:${COL.U}"></div></div>
        <div class="b-track thin"><div class="b-fill" style="width:${(p / maxM) * 100}%;background:${COL.prev}"></div></div>
        <div class="b-sub">${py}: ${eur0(p)} · ${U ? pct(c / U) + ' delle uscite' : ''}</div></a>`;
    }).join('');

  // --- confronto anni
  const drawAnni = () => {
    $$('#conf button').forEach(b => b.classList.toggle('on', b.dataset.c === UI.confronto));
    const cut = UI.confronto === 'periodo' ? iso(TODAY).slice(5) : '12-31';
    const yy = [...ys].sort();
    const val = (a, t) => sum(S.movimenti.filter(m => m.data.startsWith(a) && m.data.slice(5) <= cut && tipoMov(m) === t), m => m.importo);
    const e = yy.map(a => val(a, 'E')), u = yy.map(a => val(a, 'U'));
    columns($('#chAnni'), {
      labels: yy.map(String), height: 220, fmt: eur0,
      tipLabels: yy.map(a => UI.confronto === 'periodo' ? `${a} (1 gen – ${fmtDate(a + '-' + cut).replace(/ \d{4}$/, '')})` : String(a)),
      series: [{ name: 'Entrate', color: COL.E, values: e }, { name: 'Uscite', color: COL.U, values: u }],
      extra: i => `<div>Saldo: <b>${eur0(e[i] - u[i])}</b></div>`,
    });
  };
  drawAnni();
  $('#conf').onclick = e => { if (e.target.dataset.c) { UI.confronto = e.target.dataset.c; drawAnni(); } };

  // --- trend voce
  const drawTrend = () => {
    const id = +UI.trendVoce || vociFrequenti('U', 1)[0]?.id;
    if (!id) return;
    $('#trendVoce').value = id;
    const yy = [...ys].sort();
    const c = yy.map(a => sum(S.movimenti.filter(m => m.voce_id === id && m.data.startsWith(a)), m => m.importo));
    const p = yy.map(a => S.preventivi.find(x => x.anno === a && x.voce_id === id)?.importo || 0);
    columns($('#chTrend'), {
      labels: yy.map(String), height: 200, fmt: eur0,
      series: [{ name: 'Effettivo', color: COL.accent, values: c }, { name: 'Preventivo', color: COL.prev, values: p }],
      extra: i => yy[i] === TODAY.getFullYear() ? '<div class="muted">anno in corso</div>' : '',
    });
  };
  drawTrend();
  $('#trendVoce').onchange = e => { UI.trendVoce = e.target.value; drawTrend(); };

  // --- metodi
  const um = new Map();
  rowsY.filter(m => tipoMov(m) === 'U').forEach(m => { const k = m.metodo || 'Non indicato'; um.set(k, (um.get(k) || 0) + m.importo); });
  $('#metodi').innerHTML = hbars([...um.entries()].sort((a, b) => b[1] - a[1]).map(([k, val]) => ({ label: k, value: val, color: COL.accent })), U, true);

  // --- top spese
  $('#top').innerHTML = movList(rowsY.filter(m => tipoMov(m) === 'U').sort((a, b) => b.importo - a.importo).slice(0, 10), false);
}

function hbars(items, total, showPct) {
  const max = Math.max(...items.map(i => i.value), 1);
  return `<div class="hbars">${items.map(i => `<div class="hb"><div class="b-top"><span>${esc(i.label)}</span><span><b>${eur0(i.value)}</b>${showPct && total ? ` <small>${pct(i.value / total)}</small>` : ''}</span></div>
    <div class="b-track thin"><div class="b-fill" style="width:${(i.value / max) * 100}%;background:${i.color}"></div></div></div>`).join('')}</div>`;
}

// ------------------------------------------------------------------ PREVENTIVO
function renderPreventivo(v) {
  const ys = [...new Set([...anni(), TODAY.getFullYear() + 1, ...S.preventivi.map(p => p.anno)])].sort((a, b) => b - a);
  const y = UI.prevAnno || TODAY.getFullYear();
  const prev = preventivoAnno(y), lastY = preventivoAnno(y - 1), consPrev = consuntivo(String(y - 1)), cons = consuntivo(String(y));
  const vis = S.voci.filter(x => x.attiva || prev.get(x.id));
  const section = (tipo, title) => `<h3>${title}</h3><div class="ptable">
    <div class="ph"><span>Voce</span><span>${y - 1} effettivo</span><span>${y} effettivo</span><span>Preventivo ${y}</span></div>
    ${vis.filter(x => x.tipo === tipo).map(x => `<div class="pr"><span>${esc(x.nome)}${x.attiva ? '' : ' <em>(non più usata)</em>'}</span>
      <span class="muted">${eur0(consPrev.get(x.id) || 0)}</span><span class="muted">${eur0(cons.get(x.id) || 0)}</span>
      <input inputmode="decimal" data-v="${x.id}" value="${prev.has(x.id) ? String(prev.get(x.id)).replace('.', ',') : ''}" placeholder="0"></div>`).join('')}
    <div class="pf"><span>Totale</span><span></span><span></span><b id="tot${tipo}"></b></div></div>`;
  v.innerHTML = `
    <div class="yearbar"><label>Anno <select id="pAnno">${ys.map(a => `<option ${a === y ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <span class="muted">Le modifiche si salvano da sole quando lasci il campo.</span></div>
    <section class="kpis" id="pk"></section>
    <section class="card">
      <div class="actions left">
        <button id="copyPrev" type="button">Copia il preventivo ${y - 1} nelle voci vuote</button>
        <button id="fromCons" type="button">Usa lo speso ${y - 1} nelle voci vuote</button>
      </div>
      ${section('U', 'Uscite')}${section('E', 'Entrate')}
    </section>`;
  const totals = () => {
    const vals = Object.fromEntries($$('[data-v]').map(i => [i.dataset.v, parseAmount(i.value) || 0]));
    const t = tipo => sum(vis.filter(x => x.tipo === tipo), x => vals[x.id]);
    $('#totU').textContent = eur0(t('U')); $('#totE').textContent = eur0(t('E'));
    $('#pk').innerHTML = `<div class="kpi"><small>Entrate previste</small><b class="E">${eur0(t('E'))}</b></div>
      <div class="kpi"><small>Uscite previste</small><b class="U">${eur0(t('U'))}</b></div>
      <div class="kpi"><small>Saldo previsto</small><b class="${t('E') - t('U') >= 0 ? 'E' : 'bad'}">${eur0(t('E') - t('U'))}</b></div>
      <div class="kpi"><small>Uscite previste/mese</small><b>${eur0(t('U') / 12)}</b></div>`;
  };
  totals();
  const save = async inputs => {
    const rows = [], dels = [];
    for (const i of inputs) {
      const val = i.value.trim() === '' ? null : parseAmount(i.value);
      if (val !== null && !isFinite(val)) { i.classList.add('bad'); continue; }
      i.classList.remove('bad');
      const id = +i.dataset.v, old = prev.get(id);
      if (val === null) { if (old !== undefined) dels.push(id); }
      else if (val !== old) rows.push({ anno: y, voce_id: id, importo: val });
    }
    if (rows.length) {
      await api.upsert('preventivi', rows);
      rows.forEach(r => { const ex = S.preventivi.find(p => p.anno === y && p.voce_id === r.voce_id); ex ? ex.importo = r.importo : S.preventivi.push(r); prev.set(r.voce_id, r.importo); });
    }
    for (const id of dels) { await api.remove('preventivi', { anno: y, voce_id: id }); S.preventivi = S.preventivi.filter(p => !(p.anno === y && p.voce_id === id)); prev.delete(id); }
    if (rows.length || dels.length) toast('Preventivo salvato');
    totals();
  };
  $$('[data-v]').forEach(i => { i.onchange = () => guard(() => save([i])); i.oninput = totals; });
  $('#pAnno').onchange = e => { UI.prevAnno = +e.target.value; renderPreventivo(v); };
  const fill = src => guard(async () => {
    const empty = $$('[data-v]').filter(i => !i.value.trim());
    let n = 0;
    empty.forEach(i => { const val = src.get(+i.dataset.v); if (val) { i.value = String(round2(val)).replace('.', ','); n++; } });
    if (!n) { toast('Nessuna voce vuota da riempire'); return; }
    await save(empty);
  });
  $('#copyPrev').onclick = () => fill(lastY);
  $('#fromCons').onclick = () => fill(consPrev);
}

// ------------------------------------------------------------------ PATRIMONIO
// Patrimonio: ogni conto vale il suo ultimo saldo noto. I conti disattivati
// contano solo fino alla loro ultima rilevazione.
function saldiPerConto() {
  const by = new Map();
  for (const s of S.saldi) { if (!by.has(s.conto_id)) by.set(s.conto_id, []); by.get(s.conto_id).push(s); }
  for (const a of by.values()) a.sort((x, y) => (x.data > y.data ? 1 : -1));
  return by;
}
function statoAl(d, by = saldiPerConto()) {
  const o = { data: d, tot: 0, liquidità: 0, risparmio: 0, investimento: 0, conti: [] };
  for (const c of S.conti) {
    const a = by.get(c.id); if (!a) continue;
    let last = null;
    for (const s of a) { if (s.data <= d) last = s; else break; }
    if (!last) continue;
    if (!c.attivo && a[a.length - 1].data < d) continue;
    o.tot += last.saldo; o[c.tipo] += last.saldo; o.conti.push({ c, s: last });
  }
  return o;
}
function snapshots() {
  const by = saldiPerConto();
  const dates = [...new Set(S.saldi.map(s => s.data))].sort();
  return dates.map(d => statoAl(d, by));
}
function giorniDa(d) { return Math.round((new Date(todayISO()) - new Date(d)) / 864e5); }

function renderPatrimonio(v, params) {
  const snaps = snapshots();
  const now = statoAl(todayISO());
  const editDate = params.data || null;
  const stale = now.conti.filter(x => x.c.attivo && giorniDa(x.s.data) > 60);
  v.innerHTML = `
    <section class="kpis">${now.conti.length ? `
      <div class="kpi"><small>Patrimonio (ultimi saldi noti)</small><b>${eur0(now.tot)}</b><span>${stale.length ? `${stale.length} conti non aggiornati da oltre 2 mesi` : 'tutti i conti aggiornati'}</span></div>
      <div class="kpi"><small>Liquidità (capitale circolante)</small><b>${eur0(now['liquidità'])}</b></div>
      <div class="kpi"><small>Risparmi</small><b>${eur0(now.risparmio)}</b></div>
      <div class="kpi"><small>Investimenti / previdenza</small><b>${eur0(now.investimento)}</b></div>` : '<p class="muted">Nessun saldo registrato.</p>'}</section>

    <section class="card"><h3>Situazione dei conti</h3>
      <p class="muted small">Per ogni conto vale l'ultimo saldo inserito. Non serve aggiornarli tutti insieme né ogni mese: aggiorna quelli che conosci, quando li conosci.</p>
      ${['liquidità', 'risparmio', 'investimento'].map(t => {
        const rows = now.conti.filter(x => x.c.tipo === t);
        return rows.length ? `<h4>${t[0].toUpperCase() + t.slice(1)}</h4>` + rows.map(x => {
          const g = giorniDa(x.s.data);
          return `<div class="crow"><span>${esc(x.c.nome)}${x.c.attivo ? '' : ' <em class="muted">(chiuso)</em>'}</span>
            <span class="muted small ${g > 60 && x.c.attivo ? 'old' : ''}">${fmtDate(x.s.data)}${g > 60 && x.c.attivo ? ' · da aggiornare' : ''}</span>
            <b>${eur0(x.s.saldo)}</b></div>`;
        }).join('') : '';
      }).join('')}
    </section>

    <section class="card" id="ril"></section>

    <section class="card"><h3>Andamento del patrimonio</h3>
      <div class="h-row"><span class="muted small">Mostra</span><div class="seg small" id="pserie"><button data-s="tot" class="on">Totale</button><button data-s="liquidità">Liquidità</button><button data-s="risparmio">Risparmi</button><button data-s="investimento">Investimenti</button></div></div>
      <div id="ctlPat"></div>
      <div id="chPat"></div><div id="sumPat" class="sumline"></div>
      <p class="muted small">Ogni punto è il patrimonio a fine periodo, calcolato con l'ultimo saldo noto di ciascun conto a quella data. Polizza e fondo pensione sono registrati solo dal 2026, da qui il salto.</p></section>

    <section class="card"><h3>Storico inserimenti</h3><div class="snaps">${[...snaps].reverse().map(s => {
      const n = S.saldi.filter(x => x.data === s.data).length;
      return `<a href="#patrimonio?data=${s.data}" class="snap"><span>${fmtDate(s.data)} <small class="muted">· ${n} ${n === 1 ? 'conto' : 'conti'}</small></span><span><b>${eur0(s.tot)}</b></span></a>`;
    }).join('')}</div></section>`;

  const minSaldo = S.saldi.length ? ym(S.saldi.map(x => x.data).sort()[0]) : ym(todayISO());
  periodState('pPat', { g: 'T', q: 'all', from: minSaldo, to: ym(todayISO()) });
  let serie = 'tot';
  const draw = k => {
    if (k) serie = k;
    $$('#pserie button').forEach(b => b.classList.toggle('on', b.dataset.s === serie));
    const st = periodRange('pPat');
    if (st.q === 'all') st.from = minSaldo;
    const by = saldiPerConto();
    const bs = buckets(st.from < minSaldo ? minSaldo : st.from, st.to, st.g)
      .map(b => ({ ...b, st: statoAl(b.end > todayISO() ? todayISO() : b.end, by) })).filter(b => b.st.conti.length);
    const vals = bs.map(b => b.st[serie]);
    line($('#chPat'), {
      labels: bs.map(b => b.label), values: vals, color: COL.accent, fmt: eur0, height: 230,
      tipLabels: bs.map((b, i) => `${b.long}${b.end > todayISO() ? ' (ad oggi)' : ''}${i ? `<br><span style="font-weight:400">${vals[i] - vals[i - 1] >= 0 ? '+' : ''}${eur0(vals[i] - vals[i - 1])} sul periodo prima</span>` : ''}`),
    });
    $('#sumPat').innerHTML = vals.length > 1 ? `Dal ${fmtDate(bs[0].end)} al ${fmtDate(bs[bs.length - 1].end > todayISO() ? todayISO() : bs[bs.length - 1].end)}: variazione <b class="${vals[vals.length - 1] - vals[0] >= 0 ? 'E' : 'bad'}">${vals[vals.length - 1] - vals[0] >= 0 ? '+' : ''}${eur0(vals[vals.length - 1] - vals[0])}</b> (da ${eur0(vals[0])} a ${eur0(vals[vals.length - 1])})` : '';
  };
  periodControls($('#ctlPat'), 'pPat', { min: minSaldo }, () => draw());
  draw('tot');
  $('#pserie').onclick = e => { if (e.target.dataset.s) draw(e.target.dataset.s); };

  // inserimento: solo i campi compilati vengono salvati
  const data = editDate || todayISO();
  const conti = S.conti.filter(c => c.attivo || S.saldi.some(s => s.conto_id === c.id && s.data === data));
  const exact = id => S.saldi.find(s => s.conto_id === id && s.data === data);
  const prima = id => { const a = S.saldi.filter(s => s.conto_id === id && s.data < data).sort((x, y) => (x.data > y.data ? -1 : 1)); return a[0]; };
  const tipi = ['liquidità', 'risparmio', 'investimento'];
  $('#ril').innerHTML = `<h3>${editDate ? 'Saldi inseriti il ' + fmtDate(editDate) : 'Aggiorna i saldi'}</h3>
    <p class="muted small">Compila solo i conti di cui conosci il saldo a questa data; gli altri restano com'erano.</p>
    <label>Data<input type="date" id="sData" value="${data}"></label>
    ${tipi.map(t => {
      const cs = conti.filter(c => c.tipo === t);
      return cs.length ? `<h4>${t[0].toUpperCase() + t.slice(1)}</h4>` + cs.map(c => {
        const ex = exact(c.id), pr = prima(c.id);
        return `<div class="pr2"><span>${esc(c.nome)}${pr ? `<small class="muted"> · prima ${eur0(pr.saldo)} (${fmtDate(pr.data)})</small>` : ''}</span>
          <input inputmode="decimal" data-c="${c.id}" value="${ex ? String(ex.saldo).replace('.', ',') : ''}" placeholder="${pr ? String(pr.saldo).replace('.', ',') : ''}"></div>`;
      }).join('') : '';
    }).join('')}
    <div class="pf"><span>Patrimonio risultante</span><b id="sTot"></b></div>
    <div class="actions"><button class="primary" id="sSave" type="button">Salva</button>
    ${editDate ? '<button id="sNew" type="button">Nuovo inserimento</button><button class="danger" id="sDel" type="button">Elimina i saldi di questa data</button>' : ''}</div>`;
  const tot = () => {
    const d = $('#sData').value || data;
    const base = statoAl(d);
    let t = base.tot;
    $$('[data-c]').forEach(i => {
      const val = parseAmount(i.value); if (!isFinite(val)) return;
      const cur = base.conti.find(x => x.c.id === +i.dataset.c);
      t += val - (cur ? cur.s.saldo : 0);
    });
    $('#sTot').textContent = eur0(t);
  };
  tot(); $$('[data-c]').forEach(i => i.oninput = tot); $('#sData').onchange = tot;
  $('#sSave').onclick = () => guard(async () => {
    const d = $('#sData').value; if (!d) return toast('Indica la data');
    const filled = $$('[data-c]').filter(i => i.value.trim() !== '');
    const rows = filled.map(i => ({ conto_id: +i.dataset.c, data: d, saldo: parseAmount(i.value) }));
    if (rows.some(r => !isFinite(r.saldo))) return toast('Controlla gli importi');
    // in modifica: i campi svuotati eliminano il saldo di quella data
    const svuotati = editDate ? $$('[data-c]').filter(i => i.value.trim() === '' && exact(+i.dataset.c)).map(i => +i.dataset.c) : [];
    if (!rows.length && !svuotati.length) return toast('Inserisci almeno un saldo');
    if (rows.length) await api.upsert('saldi', rows);
    rows.forEach(r => { const ex = S.saldi.find(s => s.conto_id === r.conto_id && s.data === r.data); ex ? ex.saldo = r.saldo : S.saldi.push(r); });
    for (const id of svuotati) { await api.remove('saldi', { conto_id: id, data: d }); S.saldi = S.saldi.filter(s => !(s.conto_id === id && s.data === d)); }
    toast(`Saldi salvati (${rows.length})`); location.hash = '#patrimonio?data=' + d; route();
  });
  if (editDate) {
    $('#sNew').onclick = () => { location.hash = '#patrimonio'; };
    $('#sDel').onclick = () => guard(async () => {
      if (!confirm(`Eliminare tutti i saldi inseriti il ${fmtDate(editDate)}?`)) return;
      for (const s of S.saldi.filter(s => s.data === editDate)) await api.remove('saldi', { conto_id: s.conto_id, data: s.data });
      S.saldi = S.saldi.filter(s => s.data !== editDate); toast('Saldi eliminati'); location.hash = '#patrimonio';
    });
  }
}

// ------------------------------------------------------------------ IMPOSTAZIONI
function renderImpostazioni(v) {
  v.innerHTML = `
    <section class="card"><h3>Account</h3>
      <p>${api.mode === 'demo' ? 'Modalità prova: i dati restano solo in questo browser.' : `Collegato come <b>${esc(api.user?.email)}</b> (${esc(me())}).`}</p>
      <div class="actions left"><button id="logout" type="button">${api.mode === 'demo' ? 'Esci dalla prova' : 'Esci'}</button>
      <button id="csvAll" type="button">Esporta tutti i movimenti (CSV)</button></div>
      <p class="muted small">Versione app ${VERSIONE} del ${DATA_VERSIONE} · <a href="#" id="novLink">Novità delle versioni</a></p></section>
    ${gcalSection()}
    ${visionSection()}

    <section class="card"><h3>Voci di budget</h3>
      <div class="vlist">${S.macro.map(g => {
        const vs = S.voci.filter(x => x.macro === g.codice);
        return vs.length ? `<h4>${esc(g.nome)}</h4>` + vs.map(x => `<div class="vrow"><input data-n="${x.id}" value="${esc(x.nome)}">
          <select data-m="${x.id}">${S.macro.filter(m => m.tipo === x.tipo).map(m => `<option value="${m.codice}" ${m.codice === x.macro ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select>
          <label class="switch"><input type="checkbox" data-a="${x.id}" ${x.attiva ? 'checked' : ''}> attiva</label></div>`).join('') : '';
      }).join('')}</div>
      <h4>Aggiungi voce</h4>
      <div class="vrow add"><input id="nvNome" placeholder="Nome voce"><select id="nvMacro">${S.macro.map(m => `<option value="${m.codice}">${esc(m.nome)}</option>`).join('')}</select>
        <input id="nvHint" placeholder="Suggerimento (facoltativo)"><button id="nvAdd" type="button">Aggiungi</button></div></section>

    <section class="card"><h3>Metodi di pagamento</h3>
      <div class="chips">${S.metodi.map(m => `<label class="chip ${m.attivo ? 'on' : ''}"><input type="checkbox" data-mt="${esc(m.nome)}" ${m.attivo ? 'checked' : ''} hidden>${esc(m.nome)}</label>`).join('')}</div>
      <div class="vrow add"><input id="nmNome" placeholder="Nuovo metodo"><button id="nmAdd" type="button">Aggiungi</button></div></section>

    <section class="card"><h3>Conti (patrimonio)</h3>
      ${S.conti.map(c => `<div class="vrow"><input data-cn="${c.id}" value="${esc(c.nome)}"><select data-ct="${c.id}">${['liquidità', 'risparmio', 'investimento'].map(t => `<option ${t === c.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <label class="switch"><input type="checkbox" data-ca="${c.id}" ${c.attivo ? 'checked' : ''}> attivo</label></div>`).join('')}
      <div class="vrow add"><input id="ncNome" placeholder="Nuovo conto"><select id="ncTipo"><option>liquidità</option><option>risparmio</option><option>investimento</option></select><button id="ncAdd" type="button">Aggiungi</button></div></section>

    <section class="card"><h3>Importa lo storico da Excel</h3>
      <p class="muted small">Carica il file <code>storico.json</code> preparato dai fogli Excel 2022–2026. Va fatto una sola volta, su un database vuoto.</p>
      <input type="file" id="imp" accept=".json,application/json"><div id="impLog" class="muted small"></div>
      ${api.mode === 'demo' ? '<div class="actions left"><button class="danger" id="demoReset" type="button">Cancella i dati di prova</button></div>' : ''}</section>`;

  wireGcal(v);
  wireVision(v);
  $('#novLink').onclick = e => { e.preventDefault(); mostraNovita(true); };
  $('#logout').onclick = async () => { await api.logout(); location.hash = ''; start(); };
  $('#csvAll').onclick = () => exportCSV(S.movimenti, 'budget_tutti_i_movimenti');
  const upd = (table, match, patch, apply) => guard(async () => { await api.update(table, match, patch); apply(); index(); toast('Salvato'); });
  $$('[data-n]').forEach(i => i.onchange = () => { const x = voce(+i.dataset.n), n = i.value.trim(); if (n) upd('voci', { id: x.id }, { nome: n }, () => { x.nome = n; }); });
  $$('[data-m]').forEach(i => i.onchange = () => { const x = voce(+i.dataset.m); upd('voci', { id: x.id }, { macro: i.value }, () => { x.macro = i.value; }); });
  $$('[data-a]').forEach(i => i.onchange = () => { const x = voce(+i.dataset.a); upd('voci', { id: x.id }, { attiva: i.checked }, () => { x.attiva = i.checked; }); });
  $('#nvAdd').onclick = () => guard(async () => {
    const nome = $('#nvNome').value.trim(); if (!nome) return toast('Scrivi il nome della voce');
    if (S._vociNome.has(nome.toLowerCase())) return toast('Esiste già una voce con questo nome');
    const m = S.macro.find(x => x.codice === $('#nvMacro').value);
    const [r] = await api.insert('voci', [{ nome, macro: m.codice, tipo: m.tipo, suggerimento: $('#nvHint').value.trim() || null, attiva: true, ordine: S.voci.length }]);
    S.voci.push(r); index(); toast('Voce aggiunta'); renderImpostazioni(v);
  });
  $$('[data-mt]').forEach(i => i.parentElement.onclick = e => { e.preventDefault(); const m = S.metodi.find(x => x.nome === i.dataset.mt); upd('metodi', { nome: m.nome }, { attivo: !m.attivo }, () => { m.attivo = !m.attivo; renderImpostazioni(v); }); });
  $('#nmAdd').onclick = () => guard(async () => {
    const nome = $('#nmNome').value.trim(); if (!nome || S.metodi.some(m => m.nome.toLowerCase() === nome.toLowerCase())) return;
    const [r] = await api.insert('metodi', [{ nome, attivo: true, ordine: S.metodi.length }]); S.metodi.push(r); renderImpostazioni(v);
  });
  const conto = id => S.conti.find(c => c.id === id);
  $$('[data-cn]').forEach(i => i.onchange = () => { const c = conto(+i.dataset.cn), n = i.value.trim(); if (n) upd('conti', { id: c.id }, { nome: n }, () => { c.nome = n; }); });
  $$('[data-ct]').forEach(i => i.onchange = () => { const c = conto(+i.dataset.ct); upd('conti', { id: c.id }, { tipo: i.value }, () => { c.tipo = i.value; }); });
  $$('[data-ca]').forEach(i => i.onchange = () => { const c = conto(+i.dataset.ca); upd('conti', { id: c.id }, { attivo: i.checked }, () => { c.attivo = i.checked; }); });
  $('#ncAdd').onclick = () => guard(async () => {
    const nome = $('#ncNome').value.trim(); if (!nome) return;
    const [r] = await api.insert('conti', [{ nome, tipo: $('#ncTipo').value, attivo: true, ordine: S.conti.length }]); S.conti.push(r); index(); renderImpostazioni(v);
  });
  $('#imp').onchange = e => guard(async () => {
    const f = e.target.files[0]; if (!f) return;
    const data = JSON.parse(await f.text());
    await importStorico(data, msg => { $('#impLog').textContent = msg; });
  });
  const dr = $('#demoReset'); if (dr) dr.onclick = () => { if (confirm('Cancellare tutti i dati di prova da questo browser?')) { api.reset(); location.hash = ''; location.reload(); } };
}

// ------------------------------------------------------------------ IMPORT
async function importStorico(d, log) {
  if (!d.movimenti || !d.voci) throw new Error('File non riconosciuto');
  if (S.movimenti.length && !confirm(`Nel database ci sono già ${S.movimenti.length} movimenti. Importando di nuovo potresti creare doppioni. Continuare?`)) return;
  log('Categorie e voci…');
  await api.upsert('macro', d.macro);
  await api.upsert('metodi', d.metodi.map((n, i) => ({ nome: n, attivo: true, ordine: i })));
  await loadAll();
  const newV = d.voci.filter(x => !S._vociNome.has(x.nome.toLowerCase()));
  if (newV.length) await api.insert('voci', newV);
  const conNomi = new Set(S.conti.map(c => c.nome.toLowerCase()));
  const newC = d.conti.filter(c => !conNomi.has(c.nome.toLowerCase()));
  if (newC.length) await api.insert('conti', newC);
  await loadAll();
  const vid = n => S._vociNome.get(n.toLowerCase())?.id;
  const cid = n => S.conti.find(c => c.nome.toLowerCase() === n.toLowerCase())?.id;
  log('Preventivi e saldi…');
  await api.upsert('preventivi', d.preventivi.map(p => ({ anno: p.anno, voce_id: vid(p.voce), importo: p.importo })).filter(p => p.voce_id));
  await api.upsert('saldi', d.saldi.map(s => ({ conto_id: cid(s.conto), data: s.data, saldo: s.saldo })).filter(s => s.conto_id));
  const rows = d.movimenti.map(m => ({ data: m.data, voce_id: vid(m.voce), importo: m.importo, descrizione: m.descrizione || null, metodo: m.metodo, chi: m.chi, note: m.note, voce_originale: m.voce_originale, creato_da: 'import excel' }));
  const bad = rows.filter(r => !r.voce_id).length;
  const ok = rows.filter(r => r.voce_id);
  for (let i = 0; i < ok.length; i += 500) {
    log(`Movimenti ${i.toLocaleString('it-IT')} / ${ok.length.toLocaleString('it-IT')}…`);
    await api.insert('movimenti', ok.slice(i, i + 500));
  }
  await loadAll();
  log(`Fatto: ${ok.length.toLocaleString('it-IT')} movimenti importati${bad ? `, ${bad} scartati (voce sconosciuta)` : ''}.`);
  toast('Storico importato');
}

// ------------------------------------------------------------------ avvio
async function start() {
  if (!api.user) {
    if (api.mode === 'demo') await api.login();
    else return renderLogin();
  }
  document.body.innerHTML = '<p class="loading">Caricamento…</p>';
  try { await loadAll(); }
  catch (e) { if (e.auth) return renderLogin(e.message); document.body.innerHTML = `<p class="loading">Errore di collegamento: ${esc(e.message)}</p>`; return; }
  shell();
  if (!S.movimenti.length && !S.voci.length) location.hash = '#impostazioni';
  route();
  mostraNovita(false);
  controllaAggiornamento();
  guard(async () => { const n = await registraAutomatici(); if (n) { toast(`Registrati ${n} movimenti automatici`); route(); gcalDopoModifica(); } });
}
window.addEventListener('hashchange', () => { if ($('#view')) route(); });
let rz, lastW = innerWidth; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (Math.abs(innerWidth - lastW) < 40) return; lastW = innerWidth; if ($('#view') && /analisi/.test($('#view').className)) route(); }, 300); });
window.BF = { interpreta, suggerisciVoce, S, parseAmount, api, occorrenze, descriviRegola, festivi, eventiDesiderati };
start();
