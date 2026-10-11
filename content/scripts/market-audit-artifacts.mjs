import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
/** Diagnostic artifacts may be losslessly compressed; production archives are never written here. */
export function readAuditFile(path, encoding) {
 const bytes=existsSync(path)?readFileSync(path):gunzipSync(readFileSync(`${path}.gz`));
 return encoding?bytes.toString(encoding):bytes;
}
export function writeAuditJson(path,data,{compressed=false}={}) {
 const text=JSON.stringify(data,null,2);
 writeFileSync(compressed?`${path}.gz`:path,compressed?gzipSync(text):text);
}
