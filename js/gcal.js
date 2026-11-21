// Collegamento a Google Calendar (accesso Google dal browser, nessun server).
const API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar';
let tok = null, exp = 0, gisP = null;

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return (gisP ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res; s.onerror = () => { gisP = null; rej(new Error('Impossibile caricare il login Google: controlla la connessione.')); };
    document.head.appendChild(s);
  }));
}

export const gTokenValid = () => !!tok && Date.now() < exp - 60000;

// Va chiamata da un tocco dell'utente (apre la finestra di Google)
export async function gLogin(clientId, hint) {
  await loadGis();
  return new Promise((res, rej) => {
    const c = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPE, hint: hint || undefined,
      callback: r => {
        if (r.error) return rej(new Error('Accesso Google non riuscito: ' + r.error));
        tok = r.access_token; exp = Date.now() + (+r.expires_in || 3600) * 1000; res(tok);
      },
      error_callback: e => rej(new Error(e?.type === 'popup_closed' ? 'Finestra di Google chiusa prima di finire.'
        : e?.type === 'popup_failed_to_open' ? 'Il browser ha bloccato la finestra di Google: consenti i popup per questo sito.'
        : 'Accesso Google non riuscito.')),
    });
    c.requestAccessToken({ prompt: '' });
  });
}
export function gLogout() {
  try { if (tok && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(tok, () => {}); } catch {}
  tok = null; exp = 0;
}

async function g(method, path, body) {
  let r;
  try {
    r = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('Google Calendar non raggiungibile: controlla la connessione.'); }
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) tok = null;
    const e = new Error(r.status === 401 ? 'Accesso Google scaduto: premi di nuovo "Sincronizza".' : 'Google Calendar: ' + (j.error?.message || r.status));
    e.status = r.status; throw e;
  }
  return j;
}
const enc = encodeURIComponent;

export const gPrimary = () => g('GET', '/calendars/primary');
export const gCalendarInfo = id => g('GET', `/calendars/${enc(id)}`);
export const gCreateCalendar = summary => g('POST', '/calendars', { summary, timeZone: 'Europe/Rome', description: "Scadenze, appuntamenti e movimenti fissi dell'app Budget famiglia" });
export const gShare = (id, email, role) => g('POST', `/calendars/${enc(id)}/acl?sendNotifications=true`, { role, scope: { type: 'user', value: email } });

// Allinea il calendario agli eventi voluti (solo quelli creati dall'app, riconosciuti da bf=1)
export async function gSync(calId, desired, from, to, progress) {
  const cal = enc(calId), existing = new Map();
  let pageToken = '';
  do {
    const q = new URLSearchParams({ privateExtendedProperty: 'bf=1', showDeleted: 'true', singleEvents: 'true', maxResults: '2500', timeMin: from + 'T00:00:00Z', timeMax: to + 'T23:59:59Z' });
    if (pageToken) q.set('pageToken', pageToken);
    const j = await g('GET', `/calendars/${cal}/events?${q}`);
    (j.items || []).forEach(e => existing.set(e.id, e));
    pageToken = j.nextPageToken || '';
  } while (pageToken);

  const out = { nuovi: 0, aggiornati: 0, eliminati: 0 }, wanted = new Set();
  let n = 0;
  for (const ev of desired) {
    wanted.add(ev.id);
    const cur = existing.get(ev.id);
    if (!cur) {
      try { await g('POST', `/calendars/${cal}/events`, ev); out.nuovi++; }
      catch (e) { if (e.status !== 409) throw e; await g('PUT', `/calendars/${cal}/events/${ev.id}`, { ...ev, status: 'confirmed' }); out.aggiornati++; }
    } else if (cur.status === 'cancelled' || cur.extendedProperties?.private?.h !== ev.extendedProperties.private.h) {
      await g('PUT', `/calendars/${cal}/events/${ev.id}`, { ...ev, status: 'confirmed' }); out.aggiornati++;
    }
    progress && progress(++n, desired.length);
  }
  for (const [id, e] of existing) {
    if (wanted.has(id) || e.status === 'cancelled') continue;
    try { await g('DELETE', `/calendars/${cal}/events/${id}`); out.eliminati++; }
    catch (err) { if (err.status !== 404 && err.status !== 410) throw err; }
  }
  return out;
}
