// Grafici SVG leggeri, senza librerie esterne.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
const short = v => {
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1000) return s + (a / 1000).toLocaleString('it-IT', { maximumFractionDigits: a >= 10000 ? 0 : 1 }) + 'k';
  return s + Math.round(a).toLocaleString('it-IT');
};

function tooltip(host) {
  let t = host.querySelector('.chart-tip');
  if (!t) { t = document.createElement('div'); t.className = 'chart-tip'; host.appendChild(t); }
  return {
    show(html, x, y) {
      t.innerHTML = html; t.style.display = 'block';
      const w = host.clientWidth, tw = t.offsetWidth;
      t.style.left = Math.max(0, Math.min(w - tw, x - tw / 2)) + 'px';
      t.style.top = Math.max(0, y - t.offsetHeight - 8) + 'px';
    },
    hide() { t.style.display = 'none'; },
  };
}

/**
 * Colonne raggruppate (opzionale: una linea sovrapposta).
 * opts: { labels, series:[{name,color,values,dashed?}], height, fmt, onClick(i) }
 */
export function columns(host, opts) {
  host.innerHTML = '';
  host.classList.add('chart');
  const W = Math.max(host.clientWidth || 600, 280), H = opts.height || 220;
  const m = { l: 40, r: 8, t: 10, b: 26 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' }, host);
  const vals = opts.series.flatMap(s => s.values.map(v => Math.abs(v || 0)));
  const max = niceMax(Math.max(...vals, 1));
  const n = opts.labels.length, ns = opts.series.length;
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const band = iw / n, gap = Math.min(10, band * 0.2);
  const inner = band < 14 ? 0.5 : 2;
  const bw = Math.max(1.2, Math.min(24, (band - gap) / ns - inner));
  const y = v => m.t + ih - (v / max) * ih;
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i, yy = y(v);
    el('line', { x1: m.l, x2: W - m.r, y1: yy, y2: yy, class: i ? 'grid' : 'axis' }, svg);
    el('text', { x: m.l - 6, y: yy + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent = short(v);
  }
  const tip = tooltip(host);
  const fmt = opts.fmt || (v => v);
  opts.labels.forEach((lab, i) => {
    const cx = m.l + band * i + band / 2;
    const groupW = ns * (bw + inner) - inner;
    const hit = el('rect', { x: m.l + band * i, y: m.t, width: band, height: ih, fill: 'transparent', class: 'hit' }, svg);
    opts.series.forEach((s, j) => {
      const v = Math.abs(s.values[i] || 0);
      if (!v) return;
      const x = cx - groupW / 2 + j * (bw + inner);
      const h = Math.max(1, (v / max) * ih);
      const r = Math.min(4, bw / 2, h) * (bw < 4 ? 0 : 1);
      el('path', {
        d: `M${x},${m.t + ih} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z`,
        fill: s.color, class: 'bar' + (s.dashed ? ' muted' : ''),
      }, svg);
    });
    const every = Math.max(1, Math.ceil(46 / band));
    if (i % every === 0) el('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = lab;
    const showTip = () => {
      const rows = opts.series.map(s => `<div><span class="sw" style="background:${s.color}"></span>${s.name}: <b>${fmt(s.values[i] || 0)}</b></div>`).join('');
      const extra = opts.extra ? opts.extra(i) : '';
      tip.show(`<div class="tip-h">${opts.tipLabels ? opts.tipLabels[i] : lab}</div>${rows}${extra}`, (cx / W) * host.clientWidth, (m.t / H) * H + 20);
    };
    hit.addEventListener('mouseenter', showTip);
    hit.addEventListener('mouseleave', () => tip.hide());
    hit.addEventListener('click', () => { showTip(); opts.onClick && opts.onClick(i); });
  });
  if (opts.line) {
    const lv = opts.line.values;
    const lmax = niceMax(Math.max(...lv.map(Math.abs), 1));
    const ly = v => m.t + ih / 2 - (v / lmax) * (ih / 2);
    const pts = lv.map((v, i) => `${m.l + band * i + band / 2},${ly(v)}`).join(' ');
    el('polyline', { points: pts, fill: 'none', stroke: opts.line.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
  }
  return svg;
}

/** Linea semplice con area. opts: { labels, values, color, height, fmt } */
export function line(host, opts) {
  host.innerHTML = '';
  host.classList.add('chart');
  const W = Math.max(host.clientWidth || 600, 280), H = opts.height || 200;
  const m = { l: 44, r: 10, t: 10, b: 26 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' }, host);
  const v = opts.values;
  if (!v.length) return svg;
  let lo = Math.min(...v), hi = Math.max(...v);
  const pad = (hi - lo) * 0.15 || hi * 0.1 || 1;
  lo = Math.max(0, lo - pad); hi = hi + pad;
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const xs = opts.xs, x0 = xs ? xs[0] : 0, x1 = xs ? xs[xs.length - 1] : 1;
  const x = i => m.l + (v.length === 1 ? iw / 2 : xs ? (iw * (xs[i] - x0)) / (x1 - x0 || 1) : (iw * i) / (v.length - 1));
  const y = val => m.t + ih - ((val - lo) / (hi - lo)) * ih;
  for (let i = 0; i <= 4; i++) {
    const val = lo + ((hi - lo) / 4) * i;
    el('line', { x1: m.l, x2: W - m.r, y1: y(val), y2: y(val), class: i ? 'grid' : 'axis' }, svg);
    el('text', { x: m.l - 6, y: y(val) + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent = short(val);
  }
  const pts = v.map((val, i) => `${x(i)},${y(val)}`).join(' ');
  el('polygon', { points: `${x(0)},${m.t + ih} ${pts} ${x(v.length - 1)},${m.t + ih}`, fill: opts.color, opacity: 0.1 }, svg);
  el('polyline', { points: pts, fill: 'none', stroke: opts.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
  const step = Math.ceil(v.length / Math.max(2, Math.floor(iw / 50)));
  let lastLabelX = -1e9;
  const tip = tooltip(host); const fmt = opts.fmt || (a => a);
  v.forEach((val, i) => {
    if ((xs ? x(i) - lastLabelX > 60 : i % step === 0) || (i === v.length - 1 && x(i) - lastLabelX > 40)) {
      el('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = opts.labels[i];
      lastLabelX = x(i);
    }
    const dot = el('circle', { cx: x(i), cy: y(val), r: v.length > 40 ? 2 : 3.5, fill: opts.color, class: 'dot' }, svg);
    const hw = xs ? 10 : iw / v.length; const hit = el('rect', { x: x(i) - hw / 2, y: m.t, width: Math.max(4, hw), height: ih, fill: 'transparent' }, svg);
    const show = () => tip.show(`<div class="tip-h">${opts.tipLabels ? opts.tipLabels[i] : opts.labels[i]}</div><b>${fmt(val)}</b>`, (x(i) / W) * host.clientWidth, (y(val) / H) * H);
    hit.addEventListener('mouseenter', show); hit.addEventListener('click', show);
    hit.addEventListener('mouseleave', () => tip.hide());
    void dot;
  });
  return svg;
}
