import * as db from './db.js';
import * as c from './calc.js';
import * as F from './foods.js';
import * as St from './stats.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const RING_C = 2 * Math.PI * 96;

const S = {
  today: c.dayKey(),
  day: c.dayKey(),
  entries: [],
  weights: [],
  settings: { ...c.DEFAULT_SETTINGS },
  templates: c.DEFAULT_TEMPLATES,
  prepit: [],
  training: {},
  customFoods: [],
  foodUse: {},
  lastBackup: null,
  backupSnooze: null,
};

// ---------- betöltés ----------
async function load() {
  [S.entries, S.weights] = await Promise.all([db.getAll('entries'), db.getAll('weights')]);
  S.settings = { ...c.DEFAULT_SETTINGS, ...(await db.getKV('settings', {})) };
  S.templates = c.DEFAULT_TEMPLATES;
  S.prepit = await db.getKV('prepit', []);
  S.training = await db.getKV('training', {});
  S.customFoods = await db.getKV('foods', []);
  S.foodUse = await db.getKV('foodUse', {});
  S.lastBackup = await db.getKV('lastBackup', null);
  S.backupSnooze = await db.getKV('backupSnooze', null);
  if (!S.weights.length) {
    const w = { date: S.today, kg: S.settings.startWeight };
    S.weights = [w];
    await db.put('weights', w);
  }
}

const weightFor = (key) => c.weightOn(S.weights, key, S.settings.startWeight);
const targetOf = (key) => c.targetFor(weightFor(key), S.settings.gPerKg);
const dayEntries = (key) => S.entries.filter((e) => e.date === key).sort((a, b) => a.time.localeCompare(b.time));

// ---------- adatműveletek ----------
const allFoods = () => [...S.customFoods, ...F.FOODS];
const r1 = (x) => Math.round(x * 10) / 10;
const fmtG = (g) => c.fmt(g, g % 1 ? 1 : 0);

async function bumpUse(ids) {
  for (const id of ids) S.foodUse[id] = (S.foodUse[id] || 0) + 1;
  await db.setKV('foodUse', S.foodUse);
}

async function addEntry({ name, protein, time, date, source, items }) {
  const e = {
    id: c.uid(),
    date: date || S.day,
    time: time || (S.day === S.today ? c.timeHM() : '12:00'),
    name: String(name).trim() || 'Tétel',
    protein: r1(protein),
    source: source || 'manual',
  };
  if (items && items.length) e.items = items.map((i) => ({ ...i, protein: r1(i.protein) }));
  S.entries.push(e);
  await db.put('entries', e);
  return e;
}

async function removeEntries(ids) {
  const set = new Set(ids);
  const removed = S.entries.filter((e) => set.has(e.id));
  S.entries = S.entries.filter((e) => !set.has(e.id));
  await Promise.all(ids.map((id) => db.del('entries', id)));
  return removed;
}

async function restoreEntries(list) {
  S.entries.push(...list);
  await db.putMany('entries', list);
}

// ---------- kirajzolás: Ma ----------
function renderMa() {
  const { weekday, date } = c.dateLabel(S.day);
  $('day-weekday').textContent = S.day === S.today ? `Ma · ${weekday}` : weekday;
  $('day-date').textContent = date;
  $('day-next').disabled = S.day >= S.today;
  $('go-today').hidden = S.day === S.today;
  $('log-title').textContent = S.day === S.today ? 'Ma' : 'Napló';
  $('weight-val').textContent = c.fmt(weightFor(S.today), 1);

  const totals = c.totalsByDay(S.entries);
  const total = totals.get(S.day) || 0;
  const target = targetOf(S.day);
  const frac = Math.min(total / target, 1);

  const fg = $('ring-fg');
  fg.style.strokeDasharray = `${frac * RING_C} ${RING_C}`;
  fg.style.strokeOpacity = total > 0 ? 1 : 0;
  $('ring-wrap').classList.toggle('done', total >= target);
  $('ring-wrap').setAttribute('aria-label', `${c.fmt(total)} gramm a ${target} grammos célból`);
  $('ring-num').textContent = c.fmt(total);
  $('ring-target').textContent = target;

  const missing = target - total;
  $('t-missing-l').textContent = missing > 0 ? 'Hiányzik' : 'Cél felett';
  $('t-missing').textContent = missing > 0 ? `${c.fmt(missing)} g` : `+${c.fmt(-missing)} g`;
  $('t-gkg').textContent = c.fmt(total / weightFor(S.day), 2);
  $('t-streak').textContent = `${c.streak(totals, S.today, targetOf)} nap`;

  const trained = !!S.training[S.day];
  $('train-toggle').setAttribute('aria-pressed', String(trained));
  $('train-label').textContent = trained ? 'Edzésnap' : 'Edzésnap?';

  renderQuick();
  renderLog();
  renderWeek(totals);
}

function renderQuick() {
  $('quick').innerHTML = S.templates.map((t) => {
    let val = '';
    if (t.kind === 'fixed') val = `<span class="q-val">${c.fmt(t.protein)} g</span>`;
    else if (t.kind === 'shake') val = `<span class="q-val">${c.fmt(c.shakeProtein(t.defaultMl, t.scoop, t.milkPerL))} g</span>`;
    else if (t.kind === 'chicken') val = '<span class="q-val dim">g →</span>';
    else if (t.kind === 'prepit') val = '<span class="q-val dim">lista</span>';
    else if (t.kind === 'repeat') val = '<span class="q-val dim">↺</span>';
    else if (t.kind === 'food') val = '<span class="q-val dim">tojás, hús, hal… →</span>';
    return `<button class="q${t.kind === 'food' ? ' q-wide' : ''}" data-t="${esc(t.id)}"><span class="q-name">${esc(t.name)}</span>${val}</button>`;
  }).join('');
}

