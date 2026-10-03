import { progressionBehavior } from '../js/core/laborer/behavior.mjs';

const decode = (value) => value.replace(/&(?:amp|quot|apos|lt|gt);/g, (entity) => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' }[entity]));
function attributes(text) {
    return Object.fromEntries([...text.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((match) => [match[1], decode(match[2] ?? match[3])]));
}

// Focused importer for the public dump's <labourer> elements, not placement
// <laborer> references. Reject entity declarations and validate every field.
export function parseLaborerXml(xml) {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Unsupported XML entity declaration');
    const rows = [...xml.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<labourer\b([^>]*)>([\s\S]*?)<\/labourer>/g)].map((match) => {
        const a = attributes(match[1]);
        const accepted = match[2].match(/<journalsaccepted\b[^>]*>([\s\S]*?)<\/journalsaccepted>/)?.[1];
        const journals = [...(accepted || '').matchAll(/<journal\b([^>]*)\/\s*>/g)].map((journal) => attributes(journal[1]).uniquename);
        const row = { item: a.uniquename, contract: a.contractitem, tier: Number(a.tier),
            hirePrice: Number(a.hireprice), fameToProgress: Number(a.fametoprogress),
            jobLengthSeconds: Number(a.joblength), profession: a.profession,
            next: a.upgradeableto || null, yieldMultiplier: Number(a.yieldmultiplier), accepted: journals };
        if (!row.item || !row.contract || !row.profession || !Number.isInteger(row.tier) || row.tier < 2 || row.tier > 8 ||
            !Number.isSafeInteger(row.hirePrice) || row.hirePrice < 0 || !Number.isSafeInteger(row.fameToProgress) || row.fameToProgress < 0 ||
            !(row.jobLengthSeconds > 0) || !(row.yieldMultiplier > 0) || !journals.length || journals.some((id) => !id?.endsWith('_FULL'))) {
            throw new Error(`Invalid labourer definition: ${a.uniquename}`);
        }
        return row;
    });
    if (!rows.length || new Set(rows.map((row) => row.item)).size !== rows.length) throw new Error('Missing or duplicate labourer definitions');
    for (const row of rows) {
        if (row.next && !rows.some((next) => next.item === row.next && next.profession === row.profession && next.tier === row.tier + 1)) throw new Error(`Invalid upgrade link: ${row.item}`);
        if (!row.next && row.fameToProgress !== 0) throw new Error(`Terminal threshold must be zero: ${row.item}`);
    }
    return rows;
}

export function mechanicsFromLaborers(laborers, contracts, journals, provenance) {
    const byType = {};
    const available = new Set(journals.map((journal) => journal.filled));
    for (const contract of contracts) {
        const laborer = laborers.find((row) => row.contract === contract.item);
        if (!laborer || laborer.tier !== contract.tier) throw new Error(`Missing contract/labourer join: ${contract.item}`);
        if (laborer.accepted.some((id) => !available.has(id))) throw new Error(`Unresolved accepted journal: ${laborer.item}`);
        const rules = byType[contract.type] ||= { verified: true, profession: laborer.profession, stages: {} };
        rules.stages[laborer.tier] = { laborer: laborer.item, contract: laborer.contract,
            requiredFame: laborer.fameToProgress, jobLengthSeconds: laborer.jobLengthSeconds,
            hirePrice: laborer.hirePrice, yieldMultiplier: laborer.yieldMultiplier,
            next: laborer.next, nextTier: laborer.next ? laborers.find((row) => row.item === laborer.next).tier : null,
            accepted: laborer.accepted };
    }
    return { verified: true, source: provenance.source, provenance, behavior: progressionBehavior,
        carryOver: progressionBehavior.carryOver, advanceMode: progressionBehavior.advanceMode, byType };
}

export function acquisitionFromMechanics(mechanics) {
    const byType = Object.fromEntries(Object.entries(mechanics.byType).map(([type, rules]) => {
        const tier = Math.min(...Object.keys(rules.stages).map(Number));
        return [type, { verified: true, tier, cost: rules.stages[tier].hirePrice }];
    }));
    const defaults = Object.values(byType);
    if (!defaults.length) throw new Error('No hire definitions');
    return { ...defaults[0], byType, source: mechanics.source, costSource: 'buildings.xml.labourer.hireprice', provenance: mechanics.provenance };
}
