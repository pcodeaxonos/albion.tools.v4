import { TOOLS, getFrequentTools as getStaticFrequentTools } from './tools.js';

const STORAGE_KEY = 'albiontools.v4.usage';
const FREQUENT_LIMIT = 8;

let recordedThisLoad = false;

function currentFileName() {
    const raw = location.pathname.split('/').pop() || 'index.html';
    return raw.split('?')[0] || 'index.html';
}

function hrefFileName(href) {
    return href.split('/').pop().split('?')[0];
}

function liveTools() {
    return TOOLS.filter((tool) => tool.href);
}

function toolForCurrentPage() {
    const file = currentFileName();

    if (file === 'index.html' || file === '' || file === 'db.html') {
        return null;
    }

    return liveTools().find((tool) => hrefFileName(tool.href) === file) || null;
}

function readUsage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }

        return parsed;
    } catch {
        return {};
    }
}

function writeUsage(usage) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
    } catch {
        // Quota / private mode: ranking just stays at fallback.
    }
}

function normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const count = Number(entry.count);
    const last = Number(entry.last);

    if (!Number.isFinite(count) || count < 1 || !Number.isFinite(last)) {
        return null;
    }

    return { count, last };
}

function getFallbackFrequentTools() {
    const live = liveTools();
    const frequentLive = getStaticFrequentTools().filter((tool) => tool.href);
    const frequentIds = new Set(frequentLive.map((tool) => tool.id));
    const extraLive = live.filter((tool) => !frequentIds.has(tool.id));

    return [...frequentLive, ...extraLive].slice(0, FREQUENT_LIMIT);
}

export function recordCurrentToolVisit() {
    if (recordedThisLoad) {
        return;
    }

    recordedThisLoad = true;

    const tool = toolForCurrentPage();
    if (!tool) {
        return;
    }

    const usage = readUsage();
    const previous = normalizeEntry(usage[tool.id]) || { count: 0, last: 0 };

    usage[tool.id] = {
        count: previous.count + 1,
        last: Date.now()
    };

    writeUsage(usage);
}

export function getFrequentTools() {
    const usage = readUsage();
    const byId = new Map(liveTools().map((tool) => [tool.id, tool]));

    const ranked = Object.entries(usage)
        .map(([id, entry]) => {
            const tool = byId.get(id);
            const stats = normalizeEntry(entry);
            if (!tool || !stats) {
                return null;
            }
            return { tool, count: stats.count, last: stats.last };
        })
        .filter(Boolean)
        .sort((a, b) => b.count - a.count || b.last - a.last)
        .map((row) => row.tool);

    const rankedIds = new Set(ranked.map((tool) => tool.id));
    const fillers = getFallbackFrequentTools().filter((tool) => !rankedIds.has(tool.id));

    return [...ranked, ...fillers].slice(0, FREQUENT_LIMIT);
}