function renderLog() {
  const list = dayEntries(S.day);
  if (!list.length) {
    $('log').innerHTML = `<div class="empty">${S.day === S.today ? 'Még nincs bejegyzés ma. Kezdd egy gyors sablonnal.' : 'Ezen a napon nincs bejegyzés.'}</div>`;
    return;
  }
  $('log').innerHTML = list.map((e) => `
    <div class="entry" data-id="${esc(e.id)}">
      <div class="entry-del" aria-hidden="true">Törlés</div>
      <button class="entry-row" data-id="${esc(e.id)}" aria-label="${esc(e.name)}, ${c.fmt(e.protein, e.protein % 1 ? 1 : 0)} gramm, ${esc(e.time)}. Koppints a szerkesztéshez.">
        <span class="e-time">${esc(e.time)}</span>
        <span class="e-name">${esc(e.name)}</span>
        <span class="e-val">${c.fmt(e.protein, e.protein % 1 ? 1 : 0)} g</span>
      </button>
    </div>`).join('');
}

function renderWeek(totals) {
  const sevenAgo = c.addDays(S.today, -6);
  const end = S.day >= sevenAgo ? S.today : c.addDays(S.day, 3) > S.today ? S.today : c.addDays(S.day, 3);
  const days = c.lastNDays(totals, end, 7);
  const target = targetOf(S.day);
  const max = Math.max(target * 1.2, ...days.map((d) => d.total * 1.06));
  const H = 120;

  $('bars').innerHTML = `<div class="target-line" style="bottom:${(target / max) * H}px"></div>` +
    days.map((d) => {
      const cls = ['bar', d.key === S.day ? 'sel' : '', d.total >= targetOf(d.key) ? 'hit' : ''].join(' ');
      return `<button class="${cls}" data-day="${d.key}" style="height:${Math.max(4, (d.total / max) * H)}px" aria-label="${c.dateLabel(d.key).date}: ${c.fmt(d.total)} gramm"></button>`;
    }).join('');
  $('bar-labels').innerHTML = days.map((d) => `<span class="${d.key === S.day ? 'sel' : ''}">${d.label}</span>`).join('');

  const done = days.filter((d) => d.key !== S.today && d.total > 0);
  $('avg7').textContent = done.length ? `${c.fmt(done.reduce((a, d) => a + d.total, 0) / done.length)} g` : '–';
}

// ---------- kirajzolás: Súly, Beállítások ----------
function renderSuly() {
  const list = [...S.weights].sort((a, b) => b.date.localeCompare(a.date));
  $('weight-log').innerHTML = list.map((w) => `
    <div class="entry"><button class="entry-row" data-wdate="${w.date}">
      <span class="e-name">${c.dateLabel(w.date).date} <span class="muted small">${w.date.slice(0, 4)}</span></span>
      <span class="e-val">${c.fmt(w.kg, 1)} kg</span>
    </button></div>`).join('');
}

function renderBeall() {
  $('gpk').value = S.settings.gPerKg;
  $('gpk-val').textContent = c.fmt(S.settings.gPerKg, 1);
  $('gpk-hint').textContent = `Napi cél ${c.fmt(weightFor(S.today), 1)} kg mellett: ${targetOf(S.today)} g`;
}

// ---------- Statisztika ----------
let statSel = null;

