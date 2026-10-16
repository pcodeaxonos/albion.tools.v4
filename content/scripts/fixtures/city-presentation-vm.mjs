import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Use the real shared markup; only catalog access and HTML escaping are supplied.
export async function cityPresentationModules(context, escapeHtml) {
    const cities = JSON.parse(readFileSync(new URL('../../../data/cities.json', import.meta.url), 'utf8'));
    const name = new vm.SourceTextModule(readFileSync(new URL('../../js/components/city-name.js', import.meta.url), 'utf8'), { context });
    const badge = new vm.SourceTextModule(readFileSync(new URL('../../js/components/city-badge.js', import.meta.url), 'utf8'), { context });
    const link = specifier => {
        if (specifier.endsWith('/city-name.js')) return name;
        const exports = specifier.endsWith('/store.js') ? { getAll: table => table === 'cities' ? cities : [] } : { escapeHtml };
        return new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        }, { context });
    };
    await name.link(link);
    await badge.link(link);
    return { name, badge };
}
