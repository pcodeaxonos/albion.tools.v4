import { chooseFilter, updateChoiceButtons, choiceMatches } from '../components/filter-selection.js';
import { paginationHtml } from '../components/pagination.js';
import { cityNameHtml } from '../components/city-name.js';
import { toolPageHtml } from '../core/app-runtime.js';
import { getAll } from '../db/store.js';
import { getServer, getSettings } from '../core/settings.js';
import { readJsonStorage, writeJsonStorage } from '../core/storage.js';
import { loadActiveCities } from '../core/cities.js';
import { itemLabel, itemIconHtml } from '../components/item-icon.js';
import { itemNameHtml } from '../components/item-name.js';
import { initFloatingLabels } from '../components/forms.js';
import { fieldHeadingHtml, filterChoiceFieldHtml } from '../components/form-field.js';
import { cityColorHex, cityFilterFieldHtml, bindCityField, getCityFieldSelection, setCityFieldSelection } from '../components/city-picker.js';
import { priceVolumeChartHtml, priceSparklineHtml } from '../components/price-volume-chart.js';
import { bindCalcSticky } from '../utils/calc-sticky.js';
import { sortHeaderHtml, sortHeaderGroupHtml, initTableSort } from '../utils/table-sort.js';
import { escapeHtml as esc } from '../utils/utils.js';
import { formatAge } from '../utils/format.js';
import { MARKET_QUALITIES, MARKET_PERIODS, itemFamilies, normalizeMarketSearch, searchedFamilyItem, familyKey, supportedQualities, variationKey, uniqueWatches, orderValue, weightedHistory, historyPoints } from '../core/item-market.mjs';
import { loadItemMarket } from '../core/item-market-data.js';
import { priceIndexKey } from '../core/market.js';
import { routeHref } from '../core/routes.js';
import { evaluateFlip, BLACK_MARKET } from '../core/flipper.mjs';
import { marketSeriesKey } from '../core/market-primitives.mjs';
import { decisionFees } from '../core/decision-data.js';
import { PRICE_STALE_MS } from '../core/market-history-config.mjs';

