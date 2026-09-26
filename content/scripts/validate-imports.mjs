import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const jsRoot = path.join(root, 'content', 'js');
const pagesRoot = path.join(root, 'pages');
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

function htmlFiles(dir) {
  const files = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, ent.name);
    if (ent.isDirectory()) files.push(...htmlFiles(target));
    else if (ent.name.endsWith('.html')) files.push(target);
  }
  return files;
}

function checkHtml(file) {
  const text = fs.readFileSync(file, 'utf8');
  const baseHref = text.match(/<base\s+href="([^"]+)"/i)?.[1] || '';
  const baseDir = path.resolve(path.dirname(file), baseHref || '.');
  for (const m of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const raw = m[1];
    if (/^(?:https?:|data:|mailto:|tel:|#)/i.test(raw)) continue;
    const rel = raw.split(/[?#]/, 1)[0];
    if (!rel) continue;
    const target = rel.startsWith('/')
      ? path.join(root, rel.slice(1), rel.endsWith('/') ? 'index.html' : '')
      : path.resolve(baseDir, rel);
    if (!fs.existsSync(target)) {
      console.error('BROKEN HTML', path.relative(root, file), '->', raw);
      errors++;
    }
  }
}

for (const file of [path.join(root, 'index.html'), ...htmlFiles(pagesRoot)]) checkHtml(file);

// leftover flat js files (should only be folders now)
for (const ent of fs.readdirSync(jsRoot, { withFileTypes: true })) {
  if (ent.isFile() && ent.name.endsWith('.js')) {
    console.error('STRAY js/', ent.name);
    errors++;
  }
}

console.log(errors ? `FAIL ${errors}` : 'OK all imports resolve');
process.exit(errors ? 1 : 0);
