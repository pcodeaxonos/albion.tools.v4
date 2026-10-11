import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OrderPriceHistory } from '../js/core/order-price-history.mjs';
import { ORDER_HISTORY_POLICY, AODP_HISTORY_POLICY } from '../js/core/market-history-config.mjs';
import { OBSERVATION_POLICY } from '../js/core/market-observation.mjs';

/** Pure additive conversion. Structural validation fails before any export replaces an archive. */
export function migrateObservationArchive(payload, { servers, now }) {
    const repository = payload.kind === 'albion.tools.aodp-repository';
    const input = repository ? payload.history : payload;
    const history = new OrderPriceHistory({ servers, source: input.source, policy: input.source === 'aodp-current' ? AODP_HISTORY_POLICY : ORDER_HISTORY_POLICY });
    history.restore(input, now);
    const converted = history.snapshot(now);
    return repository ? { ...payload, observationVersion: OBSERVATION_POLICY.version, history: converted } : converted;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (!process.argv[2]) throw new Error('Provide a separate export directory; source archives are never modified');
    const root=process.cwd(), output=resolve(process.argv[2]);
    if(output === resolve(root)) throw new Error('Export directory must differ from source directory');
    const servers=JSON.parse(readFileSync(join(root,'data/price-servers.json'),'utf8')).map(row=>row.code);
    const manifestPath=join(output,'manifest.json');
    const manifest=existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath,'utf8')) : {version:2,asOf:new Date().toISOString(),sourceRoot:root};
    if(manifest.sourceRoot!==root) throw new Error('Export belongs to another source');
    const files=[ORDER_HISTORY_POLICY.fileName,AODP_HISTORY_POLICY.fileName];
    const exports=files.map(name=>{const raw=readFileSync(join(root,name),'utf8');return {name,raw,converted:JSON.stringify(migrateObservationArchive(JSON.parse(raw),{servers,now:Date.parse(manifest.asOf)}))};});
    mkdirSync(output,{recursive:true});
    const preserve=(path,text)=>{if(existsSync(path)){if(readFileSync(path,'utf8')!==text)throw new Error('Existing export differs; use a new directory');}else writeFileSync(path,text,{flag:'wx'});};
    for(const file of exports){preserve(join(output,`${file.name}.original`),file.raw);preserve(join(output,file.name),file.converted);}
    preserve(manifestPath,JSON.stringify(manifest,null,2));
    console.log('Validated export created; source archives untouched. Rollback bytes are in *.original. Export excludes repository journal.');
}
