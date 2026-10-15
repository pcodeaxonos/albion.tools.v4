import { DAY_MS, PRICE_STALE_MS } from './market-history-config.mjs';
import { normalizePriceDate, median, roundHistoricalPrice, BOOK_PRICE_FIELDS, quotedBookPrice } from './market-primitives.mjs';
import { summarizePersonalExecutions } from './personal-price-evidence.mjs';
export const SALE_HORIZONS = Object.freeze([2, 7, 28].map(days => Object.freeze({ days, label: `${days} gün` })));
export const SALE_HISTORY_DAYS = 90;
export const SALE_ESTIMATOR = 'limit-first-passage-v3';
// Risk requirements, not measured accuracy. A cohort must include failed orders.
export const LIMIT_ORDER_POLICY = Object.freeze({ reachShare: .7, fillLowerBound: .7,
    minPaths: 20, minIndependentPaths: 2, minOrderTrials: 20, maxAgeDays: 2,
    regimeDays: 7, minRegimeDays: 4, maxRegimeDistance: .35, maxOrderDays: 30 });
// Pick one source per UTC day; overlapping averages are alternative coverage,
// never independent trades. More observed hours wins, then known item volume.
export function mergePotentialHistory(sources) {
    const selected = new Map();
    for (const { source, points = [] } of sources) {
        const buckets = new Map();
        for (const point of points) {
            const at = Date.parse(normalizePriceDate(point.timestamp));
            const price = Number(point.price ?? point.avg_price), quantity = Number(point.quantity ?? point.item_count);
            if (!Number.isFinite(at) || !(price > 0) || !Number.isFinite(price) || !Number.isSafeInteger(quantity) || quantity <= 0) continue;
            const day = Math.floor(at / DAY_MS), intervalHours = Number(point.intervalHours ?? 24);
            if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 24) continue;
            // Different packet timescales overlap. Compare them as alternatives
            // instead of summing an hourly bucket into its six-hour parent.
            const bucketKey = `${day}|${intervalHours}`, rows = buckets.get(bucketKey) ?? new Map();
            const previous = rows.get(at);
            if (!previous || previous.quantity < quantity) rows.set(at, { timestamp: new Date(at).toISOString(), price, quantity, source: point.source ?? source,
                ...(point.observedAt ? { observedAt: point.observedAt } : {}), ...(point.availableAt ? { availableAt: point.availableAt } : {}),
                ...(point.fetchedAt ? { fetchedAt: point.fetchedAt } : {}),
                intervalHours });
            buckets.set(bucketKey, rows);
        }
        for (const [bucketKey, bucket] of buckets) {
            const day = Number(bucketKey.split('|')[0]);
            let previousEnd = -Infinity;
            const rows = [...bucket.values()].sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp)).filter(point => {
                const start = Date.parse(point.timestamp);
                if (start < previousEnd) return false;
                previousEnd = start + point.intervalHours*3600000;
                return true;
            }), hours = new Set();
            for (const point of rows) for (let hour = 0; hour < Math.min(24, point.intervalHours); hour++)
                if (new Date(Date.parse(point.timestamp)).getUTCHours() + hour < 24)
                    hours.add(new Date(Date.parse(point.timestamp)).getUTCHours() + hour);
            const candidate = { rows, coverage: hours.size, quantity: rows.reduce((sum, point) => sum + point.quantity, 0) };
            const old = selected.get(day);
            if (!old || candidate.coverage > old.coverage || candidate.coverage === old.coverage && candidate.quantity > old.quantity) selected.set(day, candidate);
        }
    }
    return [...selected.values()].flatMap(value => value.rows);
}

const time = value => Date.parse(normalizePriceDate(value));
const knownAt = (p, now) => (!p.observedAt || time(p.observedAt) <= now) && (!p.availableAt || time(p.availableAt) <= now)
    && (!p.fetchedAt || time(p.fetchedAt) <= now);
const crosses = (side, value, limit) => side === 'sell' ? value >= limit : value <= limit;

export function binomialLowerBound(successes, trials) {
    if (!trials) return null;
    const z = 1.96, p = successes / trials, z2 = z*z;
    return (p + z2/(2*trials) - z*Math.sqrt(p*(1-p)/trials + z2/(4*trials*trials))) / (1+z2/trials);
}