function renderStat() {
  const N = 7;
  const sum = St.summary(S.entries, S.today, N, targetOf, weightFor);
  $('st-tiles').innerHTML = `
    <div class="tile"><div class="tile-l">Átlag</div><div class="tile-v">${sum.avg == null ? '–' : `${c.fmt(sum.avg)} g`}</div></div>
    <div class="tile"><div class="tile-l">Átlag g/kg</div><div class="tile-v">${sum.avgGkg == null ? '–' : c.fmt(sum.avgGkg, 2)}</div></div>
    <div class="tile"><div class="tile-l">Cél teljesült</div><div class="tile-v">${sum.hit}/${sum.logged || 0} nap</div></div>`;

  // ma, kategóriánként
  const todayCats = St.catTotals(S.entries.filter((e) => e.date === S.today));
  const maxC = Math.max(1, ...todayCats.map((x) => x.grams));
  $('st-today').innerHTML = todayCats.length ? todayCats.map((x) => `
    <div class="hbar">
      <span class="hbar-l">${dot(x.cat)}${F.CATS[x.cat].label}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${(x.grams / maxC) * 100}%;background:${F.CATS[x.cat].color}"></span></span>
      <span class="hbar-v">${fmtG(x.grams)} g</span>
    </div>`).join('') : '<div class="empty" style="padding:4px 0">Ma még nincs bejegyzés.</div>';

  // 7 nap, rétegzett oszlopok
  const days = St.daysByCat(S.entries, S.today, N);
  const target = targetOf(S.today);
  const max = Math.max(target * 1.2, ...days.map((d) => d.total * 1.06));
  const H = 140 - 2 * 7; // a szegmensek közti 2 px-es rések helye, hogy a legmagasabb oszlop se lógjon ki
  if (!statSel || !days.some((d) => d.key === statSel)) statSel = S.today;
  $('st-bars').innerHTML = `<div class="target-line" style="bottom:${(target / max) * H}px"></div>` + days.map((d) => {
    const segs = d.cats.map((x) => `<span class="seg-fill" style="height:${(x.grams / max) * H}px;background:${F.CATS[x.cat].color}"></span>`).join('');
    return `<button class="sbar${d.key === statSel ? ' sel' : ''}" data-sday="${d.key}" aria-label="${c.dateLabel(d.key).date}: ${c.fmt(d.total)} gramm">${segs || '<span class="seg-empty"></span>'}</button>`;
  }).join('');
  $('st-labels').innerHTML = days.map((d) => `<span class="${d.key === statSel ? 'sel' : ''}">${d.label}</span>`).join('');
  const used = F.CAT_ORDER.filter((k) => days.some((d) => d.cats.some((x) => x.cat === k)));
  $('st-legend').innerHTML = used.map((k) => `<span class="lg">${dot(k)}${F.CATS[k].label}</span>`).join('');
  const sd = days.find((d) => d.key === statSel);
  $('st-detail').innerHTML = sd.total
    ? `<b>${c.dateLabel(sd.key).date} · ${fmtG(sd.total)} g</b> <span class="muted">${sd.cats.map((x) => `${F.CATS[x.cat].label} ${fmtG(x.grams)}`).join(' · ')}</span>`
    : `<b>${c.dateLabel(sd.key).date}</b> <span class="muted">nincs bejegyzés</span>`;

  // top források
  const top = St.topSources(S.entries, S.today, N).slice(0, 8);
  $('st-top').innerHTML = top.length ? top.map((t) => `
    <div class="top-row">${dot(t.cat)}
      <span class="e-name">${esc(t.name)}</span>
      ${t.streak >= 2 ? `<span class="streak">${t.streak} napja</span>` : ''}
      <span class="top-share">${c.fmt(t.share * 100)}%</span>
      <span class="e-val">${fmtG(t.grams)} g</span>
    </div>`).join('') : '<div class="empty">Még nincs adat.</div>';
}

$('st-bars').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-sday]');
  if (b) { statSel = b.dataset.sday; renderStat(); }
});

// ---------- heti mentés ----------
function backupDue() {
  if (!S.entries.length || S.backupSnooze === S.today) return false;
  const since = S.lastBackup || S.entries.reduce((m, e) => (e.date < m ? e.date : m), S.today);
  return c.addDays(since, 7) <= S.today;
}

function renderBackup() {
  $('backup-banner').hidden = !backupDue();
  $('backup-info').textContent = S.lastBackup ? `Utolsó mentés: ${c.dateLabel(S.lastBackup).date}` : 'Még nem készült mentés.';
}

async function doExport() {
  const data = await db.exportAll();
  const name = `protein-mentes-${S.today}.json`;
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  let ok = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Protein mentés' }); ok = true; } catch (err) { if (err.name === 'AbortError') return false; }
  }
  if (!ok) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  S.lastBackup = S.today;
  await db.setKV('lastBackup', S.today);
  renderBackup();
  toast('Mentés kész.');
  return true;
}

$('backup-go').addEventListener('click', doExport);
$('backup-close').addEventListener('click', async () => {
  S.backupSnooze = S.today;
  await db.setKV('backupSnooze', S.today);
  renderBackup();
});

function render() {
  renderMa();
  renderSuly();
  renderBeall();
  renderStat();
  renderBackup();
}

// ---------- toast ----------
let toastTimer = null;
let toastUndo = null;
function toast(msg, undo) {
  $('toast-msg').textContent = msg;
  $('toast-undo').hidden = !undo;
  toastUndo = undo || null;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; toastUndo = null; }, 4500);
}
$('toast-undo').addEventListener('click', async () => {
  const fn = toastUndo;
  $('toast').hidden = true;
  toastUndo = null;
  if (fn) { await fn(); render(); }
});

async function quickAdd(data) {
  const e = await addEntry(data);
  render();
  toast(`+${c.fmt(e.protein, e.protein % 1 ? 1 : 0)} g · ${e.name}`, () => removeEntries([e.id]));
}

