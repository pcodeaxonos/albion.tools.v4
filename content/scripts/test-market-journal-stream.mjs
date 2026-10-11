import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {journalLines} from './quote-history-repository.mjs';
const dir=mkdtempSync(join(tmpdir(),'albion-journal-'));
try {
 const rows=[{sequence:1,text:'Şehir'.repeat(40000)},{sequence:2,text:'Makas'}, {sequence:3,text:'Son'}];
 const path=join(dir,'journal');writeFileSync(path, rows.map(JSON.stringify).join('\n'));
 assert.deepEqual([...journalLines(path)].map(JSON.parse),rows);
 assert.deepEqual([...journalLines(join(dir,'missing'))],[]);
 writeFileSync(path,'{"broken":');assert.throws(()=>[...journalLines(path)].map(JSON.parse));
 console.log('Journal stream: chunk boundaries, UTF-8, final line, missing and corrupt files passed.');
}finally{rmSync(dir,{recursive:true,force:true});}