function dailyMarket(evidence, now) {
    const end = Math.floor(now/DAY_MS)*DAY_MS;
    const points = mergePotentialHistory([{ source: evidence?.source ?? 'Piyasa geçmişi',
        points: (evidence?.kind === 'executions' ? [] : evidence?.forecastPoints ?? []).filter(p => knownAt(p,now)
            && time(p.timestamp) >= end-SALE_HISTORY_DAYS*DAY_MS
            && time(p.timestamp)+Number(p.intervalHours ?? 24)*3600000 <= end) }]);
    const days = new Map();
    for (const p of points) {
        const day = Math.floor(time(p.timestamp)/DAY_MS), d = days.get(day) ?? { day, value:0, quantity:0, hours:new Set() };
        d.value += p.price*p.quantity; d.quantity += p.quantity;
        const hour=(time(p.timestamp)-day*DAY_MS)/3600000;
        for (let offset=0;offset<p.intervalHours && hour+offset<24;offset++) d.hours.add(hour+offset);
        days.set(day,d);
    }
    return [...days.values()].map(d => ({ day:d.day, price:d.value/d.quantity, quantity:d.quantity,
        coverage:Math.min(1,d.hours.size/24) })).sort((a,b) => a.day-b.day);
}

// Shared origins/denominator and nested path prefixes ensure monotone reach.
// Unknown days stop the path; neither missing days nor right censoring are hits.
function marketPaths(daily) {
    const map = new Map(daily.map(d => [d.day,d])), latest = daily.at(-1);
    if (!latest) return [];
    const regime = origin => {
        const past = daily.filter(d => d.day<=origin.day && d.day>origin.day-LIMIT_ORDER_POLICY.regimeDays && d.coverage===1);
        return past.length<LIMIT_ORDER_POLICY.minRegimeDays ? null : {
            trend:Math.log(origin.price/past[0].price)/(origin.day-past[0].day || 1),
            volatility:median(past.slice(1).map((d,i) => Math.abs(Math.log(d.price/past[i].price)))) ?? 0 };
    };
    const current = regime(latest);
    if (!current) return [];
    return daily.flatMap(origin => {
        if (origin.coverage!==1 || !map.has(origin.day+SALE_HORIZONS[0].days)) return [];
        const state = regime(origin);
        if (!state || Math.abs(state.trend-current.trend)+Math.abs(state.volatility-current.volatility)>LIMIT_ORDER_POLICY.maxRegimeDistance) return [];
        const path = [];
        for (let offset=1; offset<=SALE_HORIZONS.at(-1).days; offset++) {
            const next = map.get(origin.day+offset);
            if (!next || next.coverage!==1) break;
            path.push({offset,ratio:next.price/origin.price,quantity:next.quantity});
        }
        return path.length>=SALE_HORIZONS[0].days ? [{origin:origin.day,path}] : [];
    });
}

function assessReach(paths, ratio, side, days) {
    const hit = paths.filter(({path}) => path.some(p => p.offset<=days && crosses(side,p.ratio,ratio))).length;
    const complete = paths.filter(({path}) => path.length>=days).length;
    const independent = []; let last = -Infinity;
    for (const path of paths) if (path.origin>=last+SALE_HORIZONS.at(-1).days) { independent.push(path); last=path.origin; }
    const hits = independent.filter(({path}) => path.some(p => p.offset<=days && crosses(side,p.ratio,ratio))).length;
    return { paths:paths.length, observedHits:hit, observedShare:paths.length ? hit/paths.length : null,
        completePaths:complete, censoredPaths:paths.length-complete, independentPaths:independent.length,
        lowerBound:binomialLowerBound(hits,independent.length),
        supported:paths.length>=LIMIT_ORDER_POLICY.minPaths && independent.length>=LIMIT_ORDER_POLICY.minIndependentPaths
            && hit/paths.length>=LIMIT_ORDER_POLICY.reachShare,
        meaning:'Ortalama fiyat seviyesine ulaşma; emir dolumu değildir.' };
}

// Successful mail fills alone omit failures and cannot supply this denominator.
function orderTrials(evidence, request, now) {
    return [...new Map((evidence?.orderOutcomes ?? []).filter(o => o.verified===true && o.fixedPrice===true
        && o.orderId!=null && o.server===request.server && o.city===request.city && o.itemId===request.itemId
        && o.quality===request.quality && o.side===request.side && knownAt(o,now)
        && o.limitPrice>0 && o.anchorPrice>0 && Number.isSafeInteger(o.quantity) && o.quantity>0
        && time(o.createdAt)>=now-SALE_HISTORY_DAYS*DAY_MS && time(o.createdAt)<=time(o.observationEnd)
        && time(o.observationEnd)<=now && time(o.observationEnd)-time(o.createdAt)<=LIMIT_ORDER_POLICY.maxOrderDays*DAY_MS
        && ['filled','expired','cancelled','open'].includes(o.status))
        .map(o => [JSON.stringify([o.characterGuid,o.orderId]),o])).values()];
}

