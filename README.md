# Protein

Személyes napi fehérjekövető PWA. Az adatok csak a telefon böngészőjében (IndexedDB) tárolódnak, a repóba semmi nem kerül.

## Telepítés iPhone-ra
1. Nyisd meg Safariban: `https://szonyid.github.io/protein/`
2. Megosztás → Hozzáadás a főképernyőhöz

## Frissítés
Új kiadásnál a `sw.js` elején a `VERSION`-t emelni kell (`protein-v2`, …). A telefon a következő indításkor tölti be az új verziót.

## Fájlok
- `index.html`, `styles.css` – felület (Volt design)
- `app.js` – képernyők, sablonok, bevitel
- `calc.js` – számítások (cél, shake, csirkemell, sorozat)
- `db.js` – IndexedDB tároló, export/import
- `sw.js`, `manifest.webmanifest`, ikonok (`*.png`), betűk (`*.woff2`) – PWA és offline működés. Minden fájl a gyökérben van, így telefonról is egyszerűen feltölthető.
