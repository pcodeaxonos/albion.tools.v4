import { copyFileSync, constants } from 'node:fs';
/** Write-once backup before additive metadata/checkpoint changes; original bytes remain rollbackable. */
export function preserveArchive(path) {
    try { copyFileSync(path, `${path}.pre-observation-v2.bak`, constants.COPYFILE_EXCL); }
    catch (error) { if (!['ENOENT', 'EEXIST'].includes(error.code)) throw error; }
}
