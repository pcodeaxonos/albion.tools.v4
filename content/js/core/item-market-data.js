import { fetchPrices } from './market.js';
import { fetchHistoryIndex } from './market-history.js';
import { fetchCachedTradeSnapshot } from './trade-live.js';
import { localPriceHost } from './settings.js';
import { OPPORTUNITY_EVIDENCE_API } from './opportunity-evidence.mjs';
import { personalTradeSeries, evidenceTradeSeries } from './item-market.mjs';
import { normalizePriceDate, BOOK_PRICE_FIELDS } from './market-primitives.mjs';
import { HISTORY_CACHE_POLICY, ORDER_HISTORY_ENDPOINT } from './market-history-config.mjs';
import { fetchLongTermIndex } from './long-term-quotes.js';
import { BLACK_MARKET } from './flipper.mjs';

const archiveCache = new Map();
async function cachedHub(path, params, force) {
    for (const [key,entry] of archiveCache) if (Date.now()-entry.at>=HISTORY_CACHE_POLICY.localMs) archiveCache.delete(key);
    const url = localPriceHost()+path+(params ? `?${new URLSearchParams(params)}` : '');
    const hit = archiveCache.get(url);
    if (!force && hit && Date.now()-hit.at < HISTORY_CACHE_POLICY.localMs) return hit.promise;
    const promise = fetch(url,{signal:AbortSignal.timeout(10000)}).then(async r => { if (!r.ok) throw Error(`Arşiv HTTP ${r.status}`); return r.json(); });
    archiveCache.set(url,{at:Date.now(),promise});
    try { return await promise; } catch(e) { if(archiveCache.get(url)?.promise===promise)archiveCache.delete(url);throw e; }
}
export async function loadItemMarket({server,itemId,quality,qualities,cities,force=false}) {
    const scope = {server,itemId,quality};
    const results = await Promise.allSettled([
        fetchPrices([itemId],cities,{qualities,strictQuality:true}),
        fetchHistoryIndex([itemId],cities.filter(c => c !== BLACK_MARKET),{days:90,timeScale:24,qualities:quality,force,throwOnError:true}),
        cachedHub(ORDER_HISTORY_ENDPOINT,{server,items:itemId,locations:cities.join(','),qualities:String(quality)},force),
        fetchCachedTradeSnapshot({server,items:[itemId],locations:cities,qualities:[quality],days:90},{force}),
        cachedHub(OPPORTUNITY_EVIDENCE_API,null,force),
        quality === 1 ? fetchLongTermIndex([itemId],cities) : Promise.resolve(new Map())
    ]);
    const [prices,history,archive,trades,evidence] = results;
    const snapshots = archive.status === 'fulfilled' && archive.value?.kind === 'albion.tools.order-price-history' && Array.isArray(archive.value.series)
        ? (archive.value.series || []).filter(s => s.server===server && s.itemId===itemId && s.quality===quality && cities.includes(s.city) && (s.city!==BLACK_MARKET||s.side==='buy') && Object.hasOwn(BOOK_PRICE_FIELDS,s.side) && s.priceField===BOOK_PRICE_FIELDS[s.side]).map(s => ({
            city:s.city,side:s.side,source:`Yerel saatlik emir snapshotı · ${archive.value.source || 'Kaynak belirtilmemiş'}`,points:(Array.isArray(s.buckets)?s.buckets:[]).map(p => ({time:Date.parse(normalizePriceDate(p.seenAt)),price:p.price,quantity:null})).filter(p => p.time > 0 && p.time <= Date.now() && p.price > 0)
        })) : [];
    return {
        prices:prices.status==='fulfilled' ? prices.value.filter(r => r.item_id===itemId && cities.includes(r.city) && qualities.includes(Number(r.quality))) : [],
        history:history.status==='fulfilled' ? history.value : new Map(), snapshots,
        references:results[5].status==='fulfilled' ? results[5].value : new Map(),
        personal:[...(trades.status==='fulfilled' ? personalTradeSeries(trades.value,scope) : []),...(evidence.status==='fulfilled' ? evidenceTradeSeries(evidence.value,scope) : [])],
        errors:results.map((r,i) => r.status==='rejected' ? ['Canlı fiyat','AODP geçmiş','Yerel snapshot arşivi','SAT şahsi işlemler','V6/FIFO kayıtları','Flipper tarihsel kontrol'][i]+': '+r.reason.message : '').filter(Boolean)
    };
}
