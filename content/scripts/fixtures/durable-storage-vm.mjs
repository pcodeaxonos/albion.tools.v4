// Pure calculation tests use an in-memory adapter; HTTP/SQLite behavior is exercised by data:test and app:ui:test.
export const durableStorageVmSource = `
export const durableStorage = localStorage;
export const PERSISTENCE_EVENT = 'albiontools:persistence';
export const readDurable = key => localStorage.getItem(key);
export const writeDurable = (key, value) => { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, String(value)); return true; };
export const durableKeys = () => [];
export async function saveDurableChanges(changes) { for (const [key, value] of changes) writeDurable(key, value); }
export async function flushDurableWrites() {}
export async function initDurableStorage() {}
export async function reloadDurableStorage() {}
export async function createDurableBackup() {}
export function persistenceStatus() { return { ready: true, pending: 0, error: null }; }
export function beginDurableOperation() {}
export function endDurableOperation() {}
`;
