// The sole authored page registry. `id` is the stable application identity;
// source, public path, display metadata, and navigation are intentionally separate.
const page = (id, source, path, title, nav) => ({ id, kind: 'page', source, path, title, nav });
const admin = (id, source, path, title, nav) => ({ id, kind: 'admin', source, path, title, nav });
const tool = (id, source, path, title, description, icon, addedAt, nav, frequent = false) => ({ id, kind: 'tool', source, path, title, description, icon, addedAt, nav, frequent });

export const SITE_ROUTES = [
    page('home', 'index.html', '', 'Home', { label: 'Home', group: 'pages', order: 10, visible: true }),
    admin('db', 'admin/db/index.html', 'admin/db', 'Veritabanı', { label: 'Veritabanı', group: 'pages', order: 20, visible: true }),
    admin('settings', 'admin/settings/index.html', 'admin/settings', 'Ayarlar', { label: 'Ayarlar', group: 'pages', order: 30, visible: true }),
    tool('daily-bonus', 'tools/daily-bonus/index.html', 'tools/daily-bonus', 'Günlük Bonus', 'Her gün iki craft / refine bonusunu kaydedin. Ay içi tekrar sayıları hesaplanır.', '✨', '2026-06-01', { label: 'Günlük Bonus', group: 'Kayıt', order: 10, visible: true }, true),
    tool('island-yields', 'tools/island-yields/index.html', 'tools/island-yields', 'Ada Çıktı', 'Ada hasat yield’lerini kaydedin; ortalamalar farming ve planlayıcıda kullanılır.', '📊', '2026-09-13', { label: 'Ada Çıktı', group: 'Kayıt', order: 15, visible: true }, true),
    tool('farming', 'tools/farming/index.html', 'tools/farming', 'Farming', 'Tarım verimi ve focus; Martlock, Thetford ve Brecilien.', '🌱', '2026-09-05', { label: 'Farming', group: 'Ada', order: 20, visible: true }, true),
    tool('pasture', 'tools/pasture/index.html', 'tools/pasture', 'Pasture', 'Hayvan büyütme, kesme ve süt/yumurta kârı; yem ada veya piyasa.', '🐑', '2026-09-07', { label: 'Pasture', group: 'Ada', order: 30, visible: true }, true),
    tool('island-planner', 'tools/island-planner/index.html', 'tools/island-planner', 'Ada Planlayıcı', 'Ham gümüş/gün; sade / zincir / karışık; faction kilit.', '🏝️', '2026-09-07', { label: 'Ada Planlayıcı', group: 'Ada', order: 40, visible: true }, true),
    tool('island-planner-v2', 'tools/island-planner-v2/index.html', 'tools/island-planner-v2', 'Ada Planlayıcı V2', 'Slot tabanlı ada planı; V1 bağımsız olarak korunur.', '🏝️', '2026-09-20', { label: 'Ada Planlayıcı V2', group: 'Ada', order: 41, visible: true }),
    tool('trades', 'tools/trades/index.html', 'tools/trades', 'Trade Dashboard', 'SAT trade geçmişi: filtre, özet ve canlı akış.', '📈', '2026-09-23', { label: 'Trade Dashboard', group: 'Piyasa', order: 45, visible: true }, true),
    tool('malzemeler', 'tools/malzemeler/index.html', 'tools/malzemeler', 'Şehir Makası', 'Plank, bar, binek: bir şehirden alıp diğerinde satmanın net kârı.', '🪵', '2026-09-06', { label: 'Şehir Makası', group: 'Piyasa', order: 50, visible: true }, true),
    tool('faction', 'tools/faction/index.html', 'tools/faction', 'Faction', 'Crest puan değeri ve faction cape maliyeti / kârı.', '🛡️', '2026-08-23', { label: 'Faction', group: 'Piyasa', order: 60, visible: true }),
    tool('refining', 'tools/refining/index.html', 'tools/refining', 'Refining', 'Ore / logs refine maliyeti, return rate ve kâr.', '🔥', '2026-09-05', { label: 'Refining', group: 'Üretim', order: 70, visible: true }, true),
    tool('furniture', 'tools/furniture/index.html', 'tools/furniture', 'Furniture', 'Ada evi dekorasyonu: sandık, yatak ve masa craft maliyeti / kârı.', '🪑', '2026-09-06', { label: 'Furniture', group: 'Üretim', order: 80, visible: true }, true),
    tool('house', 'tools/house/index.html', 'tools/house', 'House', 'Ev ve guild hall yükseltme: oyunun istediği T1 + block, isteğe bağlı ham eşdeğer.', '🏠', '2026-07-01', { label: 'House', group: 'Üretim', order: 90, visible: true }),
    tool('ava-craft', 'tools/ava-craft/index.html', 'tools/ava-craft', 'Ava Craft', 'Avalonian tool craft maliyeti ve kârı.', '⚡', '2026-07-20', { label: 'Ava Craft', group: 'Üretim', order: 100, visible: true }),
    tool('carleon-craft', 'tools/carleon-craft/index.html', 'tools/carleon-craft', 'Caerleon Craft', 'Caerleon / Black Market craft maliyeti ve kârı.', '🗡️', '2026-08-15', { label: 'Caerleon Craft', group: 'Üretim', order: 110, visible: true }),
    tool('royal-craft', 'tools/royal-craft/index.html', 'tools/royal-craft', 'Royal Crafting', 'Royal giyilebilir: SET + sigil craft, enchant ve şehir kârı.', '👑', '2026-09-13', { label: 'Royal Crafting', group: 'Üretim', order: 115, visible: true }, true),
    tool('enchanting', 'tools/enchanting/index.html', 'tools/enchanting', 'Enchanting', 'Rune, soul ve relic: kaçtan kaça çıkarmanın gümüş maliyeti.', '🔮', '2026-08-23', { label: 'Enchanting', group: 'Üretim', order: 120, visible: true })
];
