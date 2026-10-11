// Tiszta számítási függvények – nincs DOM, nincs tároló. Node-ból is tesztelhető.

export const DEFAULT_SETTINGS = { gPerKg: 1.8, startWeight: 88 };

// A sablonok a kódban élnek (nem a tárolóban), így frissítéskor az új gombok is megjelennek.
// items: a fehérjeforrások bontása a statisztikához.
export const DEFAULT_TEMPLATES = [
  { id: 'reggeli', name: 'Reggeli', detail: '6 ek zab + joghurt', kind: 'fixed', protein: 23,
    items: [{ key: 'joghurt', name: 'Proteines joghurt', cat: 'tejtermek', protein: 16 }, { key: 'zab', name: 'Zabpehely', cat: 'novenyi', protein: 7 }] },
  { id: 'prewo', name: 'Pre-workout', detail: 'banán + YoPro', kind: 'fixed', protein: 26,
    items: [{ key: 'yopro', name: 'YoPro', cat: 'tejtermek', protein: 25 }, { key: 'banan', name: 'Banán', cat: 'novenyi', protein: 1 }] },
  { id: 'shake', name: 'Shake', detail: 'por + tej', kind: 'shake', scoop: 27, milkPerL: 50, defaultMl: 300 },
  { id: 'csirke', name: 'Csirkemell', detail: 'gramm alapján', kind: 'chicken', raw: 23, cooked: 31 },
  { id: 'prepit', name: 'Prepit ebéd', detail: 'mentett menük', kind: 'prepit' },
  { id: 'tegnap', name: 'Tegnapi nap', detail: 'ismétlés', kind: 'repeat' },
  { id: 'etel', name: 'Étel', detail: 'tojás, hús, hal, tejtermék…', kind: 'food' },
];

const WEEKDAYS = ['Vasárnap', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat'];
const WEEKDAY_SHORT = ['V', 'H', 'K', 'Sze', 'Cs', 'P', 'Szo'];
const MONTHS = ['Január', 'Február', 'Március', 'Április', 'Május', 'Június', 'Július',
  'Augusztus', 'Szeptember', 'Október', 'November', 'December'];

// ---- dátumok (helyi idő, a nap éjfélkor vált) ----
const pad = (n) => String(n).padStart(2, '0');

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // dél, hogy az óraátállítás ne csússzon
}

export function addDays(key, n) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function timeHM(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dateLabel(key) {
  const d = keyToDate(key);
  return { weekday: WEEKDAYS[d.getDay()], date: `${MONTHS[d.getMonth()]} ${d.getDate()}.` };
}

export function shortDay(key) {
  return WEEKDAY_SHORT[keyToDate(key).getDay()];
}

// ---- számformázás (magyar: tizedesvessző, Unicode mínusz) ----
export function fmt(n, dec = 0) {
  if (n == null || Number.isNaN(n)) return '–';
  const s = Math.abs(n).toFixed(dec).replace('.', ',');
  return (n < 0 && Number(Math.abs(n).toFixed(dec)) !== 0 ? '−' : '') + s;
}

export function parseNum(str) {
  if (str == null) return NaN;
  return Number(String(str).trim().replace(/\s/g, '').replace(',', '.'));
}

// ---- cél ----
export function targetFor(weightKg, gPerKg) {
  return Math.round((weightKg * gPerKg) / 5) * 5;
}

// a nap súlya: az adott napon vagy előtte rögzített utolsó mérés
export function weightOn(weights, key, fallback) {
  let best = null;
  for (const w of weights) {
    if (w.date <= key && (!best || w.date > best.date)) best = w;
  }
  return best ? best.kg : fallback;
}

// ---- sablonok ----
export function shakeProtein(ml, scoop = 27, milkPerL = 50) {
  return scoop + (ml * milkPerL) / 1000;
}

export function chickenProtein(grams, cooked, raw = 23, cookedPer100 = 31) {
  return (grams * (cooked ? cookedPer100 : raw)) / 100;
}

// ---- napi összesítések ----
export function totalsByDay(entries) {
  const m = new Map();
  for (const e of entries) m.set(e.date, (m.get(e.date) || 0) + e.protein);
  return m;
}

export function lastNDays(totals, endKey, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = addDays(endKey, -i);
    out.push({ key, total: totals.get(key) || 0, label: shortDay(key) });
  }
  return out;
}

// egymást követő célteljesítő napok; a mai nap csak akkor számít, ha már teljesült,
// de ha még nem, nem szakítja meg a sorozatot
export function streak(totals, todayKey, targetOf) {
  let count = 0;
  if ((totals.get(todayKey) || 0) >= targetOf(todayKey)) count = 1;
  let key = addDays(todayKey, -1);
  for (let i = 0; i < 3650; i++) {
    if ((totals.get(key) || 0) >= targetOf(key)) { count++; key = addDays(key, -1); }
    else break;
  }
  return count;
}

// ---- gyors szöveges bevitel (1. lépés: "név 30" vagy "név 30 g") ----
// A teljes ételszótáras értelmező a 2. lépésben váltja ki.
export function quickParse(text) {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  let m = t.match(/^(.*?)[\s,:]*(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramm)?\.?$/i);
  if (m && m[1].trim()) return { name: cap(m[1].trim()), protein: parseNum(m[2]) };
  m = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramm)?\s+(.+)$/i);
  if (m) return { name: cap(m[2].trim()), protein: parseNum(m[1]) };
  return { name: cap(t), protein: null };
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