// ---------- bottom sheet ----------
function openSheet(title, html, bind) {
  $('sheet-title').textContent = title;
  $('sheet-body').innerHTML = html;
  $('sheet').hidden = false;
  $('backdrop').hidden = false;
  bind($('sheet-body'));
  const first = $('sheet-body').querySelector('[data-autofocus]');
  if (first) first.focus();
}
function closeSheet() {
  $('sheet').hidden = true;
  $('backdrop').hidden = true;
  $('sheet-body').innerHTML = '';
}
$('backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

function entrySheet(existing, preset = {}) {
  const e = existing || { name: preset.name || '', protein: preset.protein ?? '', time: S.day === S.today ? c.timeHM() : '12:00' };
  const parts = existing ? St.itemsOf(existing) : [];
  openSheet(existing ? 'Bejegyzés' : 'Kézi bevitel', `
    ${parts.length > 1 ? `<div class="pv">${parts.map((i) => `<div class="pv-row">${dot(i.cat)}<span class="pv-name">${esc(i.name)}</span><span class="pv-val">${fmtG(i.protein)} g</span></div>`).join('')}</div>` : ''}
    <label class="field"><span class="field-l">Megnevezés</span>
      <input type="text" id="f-name" value="${esc(e.name)}" placeholder="pl. Görög joghurt" ${existing || preset.name ? '' : 'data-autofocus'}></label>
    <div class="row2">
      <label class="field"><span class="field-l">Fehérje (g)</span>
        <input type="text" id="f-prot" inputmode="decimal" value="${e.protein === '' ? '' : c.fmt(e.protein, e.protein % 1 ? 1 : 0)}" ${!existing && preset.name ? 'data-autofocus' : ''}></label>
      <label class="field"><span class="field-l">Időpont</span>
        <input type="time" id="f-time" value="${esc(e.time)}"></label>
    </div>
    <button class="btn" id="f-save">${existing ? 'Mentés' : 'Hozzáadás'}</button>
    ${existing ? '<button class="btn danger" id="f-del">Törlés</button>' : ''}
  `, (root) => {
    root.querySelector('#f-save').addEventListener('click', async () => {
      const name = root.querySelector('#f-name').value.trim();
      const protein = c.parseNum(root.querySelector('#f-prot').value);
      const time = root.querySelector('#f-time').value || c.timeHM();
      if (!name || !(protein >= 0)) { root.querySelector(name ? '#f-prot' : '#f-name').focus(); return; }
      if (existing) {
        const np = r1(protein);
        if (existing.items && existing.items.length && np !== existing.protein && existing.protein > 0) {
          existing.items = existing.items.map((i) => ({ ...i, protein: r1((i.protein / existing.protein) * np) }));
        }
        Object.assign(existing, { name, protein: np, time });
        await db.put('entries', existing);
        closeSheet();
        render();
      } else {
        closeSheet();
        await quickAdd({ name, protein, time, source: 'manual', items: [{ key: `x-${F.norm(name)}`, name, cat: 'egyeb', protein }] });
      }
    });
    const del = root.querySelector('#f-del');
    if (del) del.addEventListener('click', async () => {
      closeSheet();
      await deleteWithUndo(existing.id);
    });
  });
}

async function deleteWithUndo(id) {
  const removed = await removeEntries([id]);
  render();
  if (removed.length) toast(`Törölve · ${removed[0].name}`, () => restoreEntries(removed));
}

function shakeSheet(t) {
  let ml = t.defaultMl;
  openSheet('Shake', `
    <label class="field"><span class="field-l">Tej mennyisége (ml) · 1 adag por ${c.fmt(t.scoop)} g</span>
      <div class="stepper">
        <button type="button" id="ml-minus" aria-label="50 ml-rel kevesebb">−</button>
        <input type="text" id="ml" inputmode="numeric" value="${ml}">
        <button type="button" id="ml-plus" aria-label="50 ml-rel több">+</button>
      </div></label>
    <div class="result"><span class="muted">Fehérje</span><b id="ml-res"></b></div>
    <button class="btn" id="ml-add">Hozzáadás</button>
  `, (root) => {
    const inp = root.querySelector('#ml');
    const upd = () => { root.querySelector('#ml-res').textContent = `${c.fmt(c.shakeProtein(ml, t.scoop, t.milkPerL), 1)} g`; };
    const set = (v) => { ml = Math.max(0, Math.min(1000, v)); inp.value = ml; upd(); };
    root.querySelector('#ml-minus').addEventListener('click', () => set(ml - 50));
    root.querySelector('#ml-plus').addEventListener('click', () => set(ml + 50));
    inp.addEventListener('input', () => { const v = c.parseNum(inp.value); ml = v >= 0 ? v : 0; upd(); });
    upd();
    root.querySelector('#ml-add').addEventListener('click', async () => {
      closeSheet();
      const milk = (ml * t.milkPerL) / 1000;
      await quickAdd({ name: ml ? `Shake · ${ml} ml tej` : 'Shake · vízzel', protein: c.shakeProtein(ml, t.scoop, t.milkPerL), source: 'shake',
        items: [{ key: 'feherjepor', name: 'Fehérjepor', cat: 'feherjepor', protein: t.scoop }, ...(milk > 0 ? [{ key: 'tej', name: 'Tej', cat: 'tejtermek', protein: milk }] : [])] });
    });
  });
}

function chickenSheet(t) {
  let cooked = false;
  openSheet('Csirkemell', `
    <label class="field"><span class="field-l">Mennyiség (g)</span>
      <input type="text" id="ch-g" inputmode="numeric" placeholder="pl. 325" data-autofocus></label>
    <div class="seg" role="group" aria-label="Súly típusa">
      <button type="button" id="ch-raw" aria-pressed="true">Nyers · ${t.raw} g/100 g</button>
      <button type="button" id="ch-cooked" aria-pressed="false">Sült · ${t.cooked} g/100 g</button>
    </div>
    <div class="result"><span class="muted">Fehérje</span><b id="ch-res">–</b></div>
    <button class="btn" id="ch-add">Hozzáadás</button>
  `, (root) => {
    const g = () => c.parseNum(root.querySelector('#ch-g').value);
    const upd = () => {
      root.querySelector('#ch-raw').setAttribute('aria-pressed', String(!cooked));
      root.querySelector('#ch-cooked').setAttribute('aria-pressed', String(cooked));
      root.querySelector('#ch-res').textContent = g() > 0 ? `${c.fmt(c.chickenProtein(g(), cooked, t.raw, t.cooked), 1)} g` : '–';
    };
    root.querySelector('#ch-g').addEventListener('input', upd);
    root.querySelector('#ch-raw').addEventListener('click', () => { cooked = false; upd(); });
    root.querySelector('#ch-cooked').addEventListener('click', () => { cooked = true; upd(); });
    root.querySelector('#ch-add').addEventListener('click', async () => {
      const grams = g();
      if (!(grams > 0)) { root.querySelector('#ch-g').focus(); return; }
      closeSheet();
      const prot = c.chickenProtein(grams, cooked, t.raw, t.cooked);
      await bumpUse(['csirkemell']);
      await quickAdd({ name: `Csirkemell · ${c.fmt(grams)} g ${cooked ? 'sült' : 'nyers'}`, protein: prot, source: 'chicken',
        items: [{ key: 'csirkemell', name: 'Csirkemell', cat: 'hus', protein: prot }] });
    });
  });
}

function prepitSheet() {
  const saved = [...S.prepit].sort((a, b) => (b.used || 0) - (a.used || 0));
  openSheet('Prepit ebéd', `
    ${saved.length ? `<div class="list-pick">${saved.map((p, i) => `
      <button class="q" data-i="${i}"><span class="q-name">${esc(p.name)}</span><span class="q-val">${c.fmt(p.protein, p.protein % 1 ? 1 : 0)} g</span></button>`).join('')}</div>`
      : '<p class="muted small" style="margin:0">Még nincs mentett menü. Az első után egy érintéssel választhatod.</p>'}
    <div class="eyebrow">Új menü</div>
    <label class="field"><span class="field-l">Menü neve</span><input type="text" id="pp-name" placeholder="pl. Csirkés rizottó"></label>
    <label class="field"><span class="field-l">Fehérje a dobozon (g)</span><input type="text" id="pp-prot" inputmode="decimal"></label>
    <button class="btn" id="pp-add">Mentés és hozzáadás</button>
  `, (root) => {
    root.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', async () => {
      const p = saved[Number(b.dataset.i)];
      p.used = (p.used || 0) + 1;
      await db.setKV('prepit', S.prepit);
      closeSheet();
      await quickAdd({ name: `Prepit · ${p.name}`, protein: p.protein, source: 'prepit', items: [{ key: 'prepit', name: 'Prepit ebéd', cat: 'keszetel', protein: p.protein }] });
    }));
    root.querySelector('#pp-add').addEventListener('click', async () => {
      const name = root.querySelector('#pp-name').value.trim();
      const protein = c.parseNum(root.querySelector('#pp-prot').value);
      if (!name) { root.querySelector('#pp-name').focus(); return; }
      if (!(protein >= 0)) { root.querySelector('#pp-prot').focus(); return; }
      const ex = S.prepit.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (ex) { ex.protein = protein; ex.used = (ex.used || 0) + 1; }
      else S.prepit.push({ name, protein, used: 1 });
      await db.setKV('prepit', S.prepit);
      closeSheet();
      await quickAdd({ name: `Prepit · ${name}`, protein, source: 'prepit', items: [{ key: 'prepit', name: 'Prepit ebéd', cat: 'keszetel', protein }] });
    });
  });
}

