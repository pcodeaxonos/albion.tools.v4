import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const jsRoot = path.join(root, 'js');
let errors = 0;

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith('.js')) check(p);
  }
}

function check(file) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text))) {
    const spec = m[1].split('?')[0];
    const abs = path.normalize(path.join(path.dirname(file), spec));
    if (!fs.existsSync(abs)) {
      console.error('BROKEN', path.relative(root, file), '->', spec);
      errors++;
    }
  }
}

walk(jsRoot);

for (const f of fs.readdirSync(root).filter((x) => x.endsWith('.html'))) {
  const text = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of text.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)) {
    const rel = m[1].split('?')[0];
    if (!fs.existsSync(path.join(root, rel))) {
      console.error('BROKEN HTML', f, '->', rel);
      errors++;
    }
  }
}

// leftover flat js files (should only be folders now)
for (const ent of fs.readdirSync(jsRoot, { withFileTypes: true })) {
  if (ent.isFile() && ent.name.endsWith('.js')) {
    console.error('STRAY js/', ent.name);
    errors++;
  }
}

console.log(errors ? `FAIL ${errors}` : 'OK all imports resolve');
process.exit(errors ? 1 : 0);
