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
        description: 'Hayvan yetiştirme: focus, yavru ihtimali ve şehir varyantları.',
        icon: '🐑',
        group: 'Ada',
        frequent: true
    },
    {
        id: 'horse',
        title: 'Horse',
        description: 'At yetiştirme süreleri, focus ve maliyet.',
        icon: '🐴',
        group: 'Ada',
        frequent: true
    },
    {
        id: 'results',
        title: 'Results',
        description: 'Farming sonuç ve verim karşılaştırması.',
        icon: '📈',
        group: 'Ada'
    },
    {
        id: 'data',
        title: 'Şehir Fiyatları',
        description: 'Şehirler arası sell / buy fiyatları ve değişim geçmişi.',
        icon: '📊',
        group: 'Piyasa'
    },
    {
        id: 'malzemeler',
        title: 'Malzemeler',
        description: 'Şehir bazlı plank / block makas, harcama ve net kâr.',
        icon: '🪵',
        group: 'Piyasa',
        frequent: true
    },
    {
        id: 'refined',
        title: 'Refined',
        description: 'İşlenmiş malzeme fiyatları: plank, steel, leather, cloth.',
        icon: '🧱',
        group: 'Piyasa'
    },
    {
        id: 'journal',
        title: 'Journal',
        description: 'Boş ve dolu journal alım-satım karşılaştırması.',
        icon: '📓',
        group: 'Piyasa'
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
        id: 'ore',
        title: 'Ore',
        description: 'Cevher ve bar stok, ihtiyaç ve maliyet hesabı.',
        icon: '⛏️',
        group: 'Üretim'
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
        id: 'craftin',
        title: 'Crafting',
        description: 'Genel craft malzeme maliyeti ve return rate.',
        icon: '⚒️',
        group: 'Üretim'
    },
    {
        id: 'chesting',
        title: 'Chesting',
        description: 'Şehir ve malzemeye göre sandık craft maliyeti.',
        icon: '📦',
        group: 'Üretim'
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