async function repeatYesterday() {
  const src = dayEntries(c.addDays(S.day, -1));
  if (!src.length) { toast('Az előző napon nem volt bejegyzés.'); return; }
  const added = [];
  for (const e of src) added.push(await addEntry({ name: e.name, protein: e.protein, time: e.time, source: e.source === 'repeat' ? 'repeat' : e.source, items: St.itemsOf(e) }));
  render();
  const sum = added.reduce((a, e) => a + e.protein, 0);
  toast(`+${c.fmt(sum)} g · ${added.length} tétel az előző napból`, () => removeEntries(added.map((e) => e.id)));
}

function weightSheet(dateKey) {
  const key = dateKey || S.today;
  const ex = S.weights.find((w) => w.date === key);
  openSheet('Testsúly', `
    <label class="field"><span class="field-l">${c.dateLabel(key).date} · kg</span>
      <input type="text" id="w-kg" inputmode="decimal" value="${ex ? c.fmt(ex.kg, 1) : ''}" placeholder="${c.fmt(weightFor(key), 1)}" data-autofocus></label>
    <button class="btn" id="w-save">Mentés</button>
    ${ex && S.weights.length > 1 ? '<button class="btn danger" id="w-del">Mérés törlése</button>' : ''}
  `, (root) => {
    root.querySelector('#w-save').addEventListener('click', async () => {
      const kg = c.parseNum(root.querySelector('#w-kg').value);
      if (!(kg > 30 && kg < 300)) { root.querySelector('#w-kg').focus(); return; }
      const w = { date: key, kg: Math.round(kg * 10) / 10 };
      S.weights = S.weights.filter((x) => x.date !== key).concat(w);
      await db.put('weights', w);
      closeSheet();
      render();
      toast(`Súly mentve · ${c.fmt(w.kg, 1)} kg · cél ${targetOf(S.today)} g`);
    });
    const del = root.querySelector('#w-del');
    if (del) del.addEventListener('click', async () => {
      S.weights = S.weights.filter((x) => x.date !== key);
      await db.del('weights', key);
      closeSheet();
      render();
    });
  });
}

