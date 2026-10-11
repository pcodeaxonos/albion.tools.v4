import { readStorage, writeJsonStorage } from './storage.js';
export const OPPORTUNITY_JOURNAL_KEY = 'opp-assistant-v2';
export function readOpportunityJournal() {
    const raw = readStorage(OPPORTUNITY_JOURNAL_KEY);
    if (!raw) return { version: 2, watches: {}, feedback: [] };
    let saved;
    try { saved = JSON.parse(raw); } catch { return { version: 2, watches: {}, feedback: [], invalid: true }; }
    if (!saved || !saved.watches || typeof saved.watches !== 'object' || Array.isArray(saved.watches) || !Array.isArray(saved.feedback)
        || Object.values(saved.watches).some(w => !w || !w.first || !w.last || !Array.isArray(w.changes))) {
        return { version: 2, watches: {}, feedback: [], invalid: true };
    }
    return saved;
}
export function saveOpportunityJournal(next) {
    // Never replace an unreadable journal with an empty one.
    if (next.invalid) return false;
    return writeJsonStorage(OPPORTUNITY_JOURNAL_KEY, { ...next, version: 2 });
}
