import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { evaluateFlip } from '../js/core/flipper.mjs';
import { marketSeriesKey } from '../js/core/market-primitives.mjs';
import { aodpUrl, urlBatches } from '../js/core/market-request.mjs';
let failPrices=false, failHistory=false, changeServer=false, server='europe', historyCalls=0, optionsSeen;
const item={uniqueName:'T4_MAIN_SWORD',isEquipable:true};
const date=new Date(Date.now()-60000).toISOString();
const reference = side=>({server:'europe',itemId:item.uniqueName,city:side==='sell'?'Caerleon':'Black Market',quality:1,side,source:'quote-history',price:side==='sell'?100:150});
const refs=new Map(['buy','sell'].map(side=>{const row=reference(side);return [marketSeriesKey(row),row];}));
const dependencies={
 './market.js':{fetchPrices:async(ids,cities,options)=>{optionsSeen=options;if(failPrices)throw Error('offline');return [
 {item_id:item.uniqueName,city:'Caerleon',quality:Number(options.qualities),sell_price_min:100,sell_price_min_date:date},
 {item_id:item.uniqueName,city:'Black Market',quality:Number(options.qualities),buy_price_max:150,buy_price_max_date:date},
 {item_id:item.uniqueName,city:'Martlock',quality:Number(options.qualities),buy_price_max:140,buy_price_max_date:date}];}},
 './long-term-quotes.js':{fetchLongTermIndex:async()=>{historyCalls++;if(failHistory)throw Error('offline');if(changeServer)server='west';return refs;}},
 './market-primitives.mjs':{marketSeriesKey},'./market-request.mjs':{aodpUrl,urlBatches},
 './settings.js':{getSettings:()=>({priceSource:'packets'}),localPriceHost:()=> 'http://localhost:3001',getServer:()=>({id:server,host:'https://example.test'})},'./flipper.mjs':{evaluateFlip}
};
let clockOffset=0, dateReads=0;
const clockStart=Date.now();
class TestDate extends Date {
 constructor(...args) { super(...(args.length ? args : [TestDate.now()+dateReads++])); }
 static now() { return clockStart+clockOffset; }
}
const context=vm.createContext({URLSearchParams,Date:TestDate});
const module=new vm.SourceTextModule(fs.readFileSync('content/js/core/flipper-data.js','utf8'),{context});
await module.link(specifier=>{const values=dependencies[specifier];assert.ok(values,specifier);return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});});
await module.evaluate();
const {scanFlips}=module.namespace;
const controller=new AbortController();
const config={reuseRecent:false,items:[item],sources:['Caerleon'],target:'Black Market',quality:'1',fees:{taxRate:.04},transport:0,maxAgeMs:1800000,signal:controller.signal};
const result=await scanFlips(config);assert.equal(result.rows.length,1);assert.equal(result.rows[0].net,44);assert.equal(result.rows[0].confidence,.85);assert.equal(optionsSeen.signal,controller.signal);
const allTargets=await scanFlips({...config,target:undefined,targets:['Caerleon','Martlock','Black Market']});assert.equal(allTargets.rows.length,2);assert.ok(allTargets.rows.every(row=>row.source!==row.target));
failHistory=true;const fallback=await scanFlips(config);assert.match(fallback.historyError,/arşiv/);assert.equal(fallback.rows[0].net,44);assert.equal(fallback.rows[0].confidence,.55);failHistory=false;
const calls=historyCalls;const quality2=await scanFlips({...config,quality:'2'});assert.equal(quality2.rows[0].quality,2);assert.equal(historyCalls,calls);assert.match(quality2.historyError,/kalite/);
failPrices=true;await assert.rejects(scanFlips(config),/Fiyat/);failPrices=false;
changeServer=true;await assert.rejects(scanFlips(config),/Sunucu/);server='europe';changeServer=false;
const cacheConfig={...config,reuseRecent:true};
const firstCached=await scanFlips(cacheConfig);
const cacheCalls=historyCalls;
failPrices=true;
const reused=await scanFlips({...cacheConfig,transport:10});
assert.equal(reused.reused,true);assert.equal(historyCalls,cacheCalls);assert.equal(reused.rows[0].net,34);assert.equal(reused.fetchedAt,firstCached.fetchedAt);
failPrices=false;
await scanFlips({...cacheConfig,reuseRecent:false});assert.ok(historyCalls>cacheCalls,'live refresh bypasses cache');
const beforeExpiry=historyCalls;
clockOffset=10*60*1000;
const expired=await scanFlips(cacheConfig);
assert.equal(expired.reused,false);assert.ok(historyCalls>beforeExpiry,'ten minute expiry requests new data');
clockOffset=0;
controller.abort();await assert.rejects(scanFlips(config),/abort/i);
console.log('PASS Flipper data: shared quote source, reference isolation, quality archive scope, offline, server change, cancellation');