// ---------- események ----------
$('quick').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-t]');
  if (!b) return;
  const t = S.templates.find((x) => x.id === b.dataset.t);
  if (!t) return;
  if (t.kind === 'fixed') quickAdd({ name: t.detail ? `${t.name} · ${t.detail}` : t.name, protein: t.protein, source: t.id, items: t.items });
  else if (t.kind === 'food') foodSheet();
  else if (t.kind === 'shake') shakeSheet(t);
  else if (t.kind === 'chicken') chickenSheet(t);
  else if (t.kind === 'prepit') prepitSheet();
  else if (t.kind === 'repeat') repeatYesterday();
});

$('omni').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const inp = $('omni-in');
  const text = inp.value.trim();
  if (!text) { inp.focus(); return; }
  inp.blur();
  previewSheet(text, () => { inp.value = ''; });
});

// ---------- szöveges bevitel: előnézet ----------
const dot = (cat) => `<span class="dot" style="background:${F.CATS[cat].color}" aria-hidden="true"></span>`;

function previewSheet(text, onSaved) {
  const items = F.parseText(text, allFoods());
  const sh = F.shorthandProtein(items);
  const rows = items.map((it, i) => ({ ...it, i, keep: true, value: it.known ? it.protein : (sh != null ? sh : ''), remember: true }));

  openSheet('Előnézet', `
    <div class="pv" id="pv-list"></div>
    <div class="result"><span class="muted">Összesen</span><b id="pv-total">–</b></div>
    <button class="btn" id="pv-save">Hozzáadás</button>
    <p class="muted small" style="margin:0">Ha valami nem stimmel, töröld a tételt, és írd be pontosabban, például „150 g sült lazac”.</p>
  `, (root) => {
    const list = root.querySelector('#pv-list');
    const total = () => rows.filter((r) => r.keep).reduce((a, r) => a + (c.parseNum(r.value) || 0), 0);
    const paint = () => {
      list.innerHTML = rows.filter((r) => r.keep).map((r) => r.known ? `
        <div class="pv-row">${dot(r.food.cat)}<span class="pv-name">${esc(r.label)}</span>
          <span class="pv-val">${fmtG(r.protein)} g</span>
          <button class="x-btn" data-rm="${r.i}" aria-label="${esc(r.label)} törlése">×</button></div>` : `
        <div class="pv-row unk">
          <div class="pv-unk-head">${dot('egyeb')}<span class="pv-name">${esc(r.name)}</span><span class="tag">ismeretlen</span>
            <button class="x-btn" data-rm="${r.i}" aria-label="${esc(r.name)} törlése">×</button></div>
          <div class="row2">
            <label class="field"><span class="field-l">Fehérje ebben a tételben (g)</span>
              <input type="text" inputmode="decimal" data-val="${r.i}" value="${r.value === '' ? '' : c.fmt(r.value, r.value % 1 ? 1 : 0)}"></label>
            <label class="chk"><input type="checkbox" data-rem="${r.i}" ${r.remember ? 'checked' : ''}><span>Megjegyzem</span></label>
          </div></div>`).join('') || '<div class="empty">Nincs tétel.</div>';
      root.querySelector('#pv-total').textContent = `${fmtG(r1(total()))} g`;
      root.querySelector('#pv-save').textContent = `Hozzáadás · ${fmtG(r1(total()))} g`;
    };
    list.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-rm]');
      if (b) { rows[Number(b.dataset.rm)].keep = false; paint(); }
    });
    list.addEventListener('input', (ev) => {
      const v = ev.target.closest('[data-val]');
      if (v) {
        rows[Number(v.dataset.val)].value = v.value;
        root.querySelector('#pv-total').textContent = `${fmtG(r1(total()))} g`;
        root.querySelector('#pv-save').textContent = `Hozzáadás · ${fmtG(r1(total()))} g`;
      }
      const ch = ev.target.closest('[data-rem]');
      if (ch) rows[Number(ch.dataset.rem)].remember = ch.checked;
    });
    paint();
    const firstEmpty = list.querySelector('[data-val]');
    if (firstEmpty && !firstEmpty.value) firstEmpty.focus();

    root.querySelector('#pv-save').addEventListener('click', async () => {
      const kept = rows.filter((r) => r.keep);
      if (!kept.length) { closeSheet(); return; }
      const bad = kept.find((r) => !r.known && !(c.parseNum(r.value) >= 0));
      if (bad) { list.querySelector(`[data-val="${bad.i}"]`).focus(); return; }
      const items = [];
      for (const r of kept) {
        if (r.known) {
          items.push({ key: r.food.id, name: r.food.name, cat: r.food.cat, protein: r.protein, label: r.label });
        } else {
          const p = c.parseNum(r.value);
          let key = `x-${F.norm(r.name)}`;
          if (r.remember) {
            const learned = F.learnFood(r, p);
            S.customFoods = S.customFoods.filter((f) => f.id !== learned.id).concat(learned);
            await db.setKV('foods', S.customFoods);
            key = learned.id;
          }
          items.push({ key, name: r.name, cat: 'egyeb', protein: p, label: r.name });
        }
      }
      await bumpUse(items.map((i) => i.key));
      const name = items.map((i) => i.label).join(', ');
      closeSheet();
      onSaved && onSaved();
      await quickAdd({ name: name.charAt(0).toUpperCase() + name.slice(1), protein: items.reduce((a, i) => a + i.protein, 0), source: 'text',
        items: items.map(({ label, ...rest }) => rest) });
    });
  });
}

