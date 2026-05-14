const fs = require('fs');
const path = require('path');

const root = process.cwd();
const missing = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx$/i.test(e.name)) {
      const md = p + '.md';
      if (!fs.existsSync(md)) missing.push(path.relative(root, p).replace(/\\/g, '/'));
    }
  }
}

walk(root);

if (missing.length === 0) {
  console.log('Comprobación completada: todos los archivos .tsx tienen su .tsx.md correspondiente.');
  process.exit(0);
} else {
  console.log('Faltan archivos .md para los siguientes .tsx:');
  missing.forEach(m => console.log('- ' + m));
  console.log('\nSugerencia: ejecutar `node scripts/generate_detailed_md.js` para generarlos automáticamente.');
  process.exit(2);
}
