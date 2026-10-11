// Statisztikai számítások: kategóriák, rétegzett napok, top források, ételenkénti sorozat.
import { DEFAULT_TEMPLATES, addDays, shortDay } from './calc.js';
import { CAT_ORDER, norm } from './foods.js';

const r1 = (x) => Math.round(x * 10) / 10;

// egy bejegyzés fehérjeforrásai; régi (bontás nélküli) bejegyzéseknél a forrásból következtet
export function itemsOf(e) {
  if (e.items && e.items.length) return e.items;
  const t = DEFAULT_TEMPLATES.find((x) => x.id === e.source);
  if (t && t.items) {
    const base = t.items.reduce((a, i) => a + i.protein, 0);
    return t.items.map((i) => ({ ...i, protein: r1((i.protein / base) * e.protein) }));
  }
  if (e.source === 'shake') {
    const por = Math.min(27, e.protein);
    return [
      { key: 'feherjepor', name: 'Fehérjepor', cat: 'feherjepor', protein: por },
      ...(e.protein - por > 0 ? [{ key: 'tej', name: 'Tej', cat: 'tejtermek', protein: r1(e.protein - por) }] : []),
    ];
  }
  if (e.source === 'chicken') return [{ key: 'csirkemell', name: 'Csirkemell', cat: 'hus', protein: e.protein }];
  if (e.source === 'prepit') return [{ key: 'prepit', name: 'Prepit ebéd', cat: 'keszetel', protein: e.protein }];
  return [{ key: `x-${norm(e.name)}`, name: e.name, cat: 'egyeb', protein: e.protein }];
}

export function catTotals(entries) {
  const m = {};
  for (const e of entries) for (const i of itemsOf(e)) m[i.cat] = r1((m[i.cat] || 0) + i.protein);
  return CAT_ORDER.filter((c) => m[c] > 0).map((c) => ({ cat: c, grams: m[c] }));
}

export function daysByCat(entries, endKey, n) {
  const out = [];
  for (let k = n - 1; k >= 0; k--) {
    const key = addDays(endKey, -k);
    const day = entries.filter((e) => e.date === key);
    const cats = catTotals(day);
    out.push({ key, label: shortDay(key), total: r1(day.reduce((a, e) => a + e.protein, 0)), cats });
  }
  return out;
}

// egymást követő napok, amikor az adott forrás szerepelt; ma még nem szakítja meg
export function streakOf(daySet, todayKey) {
  let key = daySet.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let n = 0;
  while (daySet.has(key)) { n++; key = addDays(key, -1); }
  return n;
}

export function topSources(entries, todayKey, n = 7) {
  const from = addDays(todayKey, -(n - 1));
  const agg = new Map();
  const days = new Map();
  let total = 0;
  for (const e of entries) {
    for (const i of itemsOf(e)) {
      if (!days.has(i.key)) days.set(i.key, new Set());
      days.get(i.key).add(e.date);
      if (e.date < from || e.date > todayKey) continue;
      const a = agg.get(i.key) || { key: i.key, name: i.name, cat: i.cat, grams: 0 };
      a.grams = r1(a.grams + i.protein);
      agg.set(i.key, a);
      total += i.protein;
    }
  }
  return [...agg.values()]
    .map((a) => ({ ...a, share: total ? a.grams / total : 0, streak: streakOf(days.get(a.key), todayKey) }))
    .sort((a, b) => b.grams - a.grams);
}

// összefoglaló: átlag a lezárt napokra (a mai nap még nem teljes), célteljesítés
export function summary(entries, todayKey, n, targetOf, weightOf) {
  const totals = new Map();
  for (const e of entries) totals.set(e.date, (totals.get(e.date) || 0) + e.protein);
  const closed = [];
  let hit = 0;
  let logged = 0;
  for (let k = n - 1; k >= 0; k--) {
    const key = addDays(todayKey, -k);
    const t = totals.get(key) || 0;
    if (t > 0) {
      logged++;
      if (t >= targetOf(key)) hit++;
      if (key !== todayKey) closed.push({ key, t });
    }
  }
  const avg = closed.length ? closed.reduce((a, d) => a + d.t, 0) / closed.length : null;
  const avgGkg = closed.length ? closed.reduce((a, d) => a + d.t / weightOf(d.key), 0) / closed.length : null;
  return { avg, avgGkg, hit, logged };
}
