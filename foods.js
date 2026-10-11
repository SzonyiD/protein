// Ételszótár és szöveges értelmező. Tiszta függvények, Node-ból is tesztelhető.

// kategóriaszínek: a dataviz referencia sötét palettájából, validálva (#161618 felületen, ebben a sorrendben)
export const CATS = {
  hus: { label: 'Hús', color: '#d95926' },
  hal: { label: 'Hal', color: '#3987e5' },
  tojas: { label: 'Tojás', color: '#c98500' },
  tejtermek: { label: 'Tejtermék', color: '#d55181' },
  feherjepor: { label: 'Fehérjepor', color: '#9085e9' },
  novenyi: { label: 'Növényi, köret', color: '#199e70' },
  keszetel: { label: 'Készétel', color: '#e66767' },
  egyeb: { label: 'Egyéb', color: '#6E6E76' },
};
export const CAT_ORDER = ['hus', 'hal', 'tojas', 'tejtermek', 'feherjepor', 'novenyi', 'keszetel', 'egyeb'];

// per100: g fehérje / 100 g (vagy 100 ml), nyers. cooked: sütve/főzve.
// units: egység → gramm. def: alapegység szám után mértékegység nélkül. portion: 1 adag grammban.
export const FOODS = [
  { id: 'tojas', name: 'Tojás', cat: 'tojas', per100: 13, units: { db: 50 }, def: 'db', aliases: ['tojas'] },
  { id: 'turo', name: 'Túró', cat: 'tejtermek', per100: 17, units: { doboz: 250, ek: 30 }, portion: 125, aliases: ['turo'] },
  { id: 'cottage', name: 'Cottage cheese', cat: 'tejtermek', per100: 12, units: { doboz: 200, ek: 30 }, portion: 200, aliases: ['cottage'] },
  { id: 'gorog', name: 'Görög joghurt', cat: 'tejtermek', per100: 9, units: { pohar: 150, doboz: 150, ek: 30 }, portion: 150, aliases: ['gorog joghurt', 'gorog'] },
  { id: 'skyr', name: 'Skyr', cat: 'tejtermek', per100: 11, units: { pohar: 150, doboz: 150 }, portion: 150, aliases: ['skyr'] },
  { id: 'tej', name: 'Tej', cat: 'tejtermek', per100: 3.4, units: { pohar: 250, bogre: 250 }, portion: 250, liquid: true, aliases: ['tej'] },
  { id: 'sajt', name: 'Sajt', cat: 'tejtermek', per100: 25, units: { szelet: 20 }, def: 'szelet', aliases: ['sajt', 'trappista', 'gouda', 'ementali', 'edami'] },
  { id: 'mozzarella', name: 'Mozzarella', cat: 'tejtermek', per100: 18, units: { golyo: 125, db: 125 }, portion: 125, aliases: ['mozzarella'] },
  { id: 'sonka', name: 'Sonka', cat: 'hus', per100: 18, units: { szelet: 28 }, def: 'szelet', aliases: ['sonka'] },
  { id: 'pulykafelvagott', name: 'Pulykafelvágott', cat: 'hus', per100: 20, units: { szelet: 20 }, def: 'szelet', aliases: ['pulykafelvagott', 'pulyka felvagott', 'pulykasonka', 'pulyka sonka', 'pulykamell sonka', 'felvagott'] },
  { id: 'csirkemell', name: 'Csirkemell', cat: 'hus', per100: 23, cooked: 31, units: { db: 200, filet: 200 }, portion: 150, aliases: ['csirkemell', 'csirke mell', 'csirke'] },
  { id: 'csirkecomb', name: 'Csirkecomb', cat: 'hus', per100: 19, cooked: 26, units: { db: 120 }, portion: 150, aliases: ['csirkecomb', 'csirke comb', 'felsocomb', 'comb'] },
  { id: 'pulykamell', name: 'Pulykamell', cat: 'hus', per100: 23, cooked: 30, units: { szelet: 150 }, portion: 150, aliases: ['pulykamell', 'pulyka'] },
  { id: 'daralt', name: 'Darált marha, hamburgerhús', cat: 'hus', per100: 18, cooked: 25, units: { pogacsa: 125, db: 125 }, portion: 150, aliases: ['daralt marha', 'marha daralt', 'daralthus', 'daralt hus', 'daralt', 'hamburgerhus', 'hamburger', 'fasirt'] },
  { id: 'steak', name: 'Marha steak', cat: 'hus', per100: 22, cooked: 29, units: { szelet: 200 }, portion: 200, aliases: ['marha steak', 'steak', 'hatszin', 'bifsztek', 'marha'] },
  { id: 'karaj', name: 'Sertéskaraj', cat: 'hus', per100: 21, cooked: 28, units: { szelet: 120 }, portion: 150, aliases: ['serteskaraj', 'sertes karaj', 'karaj', 'serteshus', 'sertes'] },
  { id: 'lazac', name: 'Lazac', cat: 'hal', per100: 20, cooked: 25, units: { filet: 150, szelet: 150 }, portion: 150, aliases: ['lazac'] },
  { id: 'pisztrang', name: 'Pisztráng', cat: 'hal', per100: 20, cooked: 24, units: { filet: 120, db: 250 }, portion: 150, aliases: ['pisztrang'] },
  { id: 'tonhal', name: 'Tonhalkonzerv', cat: 'hal', per100: 25, units: { doboz: 120, konzerv: 120 }, def: 'doboz', aliases: ['tonhal'] },
  { id: 'tokehal', name: 'Tőkehal, hekk', cat: 'hal', per100: 18, cooked: 23, units: { filet: 150 }, portion: 150, aliases: ['tokehal', 'hekk', 'feher hal'] },
  { id: 'garnela', name: 'Garnélarák', cat: 'hal', per100: 20, cooked: 24, portion: 100, aliases: ['garnelarak', 'garnela', 'shrimp', 'rak'] },
  { id: 'lencse', name: 'Lencse (főtt)', cat: 'novenyi', per100: 9, portion: 200, aliases: ['lencse'] },
  { id: 'bab', name: 'Bab, csicseriborsó (főtt)', cat: 'novenyi', per100: 8, units: { doboz: 240 }, portion: 200, aliases: ['csicseriborso', 'csicseri', 'hummusz', 'bab'] },
  { id: 'tofu', name: 'Tofu', cat: 'novenyi', per100: 13, portion: 100, aliases: ['tofu'] },
  { id: 'kenyer', name: 'Kenyér', cat: 'novenyi', per100: 9, units: { szelet: 40 }, def: 'szelet', aliases: ['kenyer', 'piritos', 'pirito', 'toast'] },
  { id: 'zab', name: 'Zabpehely', cat: 'novenyi', per100: 13, units: { ek: 9 }, def: 'ek', aliases: ['zabpehely', 'zab'] },
  { id: 'rizs', name: 'Rizs (főtt)', cat: 'novenyi', per100: 2.7, portion: 200, aliases: ['rizs'] },
  { id: 'teszta', name: 'Tészta (főtt)', cat: 'novenyi', per100: 5.5, portion: 200, aliases: ['teszta', 'spagetti', 'penne', 'makaroni'] },
];