// ---------- Étel lap (a shake mintájára) ----------
function foodSheet() {
  const basket = [];
  let sel = null;
  let amount = 0;
  let unit = 'g';
  let cooked = false;
  let query = '';

  const sorted = () => allFoods().slice().sort((a, b) => (S.foodUse[b.id] || 0) - (S.foodUse[a.id] || 0));
  const unitsOf = (f) => (f.perUnit != null ? ['adag'] : ['g', ...Object.keys(f.units || {})]);
  const current = () => (sel ? F.proteinFor(sel, amount, unit, cooked) : 0);
  const labelOf = () => {
    const u = unit === 'g' ? (sel.liquid ? 'ml' : 'g') : F.unitLabel(unit);
    return `${c.fmt(amount, amount % 1 ? 1 : 0)} ${u} ${sel.name.toLowerCase()}${cooked && sel.cooked != null ? ' (sült)' : ''}`;
  };

  openSheet('Étel', `
    <div class="pv" id="fs-basket"></div>
    <label class="field"><span class="sr">Keresés</span>
      <input type="text" id="fs-q" placeholder="Keresés: lazac, túró, tojás…" autocomplete="off"></label>
    <div class="chips" id="fs-chips"></div>
    <div id="fs-panel"></div>
    <div class="row2" id="fs-actions">
      <button class="btn ghost" id="fs-more">+ Újabb tétel</button>
      <button class="btn" id="fs-save">Mentés</button>
    </div>
  `, (root) => {
    const paintBasket = () => {
      root.querySelector('#fs-basket').innerHTML = basket.map((b, i) => `
        <div class="pv-row">${dot(b.cat)}<span class="pv-name">${esc(b.label)}</span><span class="pv-val">${fmtG(b.protein)} g</span>
        <button class="x-btn" data-brm="${i}" aria-label="${esc(b.label)} törlése">×</button></div>`).join('');
    };
    const paintChips = () => {
      const q = F.norm(query);
      const list = sorted().filter((f) => !q || F.norm(f.name).includes(q) || f.aliases.some((a) => a.startsWith(q)));
      root.querySelector('#fs-chips').innerHTML = list.map((f) => `
        <button class="chip${sel && sel.id === f.id ? ' on' : ''}" data-f="${esc(f.id)}">${dot(f.cat)}${esc(f.name)}</button>`).join('')
        || '<span class="muted small">Nincs találat. A szövegmezőben új ételt is rögzíthetsz, utána itt is megjelenik.</span>';
    };
    const paintActions = () => {
      const sum = basket.reduce((a, b) => a + b.protein, 0) + current();
      root.querySelector('#fs-save').textContent = `Mentés · ${fmtG(r1(sum))} g`;
      root.querySelector('#fs-save').disabled = !sel && !basket.length;
      root.querySelector('#fs-more').disabled = !sel;
    };
    const paintPanel = () => {
      const panel = root.querySelector('#fs-panel');
      if (!sel) { panel.innerHTML = ''; paintActions(); return; }
      const us = unitsOf(sel);
      panel.innerHTML = `
        <div class="food-panel">
          ${us.length > 1 ? `<div class="seg seg-n" style="grid-template-columns:repeat(${us.length},1fr)" role="group" aria-label="Mértékegység">
            ${us.map((u) => `<button type="button" data-u="${u}" aria-pressed="${u === unit}">${u === 'g' ? (sel.liquid ? 'ml' : 'g') : F.unitLabel(u)}</button>`).join('')}</div>` : ''}
          <div class="stepper">
            <button type="button" id="fs-minus" aria-label="Kevesebb">−</button>
            <input type="text" id="fs-amt" inputmode="decimal" value="${c.fmt(amount, amount % 1 ? 1 : 0)}" aria-label="Mennyiség">
            <button type="button" id="fs-plus" aria-label="Több">+</button>
          </div>
          ${sel.cooked != null ? `<div class="seg" role="group" aria-label="Súly típusa">
            <button type="button" data-ck="0" aria-pressed="${!cooked}">Nyers · ${c.fmt(sel.per100)} g/100 g</button>
            <button type="button" data-ck="1" aria-pressed="${cooked}">Sült · ${c.fmt(sel.cooked)} g/100 g</button></div>` : ''}
          <div class="result"><span class="muted">${esc(sel.name)}</span><b id="fs-res">${fmtG(current())} g</b></div>
        </div>`;
      const inp = panel.querySelector('#fs-amt');
      const step = () => (unit === 'g' ? 10 : 1);
      const set = (v) => { amount = Math.max(0, r1(v)); inp.value = c.fmt(amount, amount % 1 ? 1 : 0); upd(); };
      const upd = () => { panel.querySelector('#fs-res').textContent = `${fmtG(current())} g`; paintActions(); };
      panel.querySelector('#fs-minus').addEventListener('click', () => set(amount - step()));
      panel.querySelector('#fs-plus').addEventListener('click', () => set(amount + step()));
      inp.addEventListener('input', () => { const v = c.parseNum(inp.value); amount = v >= 0 ? v : 0; upd(); });
      panel.querySelectorAll('[data-u]').forEach((b) => b.addEventListener('click', () => {
        unit = b.dataset.u;
        amount = unit === 'g' ? (sel.portion || 100) : 1;
        paintPanel();
      }));
      panel.querySelectorAll('[data-ck]').forEach((b) => b.addEventListener('click', () => { cooked = b.dataset.ck === '1'; paintPanel(); }));
      paintActions();
    };
    const pick = (f) => {
      sel = f;
      cooked = false;
      unit = f.perUnit != null ? 'adag' : (f.def || 'g');
      amount = unit === 'g' ? (f.portion || 100) : 1;
      paintChips();
      paintPanel();
    };
    const pushCurrent = () => {
      if (!sel || !(current() > 0)) return false;
      basket.push({ key: sel.id, name: sel.name, cat: sel.cat, protein: current(), label: labelOf() });
      return true;
    };

    root.querySelector('#fs-q').addEventListener('input', (ev) => { query = ev.target.value; paintChips(); });
    root.querySelector('#fs-chips').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-f]');
      if (b) pick(allFoods().find((f) => f.id === b.dataset.f));
    });
    root.querySelector('#fs-basket').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-brm]');
      if (b) { basket.splice(Number(b.dataset.brm), 1); paintBasket(); paintActions(); }
    });
    root.querySelector('#fs-more').addEventListener('click', () => {
      if (pushCurrent()) { sel = null; query = ''; root.querySelector('#fs-q').value = ''; paintBasket(); paintChips(); paintPanel(); }
    });
    root.querySelector('#fs-save').addEventListener('click', async () => {
      pushCurrent();
      if (!basket.length) return;
      await bumpUse(basket.map((b) => b.key));
      const name = basket.map((b) => b.label).join(', ');
      closeSheet();
      await quickAdd({ name: name.charAt(0).toUpperCase() + name.slice(1), protein: basket.reduce((a, b) => a + b.protein, 0), source: 'food',
        items: basket.map(({ label, ...rest }) => rest) });
    });
    paintChips();
    paintPanel();
  });
}