const root = document.querySelector('[data-item-market]');
const STORAGE = 'albiontools.v4.item-market';
const saved = readJsonStorage(STORAGE) || {};
const state = { item:null, quality:1, mode:'buy', view:new URLSearchParams(location.search).get('view')==='watch'?'watch':'market', group:'all', query:'', page:0, days:{api:30,personal:30}, source:'api', city:getSettings().defaultCity, data:null, busy:false, request:0, watches:uniqueWatches(saved.watches), chartCitySelections:{api:{included:[],excluded:[]},personal:{included:[],excluded:[]}}, sort:{} };
const families = itemFamilies(getAll('items')), items = new Map(families.flatMap(f=>f.variants.map(i=>[i.uniqueName,i])));
const cities = [...loadActiveCities().map(c=>c.marketApiName),BLACK_MARKET];
const groups = [{key:'all',label:'Tümü'}, {key:'weapon',label:'Silah',treeLabel:'Silahlar',categories:['weapons','offhands']}, {key:'armor',label:'Zırh',treeLabel:'Zırhlar',categories:['head','armors','shoes','capes','bags']}, {key:'tool',label:'Araç',treeLabel:'Araçlar',categories:['gathering','mounts','furniture']}, {key:'consumable',label:'Tüketim',treeLabel:'Tüketim',categories:['consumables','farming']}, {key:'resource',label:'Kaynak',treeLabel:'Kaynaklar',categories:['crafting','artefacts','other']}];
const categoryNames = {weapons:'Silahlar',offhands:'Off-Hand',head:'Başlıklar',armors:'Zırhlar',shoes:'Ayakkabılar',capes:'Pelerinler',bags:'Çantalar',gathering:'Toplama araçları',mounts:'Binekler',furniture:'Mobilyalar',consumables:'Tüketim',farming:'Tarım',crafting:'Üretim Malzemeleri',artefacts:'Artefaktlar',other:'Diğer'};
const money = n => Number.isFinite(n) ? n.toLocaleString('tr-TR',{maximumFractionDigits:0}) : '—';
const date = n => n ? new Date(n).toLocaleString('tr-TR') : '—';
const icons = {};
const icon = key => `<span class="market-icon" aria-hidden="true">${icons[key] || ''}</span>`;
let lastViewed = {last:saved.last,quality:saved.quality};
function save() {
    if (state.item) lastViewed = {last:state.item.uniqueName,quality:state.quality};
    return writeJsonStorage(STORAGE,{...lastViewed,watches:state.watches});
}
function updateWatches(next) {
    const previous = state.watches;
    state.watches = next;
    if (save()) {
        root.querySelector('[data-market-status]').textContent=state.error||state.data?.errors.join(' · ')||'';
        return true;
    }
    state.watches = previous;
    root.querySelector('[data-market-status]').textContent='İzleme listesi saklanamadı; tarayıcı depolamasını kontrol edin.';
    return false;
}
const scope = () => ({server:getServer().id,itemId:state.item.uniqueName,quality:state.quality});
const isWatched = () => state.item && state.watches.some(w=>variationKey(w)===variationKey(scope()));
function choices(values,selected,hook) { if (values.some(([value]) => value === 'all')) return filterChoiceFieldHtml({ label: 'Kategori', selected, allValue: 'all', options: values.map(([value, label]) => ({ value, label })), attributes: value => `${hook}="${esc(value)}"` }); return `<div class="segmented-choice segmented-choice--dense" role="group">${values.map(([key,label])=>`<button class="segmented-choice-button segmented-choice-button--compact${String(selected)===String(key)?' is-active':''}" type="button" ${hook}="${esc(key)}" aria-pressed="${String(selected)===String(key)}">${esc(label)}</button>`).join('')}</div>`; }
function shell() {
    const searchControls=`<section class="market-search"><form data-search-form><div class="form-floating form-floating--clearable"><input class="form-control" data-search placeholder="Eşya / item ID" aria-label="Eşya / item ID"><label>Eşya / item ID</label><button class="form-field-clear" data-clear type="button" aria-label="Aramayı temizle">${icon('clear')}</button></div><button class="btn btn-primary btn-icon-only" type="submit" aria-label="Ara">${icon('search')}</button></form>${choices(groups.map(g=>[g.key,g.label]),state.group,'data-group')}<div class="market-tree" data-tree></div><div data-search-results class="market-search-results"></div></section>`;
    const destination=state.view==='watch'?'Eşya Piyasası':'İzleme Listesi';
    const header=`<section class="page-head" data-page-head="item-market"><h1>${icon('item-market')} Eşya Piyasası</h1><p>Albion dünyasındaki eşya fiyatlarını karşılaştırın.</p><a class="btn btn-outline-primary btn-icon-only" href="${routeHref('item-market')}?view=${state.view==='watch'?'market':'watch'}" aria-label="${destination}" data-app-tooltip="${destination}">${icon(state.view==='watch'?'item-market':'watch')}</a></section>`;
    root.innerHTML = toolPageHtml({key:'item-market',fillControls:true,head:header,controls:searchControls,result:`<div class="market-workbench" data-workbench>${state.view==='watch'?'<section class="market-panel market-watch" data-watch-view></section>':`<section class="market-panel market-summary" data-item-summary></section><section class="market-panel market-prices"><div class="market-panel-heading"><h2>ŞEHİR FİYAT TABLOSU</h2>${choices([['buy','Satın Alış (Buy)'],['sell','Satış (Sell)'],['net','Net Kâr'],['arbitrage','Arbitraj Fırsatı']],state.mode,'data-mode')}<span>Gümüş (Silver)</span><button class="btn btn-outline-secondary btn-icon-only" data-refresh aria-label="Fiyatları yenile">${icon('refresh')}</button></div><div class="calc-table-wrap table-responsive" data-city-table></div><small data-price-note></small></section><div class="market-charts"><section class="market-panel" data-api-chart></section><section class="market-panel" data-personal-chart></section></div><section class="market-panel market-quality"><div class="market-panel-heading"><h2>ŞEHİRLERE GÖRE KALİTE FİYAT KARŞILAŞTIRMASI</h2><button class="btn btn-sm btn-outline-secondary" data-quality-toggle aria-expanded="true">Daralt</button></div><div class="calc-table-wrap table-responsive" data-quality-table></div></section>`}<small data-market-status role="status"></small></div>`});
    root.querySelector('[data-search-form]').addEventListener('submit',e=>{e.preventDefault();search();});
    root.querySelector('[data-search]').addEventListener('input',search);
    root.addEventListener('click',onClick);
    root.addEventListener('change',onChange);
    initFloatingLabels(root.querySelector('[data-search-form]'));
    renderTree(); search(); render();
}
function renderTree() {
    root.querySelector('[data-tree]').innerHTML=`<button class="market-tree-all" type="button" data-group="all">${icon('category-tree')}Tümü</button>`+groups.filter(g=>g.categories&&choiceMatches(state.group,g.key)).map(group=>{
        const branches=group.categories.map(category=>{
            const subs=[...new Set(families.filter(f=>f.item.shopCategory===category).map(f=>f.item.shopSubCategory).filter(Boolean))];
            return `<details${state.category===category?' open':''}><summary>${esc(categoryNames[category])}</summary><div class="market-tree-branches"><button type="button" data-category="${category}" class="${state.category===category&&!state.subcategory?'is-active':''}">Tümü</button>${subs.map(sub=>`<button type="button" data-category="${category}" data-subcategory="${esc(sub)}" class="${state.category===category&&state.subcategory===sub?'is-active':''}">${icon('chevron-right')}${esc(sub.replace(/_/g,' '))}</button>`).join('')}</div></details>`;
        }).join('');
        return `<details data-tree-group="${group.key}"${group.categories.includes(state.category)?' open':''}><summary>${icon('category-tree')}${esc(group.treeLabel)}</summary><div class="market-tree-branches">${branches}</div></details>`;
    }).join('');
}
function search() {
    state.query = normalizeMarketSearch(root.querySelector('[data-search]').value); state.page=0; renderSearch();
    if (state.view==='watch') renderWatch();
}
function renderSearch() {
    const categoryMatches = category => choiceMatches(state.group, category, 'all', (key, value) => groups.find(group => group.key === key)?.categories?.includes(value));
    const list = families.filter(f=>categoryMatches(f.item.shopCategory)&&(!state.category||f.item.shopCategory===state.category)&&(!state.subcategory||f.item.shopSubCategory===state.subcategory)&&(!state.query||f.variants.some(i=>normalizeMarketSearch(`${itemLabel(i.uniqueName)} ${i.localizedName} ${i.uniqueName}`).includes(state.query))));
    const size=24, page=list.slice(state.page*size,(state.page+1)*size);
    root.querySelector('[data-search-results]').innerHTML = `<small>${list.length} eşya ailesi</small>${list.length>size?paginationHtml(state.page+1,Math.ceil(list.length/size)):''}${page.map(f=>{const item=searchedFamilyItem(f,state.query);return `<div class="market-search-item${state.item&&familyKey(state.item)===f.key?' is-active':''}">${itemIconHtml(item.uniqueName,{size:28})}<div>${itemNameHtml(itemLabel(item.uniqueName))}<button class="btn btn-sm btn-outline-secondary" type="button" data-select-item="${esc(item.uniqueName)}">Detay</button></div></div>`;}).join('')||'<p>Eşya bulunamadı.</p>'}`;
}
function value(row,field) { return orderValue(row,field); }
function priceCell(row,field) {
    const v=value(row,field);
    return `<td class="${field.startsWith('buy')?'market-buy':'market-sell'}" data-sort-value="${v?.price??''}">${priceHtml(row,field)}</td>`;
}
function priceHtml(row,field) {
    const v=value(row,field), title=`${field} · ${date(v?.at)}${v?.stale?' · Eski (>6 saat)':''}`;
    return `<span class="${field.startsWith('buy')?'market-buy':'market-sell'}"${v?' tabindex="0"':''} data-app-tooltip="${esc(title)}">${money(v?.price)}${v?.stale?'<small> Eski</small>':''}</span>`;
}
function head(label,key,type='number',title='') { return sortHeaderHtml(label,{key,type,title}); }
function cityHtml(city) {
    const row = getAll('cities').find(c=>c.marketApiName===city);
    const file = row?.marketApiName.toLowerCase().replace(/\s/g,'');
    return `<span class="market-city">${file?`<img src="assets/cities/${esc(file)}.png" width="16" height="16" alt="">`:icon(city===BLACK_MARKET?'black-market':'city-prices')}${cityNameHtml(city)}</span>`;
}
function tableBind(host,key) {
    const table=host.querySelector('table'); if (!table) return;
    initTableSort(table,{initial:state.sort[key],onSort:sort=>{state.sort[key]=sort;}});
    bindCalcSticky(host);
    scheduleMarketLayout();
}
function renderSummary() {
    const host=root.querySelector('[data-item-summary]'); if (!host) return;
    if (!state.item) {host.innerHTML='<p>Soldan bir eşya seçin.</p>';return;}
    const variants=families.find(f=>f.key===familyKey(state.item)).variants;
    const tiers=[...new Set(variants.map(i=>i.tier))], enchants=[...new Set(variants.filter(i=>i.tier===state.item.tier).map(i=>i.enchantment))];
    const select=(key,label,values,selected)=>`<div class="choice-field form-field form-field--compact">${fieldHeadingHtml(label)}<select class="form-select form-select-sm" data-variant="${key}" aria-label="${label}">${values.map(([v,l])=>`<option value="${v}"${v===selected?' selected':''}>${esc(l)}</option>`).join('')}</select></div>`;
    const rows=state.data?.prices.filter(r=>Number(r.quality)===state.quality)||[];
    const minimum=field=>rows.map(r=>({city:r.city,...value(r,field)})).filter(v=>v.price>0).sort((a,b)=>a.price-b.price)[0];
    const buy=minimum('buy_price_min'),sell=minimum('sell_price_min');
    const history=state.data?.history.get(priceIndexKey(state.item.uniqueName,state.city,state.quality));
    const average=weightedHistory(history?.points,1);
    const stamps=rows.flatMap(r=>['buy_price_min','buy_price_max','sell_price_min','sell_price_max'].map(f=>value(r,f)?.at)).filter(Boolean);
    const latest=stamps.length?Math.max(...stamps):null;
    const caption = v => v ? v.city+(v.stale?' · Eski':'') : '—';
    const metrics=[['buy','buy-order','En Düşük Alış',money(buy?.price),caption(buy),'buy_price_min: en düşük alış emri; anında satın alma fiyatı değildir. '+date(buy?.at)],['sell','sell-order','En Düşük Satış',money(sell?.price),caption(sell),'sell_price_min: en ucuz satış emri; anında satın alınabilir. '+date(sell?.at)],['average','daily-average','Günlük Ortalama',money(average?.price),state.city+' · Son 24 saat','AODP sell-order history; Σ(avg_price × item_count)/Σ(item_count), yalnız pozitif adet. Veri yoksa —.'],['updated','updated-at','Son Güncelleme',latest?formatAge(Date.now()-latest):'—',date(latest),'Gösterilen emir alanlarının en yeni kaynak zamanı; istek zamanı değildir.']];
    host.innerHTML=`<div class="market-item">${itemIconHtml(state.item.uniqueName,{visual:true})}<div><h2>${itemNameHtml(itemLabel(state.item.uniqueName))}<button class="btn btn-sm btn-outline-secondary" data-watch aria-label="${isWatched()?'İzlemeden çıkar':'İzle'}">${icon(isWatched()?'unwatch':'watch')}</button></h2><small>${esc(categoryNames[state.item.shopCategory]||state.item.shopCategory)}</small><div class="market-variants">${select('tier','Tier',tiers.map(t=>[t,'T'+t]),state.item.tier)}${select('enchant','Enchant',enchants.map(e=>[e,'.'+e]),state.item.enchantment)}${select('quality','Kalite',supportedQualities(state.item).map(q=>[q,MARKET_QUALITIES[q-1]]),state.quality)}</div>${state.item.description?`<small>${esc(state.item.description)}</small>`:''}</div></div><div class="market-summary-metrics">${metrics.map(([key,symbol,label,price,caption,tip])=>`<div class="market-metric market-${key}" tabindex="0" data-app-tooltip="${esc(tip)}">${icon(symbol)}<div><small>${label}</small><strong>${price}</strong><small>${esc(caption)}</small></div></div>`).join('')}</div>`;
}
function renderPrices() {
    const host=root.querySelector('[data-city-table]'); if (!host)return;
    if (!state.item) {host.innerHTML='<p>Eşya seçilmedi.</p>';return;}
    if (['net','arbitrage'].includes(state.mode)) {
        renderFlips(host);return;
    }
    const fields=state.mode==='buy'?['buy_price_max','sell_price_min','buy_price_min','sell_price_max']:['sell_price_min','buy_price_max','sell_price_max','buy_price_min'];
    const labels={buy_price_max:'Max Buy Order',buy_price_min:'Min Buy Order',sell_price_min:'Min Sell Order',sell_price_max:'Max Sell Order'};
    const rows=cities.map(city=>{
        const r=state.data?.prices.find(r=>r.city===city&&Number(r.quality)===state.quality);
        const points=state.data?.history.get(priceIndexKey(state.item.uniqueName,city,state.quality))?.points;
        const daily=weightedHistory(points,1), periods=MARKET_PERIODS.map(d=>weightedHistory(points,d));
        const times=fields.map(f=>value(r,f)?.at).filter(Boolean),latest=times.length?Math.max(...times):null;
        return {city,r,daily,periods,latest,sparkline:priceSparklineHtml(historyPoints(points,7))};
    });
    const maxVolume=Math.max(1,...rows.map(r=>r.daily?.quantity||0));
    host.innerHTML=`<table class="table table-striped calc-table"><thead><tr>${head('Şehir','city','text')}${fields.map(f=>head(labels[f],f,'number',f+' · Her değer kendi tarihini kullanır.')).join('')}${head('Günlük Hacim','volume','number','Son 24 saat, AODP sell-order history item_count toplamı; piyasanın tamamı veya kişisel gerçekleşme değildir.')}${MARKET_PERIODS.map(d=>head(d+' Gün Ort.','avg'+d,'number','AODP sell-order history; pozitif adet ağırlıklı, yalnız mevcut gözlemler.')).join('')}${head('Son Güncelleme','time','number')}</tr></thead><tbody>${rows.map(({city,r,daily,periods,latest,sparkline})=>`<tr data-city-row="${esc(city)}" class="${city===state.city?'is-active':''}"><td data-sort-value="${esc(city)}"><button type="button" data-market-city="${esc(city)}">${cityHtml(city)}</button></td>${fields.map(f=>priceCell(r,f)).join('')}<td data-sort-value="${daily?.quantity??''}">${daily?`<span class="market-volume">${money(daily.quantity)}<meter min="0" max="${maxVolume}" value="${daily.quantity}" aria-label="${esc(city)} gerçek history adedi"></meter></span>`:'—'}</td>${periods.map((p,i)=>`<td class="market-average" data-sort-value="${p?.price??''}">${i===0?sparkline:''}${money(p?.price)}</td>`).join('')}<td class="market-updated" data-sort-value="${latest??''}" title="${date(latest)}">${latest?formatAge(Date.now()-latest):'—'}</td></tr>`).join('')}</tbody></table>`;
    root.querySelector('[data-price-note]').textContent='Alanlar emir yönüdür. Her fiyatın tarihi hücrede; 6 saatten eski veri “Eski”. Hacim yalnız AODP history adedidir. Ortalamalar yalnız mevcut pozitif adetli gözlemlerden hesaplanır.';
    tableBind(host,'city');
}
function renderFlips(host) {
    const rows=state.data?.prices.filter(r=>Number(r.quality)===state.quality)||[],refs=state.data?.references;
    const reference=(r,side)=>refs?.get(marketSeriesKey({server:getServer().id,itemId:r.item_id,city:r.city,quality:state.quality,side}));
    const fees=decisionFees();
    const flips=rows.flatMap(source=>source.city===BLACK_MARKET?[]:rows.map(target=>evaluateFlip({item:state.item,source,target,sourceReference:reference(source,'sell'),targetReference:reference(target,'buy'),taxRate:fees.taxRate,transport:0,maxAgeMs:PRICE_STALE_MS}))).filter(r=>r&&r.safe&&r.referenceKnown&&(state.mode!=='arbitrage'||r.net>0));
    host.innerHTML=`<table class="table table-striped calc-table"><thead><tr>${head('Kaynak','source','text')}${head('Hedef','target','text')}${head('Alış','buy')}${head('Satış','sell')}${head('Net / adet','net')}${head('ROI','roi')}${head('Veri yaşı','age')}</tr></thead><tbody>${flips.map(r=>`<tr><td>${cityHtml(r.source)}</td><td>${cityHtml(r.target)}</td><td class="market-buy" data-sort-value="${r.buy}">${money(r.buy)}</td><td class="market-sell" data-sort-value="${r.sell}">${money(r.sell)}</td><td data-sort-value="${r.net}">${money(r.net)}</td><td data-sort-value="${r.roi}">%${money(r.roi*100)}</td><td data-sort-value="${r.ageMs}">${esc(formatAge(r.ageMs))}</td></tr>`).join('')||'<tr><td colspan="7">Güncel ve tarihsel kontrolü geçen fiyat çifti yok. Eksik veya uç fiyatlardan fırsat üretilmez.</td></tr>'}</tbody></table>`;
    root.querySelector('[data-price-note]').innerHTML=`Flipper hesap motoru · Mevcut premium/vergi ayarı · Anında alış/satış · Taşıma gideri 0 varsayımı · Adet ve emir derinliği bilinmiyor; gerçekleşmiş kazanç değildir. <a href="${routeHref('flipper')}">Taşıma giderini Flipper’da hesapla</a>`;
    tableBind(host,'flips');
}
function renderQuality() {
    const host=root.querySelector('[data-quality-table]');if(!host)return;
    const qualities=state.item?supportedQualities(state.item):[1];
    host.innerHTML=`<table class="table table-striped calc-table"><thead><tr>${head('Şehir','city','text')}${qualities.map(q=>sortHeaderGroupHtml(MARKET_QUALITIES[q-1],[{key:'q'+q+'buy',field:'buy',label:'B',title:'Max Buy Order · buy_price_max',className:'market-buy'},{key:'q'+q+'sell',field:'sell',label:'S',title:'Min Sell Order · sell_price_min',className:'market-sell'}])).join('')}</tr></thead><tbody>${cities.map(city=>`<tr class="${city===state.city?'is-active':''}"><td>${cityHtml(city)}</td>${qualities.map(q=>{const r=state.data?.prices.find(r=>r.city===city&&Number(r.quality)===q);return `<td data-sort-buy="${value(r,'buy_price_max')?.price??''}" data-sort-sell="${value(r,'sell_price_min')?.price??''}"><div class="market-quality-prices">${priceHtml(r,'buy_price_max')}<span aria-hidden="true">|</span>${priceHtml(r,'sell_price_min')}</div></td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
    tableBind(host,'quality');
}
function chartSeries(personal) {
    if(!state.data||!state.item)return [];
    if(personal){const grouped=new Map();for(const p of state.data.personal){const key=JSON.stringify([p.source,p.city,p.side]);if(!grouped.has(key))grouped.set(key,{key,city:p.city,label:p.side==='buy'?'Alış':'Satış',source:p.source,color:p.side==='buy'?'#00d39b':'#fb496c',points:[]});grouped.get(key).points.push(p);}return [...grouped.values()];}
    if(state.source==='snapshot')return state.data.snapshots.map(s=>({...s,key:JSON.stringify([s.city,s.side]),label:s.side==='buy'?'Buy MAX snapshot':'Sell MIN snapshot',color:s.side==='buy'?'#00d39b':'#fb496c'}));
    return cities.flatMap(city=>{const h=state.data.history.get(priceIndexKey(state.item.uniqueName,city,state.quality));return h?.points?.length?[{key:city,city,label:'Sell-order ortalaması',source:'AODP history · 24 saat',color:cityColorHex(getAll('cities').find(c=>c.marketApiName===city)),points:historyPoints(h.points,90)}]:[];});
}
function renderCharts() {
    for (const personal of [false,true]) {
        const host=root.querySelector(personal?'[data-personal-chart]':'[data-api-chart]');if(!host)continue;
        const kind=personal?'personal':'api', selection=state.chartCitySelections[kind];
        const days=state.days[kind];
        const all=chartSeries(personal),series=all.filter(s=>(!selection.included.length||selection.included.includes(s.city))&&!selection.excluded.includes(s.city));
        const controls=personal
            ? '<small>SAT ve V6/FIFO gerçekleşmeleri ayrı seriler; aynı işlem iki kaynakta varsa iki kayıt olarak gösterilir.</small>'
            : `<div class="choice-field form-field form-field--compact">${fieldHeadingHtml('Kaynak')}<select class="form-select form-select-sm" data-history-source aria-label="API geçmiş kaynağı"><option value="api"${state.source==='api'?' selected':''}>AODP sell-order history</option><option value="snapshot"${state.source==='snapshot'?' selected':''}>Yerel Buy MAX / Sell MIN snapshot</option></select></div>`;
        const cityValues = [...new Set(all.map(s=>s.city))];
        const legend = cityValues.length ? cityFilterFieldHtml({ id: `market-chart-${kind}-cities`, label: 'Şehirler', values: cityValues, className: '' }) : '';
        host.innerHTML=`<div class="market-panel-heading"><h2>${personal?'Şahsi Trade Geçmişim':'API Fiyat Geçmişi'}</h2>${choices(MARKET_PERIODS.map(d=>[d,d+' Gün']),days,'data-days')}</div><div class="market-chart-controls">${controls}</div><div class="market-chart"></div><div class="market-chart-legend">${legend}</div>`;
        const plot=host.querySelector('.market-chart');
        plot.innerHTML=priceVolumeChartHtml(series,{days,width:Math.max(300,plot.clientWidth),height:Math.max(52,plot.clientHeight),empty:personal?'Kayıtlı şahsi trade verisi yok':'Seçili kaynakta fiyat geçmişi verisi yok'});
        if (cityValues.length) {
            const field = `market-chart-${kind}-cities`;
            bindCityField(host, field, () => {
                const selection = getCityFieldSelection(host, field);
                state.chartCitySelections[kind] = selection;
                renderCharts();
            }, { syncPeers: false, multiSelection: true });
            setCityFieldSelection(host, field, selection);
            initFloatingLabels(host);
        }
    }
}
function renderWatch() {
    const host=root.querySelector('[data-watch-view]');if(!host)return;
    const rows=state.watches.filter(w=>w.server===getServer().id&&(!state.query||normalizeMarketSearch(`${itemLabel(w.itemId)} ${w.itemId}`).includes(state.query))&&choiceMatches(state.group,items.get(w.itemId)?.shopCategory,'all',(key,category)=>groups.find(g=>g.key===key)?.categories?.includes(category))&&(!state.category||items.get(w.itemId)?.shopCategory===state.category)&&(!state.subcategory||items.get(w.itemId)?.shopSubCategory===state.subcategory));
    host.innerHTML=`<div class="market-panel-heading"><h2>İzleme Listesi</h2><small>${esc(getServer().label)} · ${rows.length} varyasyon</small></div><p>Şehir, detay görünümünde seçilir. Liste fiyat taraması başlatmaz.</p><div class="calc-table-wrap table-responsive"><table class="table table-striped calc-table"><thead><tr>${head('Eşya','item','text')}${head('Tier / Enchant','tier')}${head('Kalite','quality')}${head('Eklenme','added')}<th>İşlem</th></tr></thead><tbody>${rows.map(w=>`<tr><td>${itemNameHtml(itemLabel(w.itemId))}</td><td data-sort-value="${(items.get(w.itemId)?.tier||0)*10+(items.get(w.itemId)?.enchantment||0)}">${esc(w.itemId.match(/^T\d+/)?.[0]||'—')}.${items.get(w.itemId)?.enchantment||0}</td><td data-sort-value="${w.quality}">${MARKET_QUALITIES[w.quality-1]}</td><td data-sort-value="${w.addedAt??''}">${date(w.addedAt)}</td><td><a class="btn btn-sm btn-outline-primary" href="${routeHref('item-market')}?item=${encodeURIComponent(w.itemId)}&quality=${w.quality}">Detay</a><button class="btn btn-sm btn-outline-secondary" data-unwatch="${esc(variationKey(w))}">Çıkar</button></td></tr>`).join('')||'<tr><td colspan="5">İzleme kaydı yok.</td></tr>'}</tbody></table></div>`;
    tableBind(host,'watch');
}
function render() {
    if(state.view==='watch')renderWatch();else{renderSummary();renderPrices();renderQuality();renderCharts();}
    const status=root.querySelector('[data-market-status]');status.textContent=state.busy?'Seçili eşyanın verileri alınıyor…':state.error||state.data?.errors.join(' · ')||'';
    scheduleMarketLayout();
}
async function selectItem(id,quality=state.quality) {
    const item=items.get(id);if(!item)return;
    state.item=item;state.quality=supportedQualities(item).includes(Number(quality))?Number(quality):1;state.data=null;state.chartCitySelections.api={included:[],excluded:[]};state.chartCitySelections.personal={included:[],excluded:[]};save();renderSearch();await refresh();
}
async function refresh(force=false) {
    if(!state.item||state.view==='watch')return;
    const request=++state.request;state.busy=true;state.error='';render();
    const server=getServer().id;
    try {
        const data=await loadItemMarket({...scope(),qualities:supportedQualities(state.item),cities,force});
        if(request!==state.request)return;
        if(getServer().id!==server){state.data=null;state.error='Sunucu değişti; seçili eşyanın verilerini yeniden alın.';}
        else state.data=data;
    } catch(error) { if(request!==state.request)return;state.data=null;state.error=error.message||'Veri alınamadı.'; }
    state.busy=false;render();
}
function onClick(e) {
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-clear')){const field=root.querySelector('[data-search]');field.value='';field.dispatchEvent(new Event('input',{bubbles:true}));}
    if(b.dataset.group){state.group=chooseFilter(state.group,b.dataset.group,e);state.category='';state.subcategory='';updateChoiceButtons(root.querySelectorAll('[data-group]'),state.group,x=>x.dataset.group);renderTree();search();}
    if(b.dataset.category){state.category=b.dataset.category;state.subcategory=b.dataset.subcategory||'';renderTree();search();}
    if(b.dataset.selectItem){if(state.view==='watch'){location.href=routeHref('item-market')+'?item='+encodeURIComponent(b.dataset.selectItem);return;}selectItem(b.dataset.selectItem);}
    if(b.hasAttribute('data-pagination-page')&&!b.disabled){state.page=Number(b.dataset.paginationPage)-1;renderSearch();}
    if(b.dataset.mode){state.mode=b.dataset.mode;root.querySelectorAll('[data-mode]').forEach(x=>{x.classList.toggle('is-active',x===b);x.setAttribute('aria-pressed',String(x===b));});renderPrices();}
    if(b.hasAttribute('data-refresh')&&!state.busy)refresh(true);
    if(b.dataset.marketCity){state.city=b.dataset.marketCity;renderSummary();renderPrices();renderQuality();}
    if(b.dataset.days){state.days[b.closest('[data-api-chart]')?'api':'personal']=Number(b.dataset.days);renderCharts();}
    if(b.hasAttribute('data-watch')){const w=scope(),key=variationKey(w);updateWatches(isWatched()?state.watches.filter(x=>variationKey(x)!==key):uniqueWatches([...state.watches,{...w,addedAt:Date.now()}]));renderSummary();scheduleMarketLayout();}
    if(b.dataset.unwatch){updateWatches(state.watches.filter(w=>variationKey(w)!==b.dataset.unwatch));renderWatch();}
    if(b.hasAttribute('data-quality-toggle')){const table=root.querySelector('[data-quality-table]');table.hidden=!table.hidden;b.setAttribute('aria-expanded',String(!table.hidden));b.textContent=table.hidden?'Aç':'Daralt';scheduleMarketLayout();}
}
function onChange(e) {
    const key=e.target.dataset.variant;
    if(key==='quality')selectItem(state.item.uniqueName,Number(e.target.value));
    if(key==='tier'||key==='enchant'){const variants=families.find(f=>f.key===familyKey(state.item)).variants;const tier=key==='tier'?Number(e.target.value):state.item.tier,enchant=key==='enchant'?Number(e.target.value):state.item.enchantment;const item=variants.find(i=>i.tier===tier&&i.enchantment===enchant)||variants.find(i=>i.tier===tier);selectItem(item.uniqueName);}
    if(e.target.hasAttribute('data-history-source')){state.source=e.target.value;state.chartCitySelections.api={included:[],excluded:[]};renderCharts();}
}
await Promise.all(['item-market','search','clear','category-tree','chevron-right','buy-order','sell-order','daily-average','updated-at','watch','unwatch','refresh','city-prices','black-market'].map(async name=>{try{const r=await fetch(name==='black-market'?'content/icons/flipper/black-market.svg':`content/icons/item-market/${name}.svg`);if(r.ok)icons[name]=await r.text();}catch{}}));
let layoutFrame;
function scheduleMarketLayout() {
    cancelAnimationFrame(layoutFrame);
    layoutFrame=requestAnimationFrame(syncMarketLayout);
}
function intrinsicPanelHeight(panel) {
    const style=getComputedStyle(panel);
    const edges=['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((sum,key)=>sum+parseFloat(style[key]),0);
    const chrome=[...panel.children].filter(child=>!child.matches('.calc-table-wrap')).reduce((sum,child)=>{
        const cs=getComputedStyle(child);return sum+child.getBoundingClientRect().height+parseFloat(cs.marginTop)+parseFloat(cs.marginBottom);
    },0);
    return Math.ceil(edges+chrome+(panel.querySelector('table')?.getBoundingClientRect().height||0));
}
function syncMarketLayout() {
    const workbench=root.querySelector('[data-workbench]'),prices=root.querySelector('.market-prices'),quality=root.querySelector('.market-quality');
    if(!prices||!quality)return;
    if(window.matchMedia('(min-width: 992px)').matches) {
        const charts=root.querySelector('.market-charts'),style=getComputedStyle(workbench);
        const gaps=Math.max(0,[...workbench.children].filter(child=>getComputedStyle(child).display!=='none').length-1);
        const available=workbench.clientHeight-root.querySelector('[data-item-summary]').getBoundingClientRect().height-root.querySelector('[data-market-status]').getBoundingClientRect().height-gaps*parseFloat(style.rowGap)-parseFloat(getComputedStyle(charts).minHeight);
        const desiredPrices=intrinsicPanelHeight(prices),desiredQuality=intrinsicPanelHeight(quality);
        const scale=Math.min(1,Math.max(0,available)/(desiredPrices+desiredQuality));
        workbench.style.setProperty('--market-prices-height',`${Math.floor(desiredPrices*scale)}px`);
        workbench.style.setProperty('--market-quality-height',`${Math.floor(desiredQuality*scale)}px`);
    }
    renderCharts();
}
shell();
new ResizeObserver(scheduleMarketLayout).observe(root.querySelector('[data-workbench]'));
window.addEventListener('resize',scheduleMarketLayout);
const params=new URLSearchParams(location.search),initial=params.get('item')||saved.last;
if(state.view==='market'&&items.has(initial))await selectItem(initial,Number(params.get('quality')||saved.quality)||1);
else if(state.view==='market')await selectItem(families.find(f=>f.item.shopCategory==='mounts')?.item.uniqueName||families[0]?.item.uniqueName,1);