function assessFill(trials, ratio, request, days) {
    const quantity=request.quantity ?? 1;
    const eligible=trials.filter(o => o.quantity>=quantity && crosses(request.side,o.limitPrice/o.anchorPrice,ratio)
        && (time(o.observationEnd)-time(o.createdAt)>=days*DAY_MS || o.status==='filled'
            && time(o.completedAt)>=time(o.createdAt) && time(o.completedAt)<=time(o.observationEnd) && o.filledQuantity>=o.quantity));
    const hits=eligible.filter(o => o.status==='filled' && o.filledQuantity>=o.quantity
        && time(o.completedAt)-time(o.createdAt)<=days*DAY_MS).length;
    const lowerBound=binomialLowerBound(hits,eligible.length);
    return { trials:eligible.length, fills:hits, censored:trials.length-eligible.length,
        observedShare:eligible.length ? hits/eligible.length : null, lowerBound,
        supported:eligible.length>=LIMIT_ORDER_POLICY.minOrderTrials && lowerBound>=LIMIT_ORDER_POLICY.fillLowerBound,
        quantity, meaning:'Doğrulanmış sabit emir kohortu; kısmi dolum tam gerçekleşme sayılmaz.' };
}

function calibratedExecution(evidence, request, days, now) {
    const c=evidence?.executionCalibration;
    // A separate, held-out evaluation is required. Training cohort success
    // counts cannot calibrate themselves or silently authorize Planner prices.
    return c?.estimator===SALE_ESTIMATOR && c.heldOut===true && c.independent===true
        && c.days===days && c.quantity===(request.quantity ?? 1)
        && ['server','city','itemId','quality','side'].every(key => c[key]===request[key])
        && time(c.evaluatedAt)<=now && time(c.evaluatedAt)>=now-SALE_HISTORY_DAYS*DAY_MS
        && Number.isSafeInteger(c.trials) && Number.isSafeInteger(c.successes)
        && c.trials>=LIMIT_ORDER_POLICY.minOrderTrials && c.successes>=0 && c.successes<=c.trials
        && binomialLowerBound(c.successes,c.trials)>=LIMIT_ORDER_POLICY.fillLowerBound;
}