$('manual-btn').addEventListener('click', () => entrySheet(null));
$('day-prev').addEventListener('click', () => { S.day = c.addDays(S.day, -1); renderMa(); });
$('day-next').addEventListener('click', () => { if (S.day < S.today) { S.day = c.addDays(S.day, 1); renderMa(); } });
$('go-today').addEventListener('click', () => { S.day = S.today; renderMa(); });
$('bars').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-day]');
  if (b) { S.day = b.dataset.day; renderMa(); }
});
$('train-toggle').addEventListener('click', async () => {
  if (S.training[S.day]) delete S.training[S.day]; else S.training[S.day] = true;
  await db.setKV('training', S.training);
  renderMa();
});
$('weight-pill').addEventListener('click', () => weightSheet(S.today));
$('weight-add').addEventListener('click', () => weightSheet(S.today));
$('weight-log').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-wdate]');
  if (b) weightSheet(b.dataset.wdate);
});

// napló: koppintás = szerkesztés, balra húzás = törlés
let drag = null;
$('log').addEventListener('pointerdown', (ev) => {
  const row = ev.target.closest('.entry-row');
  if (!row) return;
  drag = { row, id: row.dataset.id, x0: ev.clientX, y0: ev.clientY, dx: 0, moved: false, horiz: null };
  row.classList.remove('snap');
});
$('log').addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const dx = ev.clientX - drag.x0;
  const dy = ev.clientY - drag.y0;
  if (drag.horiz === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) drag.horiz = Math.abs(dx) > Math.abs(dy);
  if (!drag.horiz) return;
  drag.moved = true;
  drag.dx = Math.min(0, Math.max(-140, dx));
  drag.row.style.transform = `translateX(${drag.dx}px)`;
});
const endDrag = async () => {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.row.classList.add('snap');
  if (d.moved && d.dx < -80) {
    d.row.style.transform = 'translateX(-100%)';
    setTimeout(() => deleteWithUndo(d.id), 160);
  } else {
    d.row.style.transform = '';
    if (!d.moved) {
      const e = S.entries.find((x) => x.id === d.id);
      if (e) entrySheet(e);
    }
  }
};
$('log').addEventListener('pointerup', endDrag);
$('log').addEventListener('pointercancel', () => { if (drag) { drag.row.classList.add('snap'); drag.row.style.transform = ''; drag = null; } });
$('log').addEventListener('click', (ev) => {
  // billentyűzetes aktiválás (Enter/Space): detail === 0
  if (ev.detail !== 0) return;
  const row = ev.target.closest('.entry-row');
  const e = row && S.entries.find((x) => x.id === row.dataset.id);
  if (e) entrySheet(e);
});

// fülek
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
  for (const name of ['ma', 'stat', 'suly', 'beall']) $(`screen-${name}`).hidden = name !== tab.dataset.screen;
  window.scrollTo(0, 0);
}));

// beállítások
$('gpk').addEventListener('input', async () => {
  S.settings.gPerKg = Math.round(Number($('gpk').value) * 10) / 10;
  await db.setKV('settings', S.settings);
  render();
});

$('export-btn').addEventListener('click', doExport);

$('import-file').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!confirm(`Visszatöltöd a mentést? ${data.entries?.length ?? 0} bejegyzés kerül be, a mostani adatok helyére.`)) return;
    await db.importAll(data);
    await load();
    render();
    toast('Mentés visszatöltve.');
  } catch (err) {
    toast(`Hiba: ${err.message}`);
  }
});

// napváltás éjfélkor (ha az app háttérből tér vissza)
function checkDay() {
  const now = c.dayKey();
  if (now !== S.today) {
    const wasToday = S.day === S.today;
    S.today = now;
    if (wasToday) S.day = now;
    render();
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
setInterval(checkDay, 60000);

// ---------- indulás ----------
(async () => {
  await load();
  render();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    // ha új verzió veszi át az irányítást, egyszer újratölt, így a frissítés azonnal látszik
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
