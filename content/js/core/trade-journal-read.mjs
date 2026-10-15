import { readDurable, saveDurableChanges, reloadDurableStorage } from './durable-storage.mjs';
export async function journalReadKey(scope, group) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['europe', 'personal', scope, group.id])));
    return 'albiontools.v4.tradeJournalRead.' + [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2,'0')).join('');
}
export const journalIsUnread = group => readDurable(group.readKey) !== group.version;
let queue = Promise.resolve();
export function saveJournalRead(groups, read) {
    const changes = new Map(groups.map(g => [g.readKey, read ? g.version : null]));
    const job = queue.then(async () => { await reloadDurableStorage(); await saveDurableChanges(changes); });
    queue = job.catch(() => {});
    return job;
}