export function saleHorizonTarget(evidence, request, row, horizonDays, now=Date.now()) {
    const valid=SALE_HORIZONS.some(p => p.days===horizonDays) && ['buy','sell'].includes(request.side)
        && Number.isSafeInteger(request.quantity ?? 1) && (request.quantity ?? 1)>0;
    const daily=dailyMarket(evidence,now), latest=daily.at(-1);
    const ageDays=latest ? (now-(latest.day+1)*DAY_MS)/DAY_MS : null;
    const fresh=ageDays!=null && ageDays<=LIMIT_ORDER_POLICY.maxAgeDays;
    const book=side => {
        const field=BOOK_PRICE_FIELDS[side], at=time(row?.[field+'_date']);
        return row?.item_id===request.itemId && row.city===request.city && Number(row.quality)===request.quality
            && at<=now && now-at<=PRICE_STALE_MS && row[field]>0 ? quotedBookPrice(row[field],side,request.side) : null;
    };
    const currentOrder=book(request.side), anchor=latest?.price ?? null;
    const personalPoints=(evidence?.personalForecastPoints ?? (evidence?.kind==='executions' ? evidence.forecastPoints : []) ?? [])
        .filter(p => knownAt(p,now) && time(p.timestamp)<=now && time(p.timestamp)>=now-SALE_HISTORY_DAYS*DAY_MS);
    const personalSummary=summarizePersonalExecutions(personalPoints,now);
    const paths=marketPaths(daily), trials=orderTrials(evidence,request,now), candidates=new Set([1]);
    const independentCount=paths.reduce((state,p) => p.origin>=state.last+SALE_HORIZONS.at(-1).days
        ? {last:p.origin,count:state.count+1} : state,{last:-Infinity,count:0}).count;
    const supportedPaths=paths.length>=LIMIT_ORDER_POLICY.minPaths && independentCount>=LIMIT_ORDER_POLICY.minIndependentPaths;
    for (const {path} of supportedPaths ? paths : []) for (const {days} of SALE_HORIZONS) {
        const ratios=path.filter(p => p.offset<=days).map(p => p.ratio);
        candidates.add(request.side==='sell' ? Math.max(...ratios) : Math.min(...ratios));
    }
    if (anchor>0) {
        if (currentOrder>0) candidates.add(currentOrder/anchor);
        for (const p of personalPoints) if (p.price>0) candidates.add(p.price/anchor);
        for (const o of trials) candidates.add(o.limitPrice/o.anchorPrice);
    }
    const prices=[...new Set([...candidates].map(r => roundHistoricalPrice(anchor*r,request.side)))].filter(p => p>0)
        .sort((a,b) => request.side==='sell' ? b-a : a-b);
    const assessments=valid && fresh && anchor>0 ? prices.map(price => {
        const ratio=price/anchor, reach=assessReach(paths,ratio,request.side,horizonDays);
        const fills=SALE_HORIZONS.filter(p => p.days<=horizonDays).map(p => ({...assessFill(trials,ratio,request,p.days),
            deadlineDays:p.days,calibrated:Boolean(calibratedExecution(evidence,request,p.days,now))}));
        const fill=fills.find(p => p.supported && p.calibrated) ?? fills.at(-1);
        return {price,reach,fill,accepted:fill.supported && fill.calibrated};
    }) : [];
    const selected=assessments.find(a => a.accepted), reached=assessments.find(a => a.reach.supported);
    const usable=Boolean(selected), target=selected?.price ?? null;
    const reference=roundHistoricalPrice(median(daily.map(d => d.price)),request.side);
    const reason=!valid ? 'Azami bekleme süreleri 2, 7 ve 28 gündür; miktar pozitif tam sayı olmalı.'
        : !fresh ? 'Güncel, tamamlanmış piyasa geçmişi yetersiz.'
        : !usable ? 'Doğrulanmış sabit emir kohortu ve bağımsız kalibrasyon yetersiz; dolum güveni ölçülemiyor.' : null;
    return {estimator:SALE_ESTIMATOR,days:horizonDays,setup:true,expires:true,
        reliable:usable,priceReliable:usable,plannerUsable:usable,calculable:daily.length>0 || personalSummary.fills>0,
        price:target,rawPrice:target,potentialPrice:target,candidatePrice:reached?.price ?? null,
        indicativePrice:usable ? null : reached?.price ?? reference ?? personalSummary.referencePrice,
        historicalPrice:reference,referencePrice:reference,recentPrice:anchor,currentOrder,instantBuyPrice:book('sell'),
        quantity:request.quantity ?? 1,samples:daily.length,historicalWindows:paths.length,confidence:usable ? 'medium' : 'low',
        freshness:fresh ? 'fresh' : latest ? 'stale' : 'missing',ageDays,
        latest:latest ? new Date((latest.day+1)*DAY_MS).toISOString() : personalSummary.latest,
        assessedAt:new Date(now).toISOString(),validUntil:latest ? new Date((latest.day+1+LIMIT_ORDER_POLICY.maxAgeDays)*DAY_MS).toISOString() : new Date(now).toISOString(),
        method:'Sabit limit / ilk ulaşma ve ayrı dolum kanıtı',
        evidenceType:usable ? 'Doğrulanmış emir kohortu' : reached ? 'Piyasa ortalamasına ulaşma desteği' : 'Tarihsel referans',
        source:[daily.length ? evidence?.source ?? 'Piyasa geçmişi' : null,personalSummary.fills ? 'Kişisel SAT' : null].filter(Boolean).join(' · '),
        reachEvidence:reached?.reach ?? null,fillEvidence:selected?.fill ?? {...assessFill(trials,1,request,horizonDays),calibrated:false},
        personalSummary,personalImpact:{selected:false,reason:'Kişisel dolum fiyatları aday havuzunda; süre ve başarısız emir paydası olmadan kabul edilmez.'},
        personalEvidence:{price:null,indicativePrice:personalSummary.referencePrice,transactions:personalSummary.fills},
        marketEvidence:{price:target,indicativePrice:reached?.price ?? reference},
        ...(evidence?.includeWindowEvidence ? {candidateAssessments:assessments,windowEvidence:paths.map(p => ({origin:new Date(p.origin*DAY_MS).toISOString(),observedDays:p.path.length}))} : {}),
        reason,marketMeaning:'Ortalama fiyatlar tekil uç fiyat değildir. Fiyata ulaşma emrin dolduğunu göstermez.',
        explanation:`${paths.length} geçmiş başlangıç; aynı başlangıçların 2/7/28 günlük ilk ulaşması incelenir. Eksik gelecek sansürlüdür. ${personalSummary.fills} kişisel dolum aday kanıtıdır. Merkezi dolum alt güven sınırı ${LIMIT_ORDER_POLICY.fillLowerBound}; ölçülmüş doğruluk değildir. ${reason ?? 'Kohort eşiği karşılandı.'}`};
}
