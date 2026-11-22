// Foto dello scontrino: compressione, lettura con Google Cloud Vision, interpretazione.

// Riduce la foto (lato lungo max 1600 px, JPEG): più leggera da caricare e da leggere
export async function comprimi(file, maxLato = 1600, qualita = 0.82) {
  let img;
  try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Immagine non leggibile')); i.src = URL.createObjectURL(file); });
  }
  const w = img.width, h = img.height, k = Math.min(1, maxLato / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', qualita));
  if (!blob) throw new Error('Impossibile preparare la foto');
  return blob;
}
const toBase64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

export async function leggiTesto(blob, apiKey) {
  const body = { requests: [{ image: { content: await toBase64(blob) }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], imageContext: { languageHints: ['it'] } }] };
  let r;
  try { r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new Error('Servizio di lettura non raggiungibile: controlla la connessione.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.responses?.[0]?.error) {
    const msg = j.error?.message || j.responses?.[0]?.error?.message || r.status;
    if (/billing/i.test(msg)) throw new Error('Google Vision: va collegato un account di fatturazione al progetto (vedi LEGGIMI).');
    if (/referer|API key|blocked|not been used|disabled/i.test(msg)) throw new Error('Google Vision: chiave non valida o non abilitata per questo sito (vedi LEGGIMI).');
    throw new Error('Google Vision: ' + msg);
  }
  return j.responses?.[0]?.fullTextAnnotation?.text || '';
}

// ---------- interpretazione di uno scontrino italiano ----------
const RE_IMP = /(?:€\s*)?(-?\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})(?![\d%])(?!\s*%)/g;
const num = s => parseFloat(s.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
const importi = riga => [...riga.matchAll(RE_IMP)].map(m => num(m[1])).filter(v => isFinite(v) && v > 0 && v < 100000);

export function interpreta(testo, oggi = new Date()) {
  const righe = testo.split(/\n/).map(r => r.trim()).filter(Boolean);
  const up = righe.map(r => r.toUpperCase());
  const out = { importo: null, data: null, negozio: null, metodo: null, testo };

  // totale: parole chiave in ordine di affidabilità; l'importo può stare sulla stessa riga o nelle 3 successive
  const chiavi = [/TOTALE\s+COMPLESSIVO/, /IMPORTO\s+PAGATO/, /TOTALE\s+(EURO|EUR|€|DA\s+PAGARE)/, /^TOTALE\b(?!.*(IVA|IMPONIBILE|PEZZI|ARTICOLI|SCONTI|RISPARMI))/, /\bTOTALE\b(?!.*(IVA|IMPONIBILE|PEZZI|ARTICOLI|SCONTI|RISPARMI))/, /PAGAMENTO\s+ELETTRONICO/, /\bTOT\b/];
  cerca: for (const re of chiavi) {
    for (let i = 0; i < up.length; i++) {
      if (!re.test(up[i]) || /SUBTOT/.test(up[i])) continue;
      for (let k = 0; k <= 3 && i + k < righe.length; k++) {
        if (k > 0 && /[A-Z]{4,}/.test(up[i + k]) && !/EUR|€/.test(up[i + k])) break;
        const v = importi(righe[i + k]);
        if (v.length) { out.importo = v[v.length - 1]; break cerca; }
      }
    }
  }
  // controllo incrociato: il totale di solito compare più volte (totale, pagamento, importo pagato, carta)
  const freq = new Map();
  righe.forEach((r, i) => { if (/IVA|IMPONIBILE|RESTO|SCONTO/.test(up[i]) && importi(r).length === 1 && !/TOTALE/.test(up[i])) return; importi(r).forEach(v => freq.set(v, (freq.get(v) || 0) + 1)); });
  const ripetuti = [...freq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (ripetuti.length && (out.importo == null || (freq.get(out.importo) || 0) < 2)) out.importo = ripetuti[0][0];
  if (out.importo == null) { const tutti = righe.flatMap(importi); if (tutti.length) out.importo = Math.max(...tutti); }
  // parole utili a capire la categoria (es. cappuccino, benzina)
  out.articoli = up.join(' ');

  // data: gg/mm/aa(aa) plausibile (non nel futuro, non più vecchia di 2 anni)
  const lim = new Date(oggi); lim.setFullYear(lim.getFullYear() - 2);
  for (const m of testo.matchAll(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g)) {
    let [, g, me, a] = m; g = +g; me = +me; a = +a; if (a < 100) a += 2000;
    const d = new Date(a, me - 1, g, 12);
    if (me < 1 || me > 12 || g < 1 || g > 31 || d.getMonth() !== me - 1 || d > new Date(oggi.getTime() + 864e5) || d < lim) continue;
    out.data = `${a}-${String(me).padStart(2, '0')}-${String(g).padStart(2, '0')}`; break;
  }

  // negozio: prima riga "di testo" in alto, saltando intestazioni standard
  const salta = /DOCUMENTO|COMMERCIALE|SCONTRINO|FISCALE|DESCRIZIONE|P\.?\s?IVA|PARTITA|C\.?F\.?|^VIA\b|^V\.LE|^PIAZZA|^CORSO|TEL|WWW|@|^\d|BENVENUT|GRAZIE|CASSA|OPERATORE|^\*+/;
  for (const r of righe.slice(0, 8)) {
    const u = r.toUpperCase();
    if (r.replace(/[^A-Za-zÀ-ú]/g, '').length < 3 || salta.test(u)) continue;
    out.negozio = r.replace(/\s+/g, ' ').replace(/[*_]+/g, '').trim().slice(0, 40);
    out.negozio = out.negozio.replace(/[\s,]+(S\.?\s?P\.?\s?A\.?|S\.?\s?R\.?\s?L\.?|S\.?\s?N\.?\s?C\.?|S\.?\s?A\.?\s?S\.?)\s*$/i, '')
      .toLowerCase().replace(/(^|[\s'.-])([a-zà-ú])/g, (m, p, c) => p + c.toUpperCase());
    break;
  }

  const t = up.join(' ');
  if (/CONTANT/.test(t) && !/PAGAMENTO\s+ELETTRONICO/.test(t)) out.metodo = 'Contanti';
  else if (/SATISPAY/.test(t)) out.metodo = 'Satispay';
  else if (/CARTA\s+DI\s+CREDITO|VISA|MASTERCARD|AMEX|AMERICAN EXPRESS/.test(t) && !/BANCOMAT|PAGOBANCOMAT|DEBIT/.test(t)) out.metodo = 'Carta di credito';
  else if (/PAGAMENTO\s+ELETTRONICO|BANCOMAT|POS|CARTA|DEBIT/.test(t)) out.metodo = 'Bancomat';
  return out;
}