const UNIT_WORDS = {
  g: 'g', gr: 'g', gramm: 'g', gram: 'g', grammot: 'g',
  dkg: 'dkg', deka: 'dkg', dag: 'dkg',
  kg: 'kg', kilo: 'kg',
  ml: 'ml', dl: 'dl', l: 'l', liter: 'l',
  db: 'db', darab: 'db', drb: 'db',
  szelet: 'szelet', sz: 'szelet',
  ek: 'ek', evokanal: 'ek', kanal: 'ek',
  tk: 'tk', teaskanal: 'tk',
  pohar: 'pohar', bogre: 'bogre',
  doboz: 'doboz', konzerv: 'konzerv', csomag: 'doboz',
  pogacsa: 'pogacsa', filet: 'filet', file: 'filet',
  golyo: 'golyo', adag: 'adag',
};
const UNIT_LABEL = { g: 'g', ml: 'ml', db: 'db', szelet: 'szelet', ek: 'ek', pohar: 'pohár', bogre: 'bögre', doboz: 'doboz', konzerv: 'konzerv', pogacsa: 'pogácsa', filet: 'filé', golyo: 'golyó', adag: 'adag' };
const NUM_WORDS = { fel: 0.5, masfel: 1.5, egy: 1, ket: 2, ketto: 2, harom: 3, negy: 4, ot: 5 };
// magyar ragok az étel neve után ("tojást", "túróval", "lazaccal"), de "zabkása" ≠ "zab"
const SUFFIX = '(?:t|at|et|ot|ak|ek|ok|kat|ket|akat|eket|okat|bol|rol|tol|ban|ben|ba|be|ra|re|hoz|hez|nak|nek|[a-z]?al|[a-z]?el)?';
const COOKED_RE = /\b(sult|sutve|grill\w*|fott|fozott|rantott|serpenyo\w*|rosztelt|sutoben)\b/;

