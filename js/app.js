import { api } from './api.js';
import { columns, line } from './charts.js';

export const VERSIONE = '1.2';
export const DATA_VERSIONE = '14/11/2026';

// ------------------------------------------------------------------ stato
const S = { macro: [], voci: [], metodi: [], membri: [], movimenti: [], preventivi: [], conti: [], saldi: [] };
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
  S.movimenti.sort((a, b) => (b.data > a.data ? 1 : b.data < a.data ? -1 : b.id - a.id));
}
async function loadAll() {
  const t = ['macro', 'voci', 'metodi', 'membri', 'movimenti', 'preventivi', 'conti', 'saldi'];
  const r = await Promise.all(t.map(x => api.all(x)));
  t.forEach((x, i) => { S[x] = r[i]; });
  index();
}

// ------------------------------------------------------------------ shell
const ROUTES = {
  nuovo: { label: 'Nuovo', icon: 'plus', render: renderNuovo },
  movimenti: { label: 'Movimenti', icon: 'list', render: renderMovimenti },
  analisi: { label: 'Analisi', icon: 'chart', render: renderAnalisi },
  preventivo: { label: 'Preventivo', icon: 'target', render: renderPreventivo },
  patrimonio: { label: 'Patrimonio', icon: 'bank', render: renderPatrimonio },
  impostazioni: { label: 'Impostazioni', icon: 'gear', render: renderImpostazioni, hidden: true },
};
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".5"/>',
  bank: '<path d="M3 10h18L12 4 3 10zM5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
const icon = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

function shell() {
  document.body.innerHTML = `
    <header class="top">
      <div class="brand">Budget famiglia${api.mode === 'demo' ? ' <span class="pill warn">prova</span>' : ''}</div>
      <nav class="tabs">${Object.entries(ROUTES).filter(([, r]) => !r.hidden).map(([k, r]) => `<a href="#${k}" data-r="${k}">${icon(r.icon)}<span>${r.label}</span></a>`).join('')}</nav>
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
  };
  v.innerHTML = `
    <form id="mf" class="card form" autocomplete="off">
      <h2>${edit ? 'Modifica movimento' : 'Nuovo movimento'}</h2>
      <div class="seg" id="tipo">
        <button type="button" data-t="U">Uscita</button><button type="button" data-t="E">Entrata</button>
      </div>
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
          paint(); renderRecent(); $('#imp').focus();
        }
      } finally { btn.disabled = false; }
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
    <div class="mv-amt ${t}">${t === 'E' ? '+' : '−'}${eur(m.importo)}</div></a>`;
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
      <p class="muted small">Versione app ${VERSIONE} del ${DATA_VERSIONE}</p></section>

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
}
window.addEventListener('hashchange', () => { if ($('#view')) route(); });
let rz, lastW = innerWidth; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (Math.abs(innerWidth - lastW) < 40) return; lastW = innerWidth; if ($('#view') && /analisi/.test($('#view').className)) route(); }, 300); });
window.BF = { S, parseAmount, api };
start();
