import { copyFileSync, constants } from 'node:fs';
export const ARCHIVE_BACKUP_SUFFIX = '.pre-observation-v2.bak';
/** Write-once backup before additive metadata/checkpoint changes; original bytes remain rollbackable. */
export function preserveArchive(path, suffix = ARCHIVE_BACKUP_SUFFIX) {
    try { copyFileSync(path, `${path}${suffix}`, constants.COPYFILE_EXCL); }
    catch (error) { if (!['ENOENT', 'EEXIST'].includes(error.code)) throw error; }
}
