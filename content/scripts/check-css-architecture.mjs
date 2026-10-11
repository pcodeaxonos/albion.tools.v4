import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const migrations = JSON.parse(fs.readFileSync(new URL('./css-component-migrations.json', import.meta.url)));
const legacy = Object.keys(Object.assign({}, ...Object.values(migrations)));
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const legacyPattern = new RegExp(`(?<![\\w/-])(${legacy.map(escape).sort((a, b) => b.length - a.length).join('|')})(?![\\w-])`, 'g');
const skip = new Set(['node_modules', '.git', '.agents', '.codex', '.css-audit']);
function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => skip.has(entry.name) ? [] : entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}

// Read compiled CSS: Sass nesting and responsive context have already been resolved.
// The small scanner handles strings, comments and parentheses without splitting selector arguments.
export function cssRules(css, context = '') {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [];
    let start = 0, quote = '', depth = 0, open = -1;
    for (let i = 0; i < css.length; i++) {
        const char = css[i];
        if (quote) { if (char === quote && css[i - 1] !== '\\') quote = ''; continue; }
        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === ';' && !depth) start = i + 1;
        if (char === '{') { if (!depth) open = i; depth++; }
        if (char === '}' && --depth === 0) {
            const selector = css.slice(start, open).trim(), body = css.slice(open + 1, i).trim();
            if (/^@(media|supports|layer|container)\b/.test(selector)) rules.push(...cssRules(body, `${context} ${selector}`));
            else if (!selector.startsWith('@') && selector) rules.push({ selector, context, declarations: body.split(/;\s*(?![^()]*\))/).map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean).sort() });
            start = i + 1;
        }
    }
    return rules;
}

export function inspectRules(rules, toolNames) {
    const warnings = [], duplicates = new Map();
    const toolClass = new RegExp(`\\.(?:${toolNames.map(escape).join('|')})-[\\w-]+`, 'g');
    for (const rule of rules) {
        const tools = new Set((rule.selector.match(toolClass) || []).map(s => s.split('-')[0]));
        if (tools.size >= 3) warnings.push(`Grouped tool variants: ${rule.selector}`);
        if (rule.declarations.length < 5) continue; // Tiny layout coincidences are not components.
        const key = `${rule.context}\n${rule.declarations.join(';')}`;
        const previous = duplicates.get(key);
        if (previous && previous.selector !== rule.selector) warnings.push(`Identical blocks: ${previous.selector} / ${rule.selector}`);
        else duplicates.set(key, rule);
    }
    // Near duplicates are advisory; shared values alone do not establish semantic equivalence.
    const substantial = rules.filter(r => r.declarations.length >= 8);
    for (let i = 0; i < substantial.length; i++) for (let j = i + 1; j < substantial.length; j++) {
        const a = substantial[i], b = substantial[j];
        if (a.context !== b.context || a.selector === b.selector) continue;
        const shared = a.declarations.filter(d => b.declarations.includes(d)).length;
        const similarity = shared / Math.max(a.declarations.length, b.declarations.length);
        if (similarity >= .9 && similarity < 1) warnings.push(`Near duplicate: ${a.selector} / ${b.selector}`);
    }
    return warnings;
}

export function checkArchitecture() {
    const files = walk(root).filter(f => /\.(css|scss|html|js|mjs|cjs)$/.test(f) && !path.basename(f).startsWith('.css-'));
    const errors = [], warnings = [];
    const roles = new Set(legacy.map(name => name.slice(name.indexOf('-') + 1)).filter(role => !role.includes('--')));
    const tools = fs.readdirSync(path.join(root, 'content/js/tools')).filter(name => name.endsWith('.js')).map(name => name.slice(0, -3));
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8'), relative = path.relative(root, file);
        for (const match of source.matchAll(legacyPattern)) errors.push(`${relative}: retired class ${match[0]}`);
        if (!file.endsWith('.scss')) continue;
        for (const match of source.matchAll(/\.([\w-]+)/g)) {
            const name = match[1], tool = tools.find(t => name.startsWith(t + '-'));
            if (tool && roles.has(name.slice(tool.length + 1))) warnings.push(`${relative}: possible shared component ${name}`);
        }
    }
    const rules = cssRules(fs.readFileSync(path.join(root, 'output/css/site.css'), 'utf8'));
    warnings.push(...inspectRules(rules, tools));
    const references = files.filter(f => /\.(html|js|mjs|cjs)$/.test(f) && !f.includes(`${path.sep}scripts${path.sep}`)).map(f => fs.readFileSync(f, 'utf8')).join('\n');
    const classes = new Set(rules.flatMap(r => [...r.selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m => m[1])));
    // Dynamic class names cannot be proven dead by text search; report candidates only.
    const unused = [...classes].filter(name => !references.includes(name) && !references.includes(name.split('--')[0] + '--'));
    console.log(`CSS architecture: ${files.filter(f => /\.(css|scss)$/.test(f)).length} style files, ${files.filter(f => /\.(html|js|mjs|cjs)$/.test(f)).length} markup/script files, ${rules.length} compiled rules.`);
    const unique = [...new Set(warnings)];
    for (const warning of unique.slice(0, 20)) console.warn(`WARN ${warning}`);
    if (unique.length > 20) console.warn(`WARN ${unique.length - 20} further advisory candidates (use --all).`);
    if (process.argv.includes('--all')) {
        for (const warning of unique.slice(20)) console.warn(`WARN ${warning}`);
        for (const name of unused) console.warn(`WARN Possibly unused/dynamic: .${name}`);
    }
    console.log(`${errors.length} retired-class errors; ${unique.length} advisory findings; ${unused.length} unused/dynamic candidates.`);
    for (const error of errors) console.error(`ERROR ${error}`);
    return errors.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = checkArchitecture() ? 1 : 0;
