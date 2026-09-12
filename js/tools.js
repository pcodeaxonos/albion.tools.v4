export const TOOLS = [
    {
        id: 'daily-bonus',
        title: 'Günlük Bonus',
        description: 'Her gün iki craft / refine bonusunu kaydedin. Ay içi tekrar sayıları hesaplanır.',
        icon: '✨',
        href: 'daily-bonus.html',
        addedAt: '2026-06-01',
        group: 'Kayıt',
        frequent: true
    },
    {
        id: 'farmin',
        title: 'Farming',
        description: 'Tarım verimi ve focus; Martlock, Thetford ve Brecilien.',
        icon: '🌱',
        href: 'farming.html',
        addedAt: '2026-09-05',
        group: 'Ada',
        frequent: true
    },
    {
        id: 'pasture',
        title: 'Pasture',
        description: 'Hayvan büyütme, kesme ve süt/yumurta kârı; yem ada veya piyasa.',
        icon: '🐑',
        href: 'pasture.html',
        addedAt: '2026-09-07',
        group: 'Ada',
        frequent: true
    },
    {
        id: 'island-planner',
        title: 'Ada Planlayıcı',
        description: 'Ada slotlarını gümüş/gün maksimize et; yem ada vs pazar fırsat maliyetiyle.',
        icon: '🏝️',
        href: 'island-planner.html',
        addedAt: '2026-09-07',
        group: 'Ada',
        frequent: true
    },
    {
        id: 'malzemeler',
        title: 'Şehir Makası',
        description: 'Plank, bar, binek: bir şehirden alıp diğerinde satmanın net kârı.',
        icon: '🪵',
        href: 'malzemeler.html',
        addedAt: '2026-09-06',
        group: 'Piyasa',
        frequent: true
    },
    {
        id: 'faction',
        title: 'Faction',
        description: 'Crest puan değeri ve faction cape maliyeti / kârı.',
        icon: '🛡️',
        href: 'faction.html',
        addedAt: '2026-08-23',
        group: 'Piyasa'
    },
    {
        id: 'refining',
        title: 'Refining',
        description: 'Ore / logs refine maliyeti, return rate ve kâr.',
        icon: '🔥',
        href: 'refining.html',
        addedAt: '2026-09-05',
        group: 'Üretim',
        frequent: true
    },
    {
        id: 'furniture',
        title: 'Furniture',
        description: 'Ada evi dekorasyonu: sandık, yatak ve masa craft maliyeti / kârı.',
        icon: '🪑',
        href: 'furniture.html',
        addedAt: '2026-09-06',
        group: 'Üretim',
        frequent: true
    },
    {
        id: 'house',
        title: 'House',
        description: 'Ev ve guild hall yükseltme: oyunun istediği T1 + block, isteğe bağlı ham eşdeğer.',
        icon: '🏠',
        href: 'house.html',
        addedAt: '2026-07-01',
        group: 'Üretim'
    },
    {
        id: 'ava-craft',
        title: 'Ava Craft',
        description: 'Avalonian tool craft maliyeti ve kârı.',
        icon: '⚡',
        href: 'ava-craft.html',
        addedAt: '2026-07-20',
        group: 'Üretim'
    },
    {
        id: 'carleon-craft',
        title: 'Caerleon Craft',
        description: 'Caerleon / Black Market craft maliyeti ve kârı.',
        icon: '🗡️',
        href: 'carleon-craft.html',
        addedAt: '2026-08-15',
        group: 'Üretim'
    },
    {
        id: 'enchantin',
        title: 'Enchanting',
        description: 'Rune, soul ve relic: kaçtan kaça çıkarmanın gümüş maliyeti.',
        icon: '🔮',
        href: 'enchanting.html',
        addedAt: '2026-08-23',
        group: 'Üretim'
    }
];

export const PAGES = [
    { id: 'home', title: 'Home', href: 'index.html' },
    { id: 'db', title: 'Veritabanı', href: 'db.html' },
    { id: 'settings', title: 'Ayarlar', href: 'settings.html' }
];

const NEW_LIVE_COUNT = 2;

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

const NEW_TOOL_IDS = new Set(
    TOOLS.map((tool, index) => ({ tool, recency: liveToolRecency(tool, index) }))
        .filter(({ tool }) => tool.href)
        .sort((a, b) => compareLiveRecency(a.recency, b.recency))
        .slice(0, NEW_LIVE_COUNT)
        .map(({ tool }) => tool.id)
);

export function isNewTool(tool) {
    return NEW_TOOL_IDS.has(tool.id);
}

export function getFrequentTools() {
    return TOOLS.filter((tool) => tool.frequent);
}

export function getToolGroups() {
    const groups = [];
    const byLabel = new Map();

    for (const tool of TOOLS) {
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
