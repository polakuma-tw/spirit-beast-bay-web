const fs = require('fs');
const path = require('path');

const GALLERY_DIR = path.join(__dirname, 'gallery-omakase');
const OUTPUT_FILE = path.join(__dirname, 'gallery-data.json');
const COVER_CANDIDATES = ['T.webp', 'T.WEBP', 'T.jpeg', 'T.JPEG', 'T.jpg', 'T.JPG'];
const IMG_EXTS = new Set(['.webp', '.jpg', '.jpeg', '.png']);
const FOLDER_RE = /^(\d{3,4})(.+)$/;

function scanGallery() {
  if (!fs.existsSync(GALLERY_DIR)) {
    console.warn('Warning: gallery-omakase/ not found, writing empty array.');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify([], null, 2), 'utf-8');
    return;
  }
  const entries = fs.readdirSync(GALLERY_DIR, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folderName = entry.name;
    const match = folderName.match(FOLDER_RE);
    if (!match) { console.warn('Skip (bad format):', folderName); continue; }
    const numStr = match[1];
    const name = match[2];
    const id = 'NO.' + numStr;
    const code = 'no' + numStr;
    const folderPath = path.join(GALLERY_DIR, folderName);
    const folderUrlBase = 'gallery-omakase/' + folderName;
    let cover = null;
    for (const c of COVER_CANDIDATES) {
      if (fs.existsSync(path.join(folderPath, c))) { cover = folderUrlBase + '/' + c; break; }
    }
    const allFiles = fs.readdirSync(folderPath);
    const photos = allFiles
      .filter(f => { const l = f.toLowerCase(); if (l.startsWith('t.')) return false; return IMG_EXTS.has(path.extname(l)); })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(f => folderUrlBase + '/' + f);
    items.push({ id, code, name, folder: folderUrlBase + '/', cover, photos });
  }
  items.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(items, null, 2), 'utf-8');
  console.log('OK gallery-data.json written, total:', items.length);
  items.forEach(it => console.log(' ', it.id, it.name, 'cover:', it.cover, 'photos:', it.photos.length));
}

scanGallery();
