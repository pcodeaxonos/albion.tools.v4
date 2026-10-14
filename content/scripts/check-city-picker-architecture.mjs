import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);

export function inspectCityControls(source, { sharedPicker = false, citySchema = false } = {}) {
    if (sharedPicker) return [];
    const errors = [];
    if (/<(?:select|input|button)\b[^>]*\bdata-(?:filter|field|setting)\s*=\s*["'][^"']*\bcity\b[^"']*["']/i.test(source)
        || /<(?:select|input|button)\b[^>]*\bdata-chart-city\s*=/i.test(source)) errors.push('City controls must use cityFieldHtml/cityFilterFieldHtml.');
    if (/<[\w-]+\b[^>]*\bdata-city-(?:field|input|value|all)\b/.test(source)) errors.push('City picker markup belongs to the shared component.');
    if (/city(?:Filter)?FieldHtml\s*\(\s*\{[^}]*\b(?:style|order)\s*:/.test(source)) errors.push('City style/order must come from Settings.');
    if (citySchema && /\b(?:choices|select|filterSelect|filterChoiceFieldHtml|choiceFieldHtml)\s*\(/.test(source)
        && !/\bkey\s*===\s*['"]city['"][\s\S]{0,160}?city(?:Filter)?FieldHtml\s*\(/.test(source)) errors.push('A schema-driven city filter must dispatch to the shared city component.');
    return errors;
}

export function checkCityPickerArchitecture() {
    const files = ['content/js', 'pages', 'tools'].filter(directory => fs.existsSync(path.join(root, directory))).flatMap(directory => walk(path.join(root, directory))).filter(file => /\.(?:js|mjs|html)$/.test(file));
    const errors = [];
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        // Follow imported filter schemas: their city key need not appear in renderer markup.
        let citySchema = false;
        for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
            const imported = path.resolve(path.dirname(file), match[2]);
            if (!fs.existsSync(imported)) continue;
            const data = fs.readFileSync(imported, 'utf8');
            for (const name of match[1].split(',').map(value => value.trim().split(/\s+as\s+/)[0])) {
                const declaration = data.match(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
                if (declaration && /\[\s*['"]city['"]\s*,/.test(declaration[1])) citySchema = true;
            }
        }
        for (const message of inspectCityControls(source, { sharedPicker: path.relative(root, file).replaceAll('\\', '/') === 'content/js/components/city-picker.js', citySchema })) errors.push(`${path.relative(root, file)}: ${message}`);
    }
    return { files: files.length, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const result = checkCityPickerArchitecture();
    result.errors.forEach(error => console.error(error));
    console.log(`City picker architecture: ${result.files} source files, ${result.errors.length} errors.`);
    process.exitCode = result.errors.length ? 1 : 0;
}
