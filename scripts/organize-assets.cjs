const fs = require('fs');
const path = require('path');

const JSON_PATH = path.resolve('C:/Users/TylerOOTD/Desktop/asset-organizer-export.json');
const ASSETS_DIR = path.resolve(__dirname, '..', 'public', 'Super_Retro_Collection');

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
console.log(`Loaded ${data.assetCount} assets from manifest`);

const stats = { moved: 0, missing: 0, errors: 0 };

for (const asset of data.assets) {
  const srcFile = path.join(ASSETS_DIR, asset.filename);
  const destDir = path.join(ASSETS_DIR, asset.category || 'unknown');
  const destFile = path.join(destDir, asset.filename);

  if (!fs.existsSync(srcFile)) {
    stats.missing++;
    continue;
  }

  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.renameSync(srcFile, destFile);
    stats.moved++;
  } catch (e) {
    console.error(`Error moving ${asset.filename}: ${e.message}`);
    stats.errors++;
  }
}

console.log(`Done! Moved: ${stats.moved} | Missing: ${stats.missing} | Errors: ${stats.errors}`);

const remaining = fs.readdirSync(ASSETS_DIR).filter(f => {
  const full = path.join(ASSETS_DIR, f);
  return fs.statSync(full).isFile();
});
if (remaining.length > 0) {
  console.log(`${remaining.length} uncategorized files still in root`);
}

const folders = fs.readdirSync(ASSETS_DIR).filter(f =>
  fs.statSync(path.join(ASSETS_DIR, f)).isDirectory()
);
console.log('\nFolders created:');
for (const dir of folders.sort()) {
  const count = fs.readdirSync(path.join(ASSETS_DIR, dir)).length;
  console.log(`  ${dir}/ → ${count} files`);
}