export function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.,+\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function splitItems(text) {
  return String(text)
    .replace(/(\d),(\d)/g, '$1.$2')
    .split(/\s*(?:\+|,|;|\n|\s(?:és|es|meg)\s)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

// alias → étel; a leghosszabb illeszkedő alias nyer (pl. "daralt marha" a "marha" előtt)
export function matchFood(nText, foods) {
  let best = null;
  for (const f of foods) {
    for (const a of f.aliases) {
      const re = new RegExp(`(^|\\s)${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${SUFFIX}(\\s|$)`);
      if (re.test(nText) && (!best || a.length > best.alias.length)) best = { food: f, alias: a };
    }
  }
  return best ? best.food : null;
}

function readQty(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let q = null;
    let unit = null;
    let m = t.match(/^(\d+(?:\.\d+)?)([a-z]+)?$/);
    if (m) {
      q = Number(m[1]);
      if (m[2] && UNIT_WORDS[m[2]]) unit = UNIT_WORDS[m[2]];
    } else if (NUM_WORDS[t] != null) q = NUM_WORDS[t];
    if (q == null) continue;
    if (!unit && tokens[i + 1] && UNIT_WORDS[tokens[i + 1]]) unit = UNIT_WORDS[tokens[i + 1]];
    return { qty: q, unit };
  }
  return { qty: null, unit: null };
}

const round1 = (x) => Math.round(x * 10) / 10;
const fmtQ = (q) => String(round1(q)).replace('.', ',');

// egy tétel értékelése; foods = beépített + saját
export function parseItem(raw, foods) {
  const n = norm(raw);
  const tokens = n.split(' ');
  const { qty, unit } = readQty(tokens);
  const food = matchFood(n, foods);
  if (!food) {
    // név = a nyers szöveg a mennyiség és a mértékegység szavai nélkül (ékezetek megmaradnak)
    const name = raw.split(/\s+/).filter((w) => {
      const t = norm(w);
      return t && !/^\d+(\.\d+)?[a-z]*$/.test(t) && NUM_WORDS[t] == null && !UNIT_WORDS[t];
    }).join(' ');
    return { raw, known: false, qty, unit, name: cap(name || raw.trim()) };
  }

  // saját, adagra rögzített étel (pl. "Túrórudi = 12 g / adag")
  if (food.perUnit != null) {
    const q = qty ?? 1;
    return { raw, known: true, food, grams: null, protein: round1(q * food.perUnit), label: `${fmtQ(q)} adag ${food.name.toLowerCase()}` };
  }

  const cooked = food.cooked != null && COOKED_RE.test(n) && !/\bnyers\b/.test(n);
  const per100 = cooked ? food.cooked : food.per100;
  const units = food.units || {};
  let grams;
  let shown;
  if (unit === 'g' || unit === 'ml') { grams = qty; shown = `${fmtQ(qty)} ${food.liquid ? 'ml' : 'g'}`; }
  else if (unit === 'dkg') { grams = qty * 10; shown = `${fmtQ(qty)} dkg`; }
  else if (unit === 'kg') { grams = qty * 1000; shown = `${fmtQ(qty)} kg`; }
  else if (unit === 'dl') { grams = qty * 100; shown = `${fmtQ(qty)} dl`; }
  else if (unit === 'l') { grams = qty * 1000; shown = `${fmtQ(qty)} l`; }
  else if (unit && units[unit]) { grams = qty * units[unit]; shown = `${fmtQ(qty)} ${UNIT_LABEL[unit] || unit}`; }
  else if (unit === 'adag') { grams = qty * (food.portion || 100); shown = `${fmtQ(qty)} adag`; }
  else if (qty == null) {
    const u = food.def || (units.db ? 'db' : null);
    grams = u ? units[u] : (food.portion || 100);
    shown = u ? `1 ${UNIT_LABEL[u]}` : `${grams} ${food.liquid ? 'ml' : 'g'} (becsült)`;
  } else if (qty >= 15) { grams = qty; shown = `${fmtQ(qty)} ${food.liquid ? 'ml' : 'g'}`; }
  else {
    const u = food.def || (units.db ? 'db' : null);
    if (u) { grams = qty * units[u]; shown = `${fmtQ(qty)} ${UNIT_LABEL[u]}`; }
    else { grams = qty * (food.portion || 100); shown = `${fmtQ(qty)} adag`; }
  }
  return {
    raw, known: true, food, grams, cooked,
    protein: round1((grams * per100) / 100),
    label: `${shown} ${food.name.toLowerCase()}${cooked ? ' (sült)' : ''}`,
  };
}

export function parseText(text, foods) {
  return splitItems(text).map((s) => parseItem(s, foods));
}

// egyetlen ismeretlen tétel számmal = régi rövidítés ("Túrórudi 12 g" → 12 g fehérje)
export function shorthandProtein(items) {
  if (items.length !== 1 || items[0].known) return null;
  const it = items[0];
  if (it.qty == null || (it.unit && it.unit !== 'g')) return null;
  return it.qty;
}

// ismeretlen tételből saját étel: a megadott fehérjéből visszaszámolja az arányt
export function learnFood(item, protein) {
  const alias = norm(item.name);
  const base = { id: `sajat-${alias.replace(/\s+/g, '-')}`, name: item.name, cat: 'egyeb', aliases: [alias], custom: true };
  if (item.qty != null && (item.unit === 'g' || item.unit === 'ml') && item.qty >= 15 && protein !== item.qty) {
    return { ...base, per100: round1((protein / item.qty) * 100), portion: item.qty };
  }
  const q = item.qty != null && item.unit !== 'g' ? item.qty : 1;
  return { ...base, perUnit: round1(protein / q) };
}

// étel lap: g vagy egység alapján
export function proteinFor(food, amount, unit, cooked) {
  if (food.perUnit != null) return round1(amount * food.perUnit);
  const per100 = cooked && food.cooked != null ? food.cooked : food.per100;
  const grams = unit === 'g' ? amount : amount * ((food.units || {})[unit] || 0);
  return round1((grams * per100) / 100);
}

export function unitLabel(u) { return UNIT_LABEL[u] || u; }

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
