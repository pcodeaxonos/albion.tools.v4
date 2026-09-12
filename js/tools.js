import { getSiteTools, getSitePages, getNewToolLiveCount } from './catalog.js';

export function listTools() {
    return getSiteTools();
}

export function listPages() {
    return getSitePages();
}

/** Compat — prefer listTools() after initStore */
export const TOOLS = {
    [Symbol.iterator]: function* () { yield* listTools(); },
    filter(...args) { return listTools().filter(...args); },
    map(...args) { return listTools().map(...args); },
    find(...args) { return listTools().find(...args); },
    some(...args) { return listTools().some(...args); },
    get length() { return listTools().length; }
};

export const PAGES = {
    [Symbol.iterator]: function* () { yield* listPages(); },
    map(...args) { return listPages().map(...args); },
    filter(...args) { return listPages().filter(...args); },
    get length() { return listPages().length; }
};

function liveToolRecency(tool, index) {
    if (tool.addedAt) {
        return { dated: 1, date: tool.addedAt, index };
    }
    return { dated: 0, date: '', index };
}

function compareLiveRecency(a, b) {
    if (a.dated !== b.dated) {
        return b.dated - a.dated;
    }
    if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
    }
    return b.index - a.index;
}

function newToolIds() {
    const count = getNewToolLiveCount();
    return new Set(
        listTools()
            .map((tool, index) => ({ tool, recency: liveToolRecency(tool, index) }))
            .filter(({ tool }) => tool.href)
            .sort((a, b) => compareLiveRecency(a.recency, b.recency))
            .slice(0, count)
            .map(({ tool }) => tool.id)
    );
}

export function isNewTool(tool) {
    return newToolIds().has(tool.id);
}

export function getFrequentTools() {
    return listTools().filter((tool) => tool.frequent);
}

export function getToolGroups() {
    const groups = [];
    const byLabel = new Map();

    for (const tool of listTools()) {
        let group = byLabel.get(tool.group);
        if (!group) {
            group = { label: tool.group, tools: [] };
            byLabel.set(tool.group, group);
            groups.push(group);
        }
        group.tools.push(tool);
    }

    return groups;
}
