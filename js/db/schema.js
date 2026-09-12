/** Tablo tanımları — yeni tablo: buraya + data/*.json seed. İlişkiler id FK ile. */

export const TABLE_GROUPS = [
    { id: 'game', label: 'Oyun datası' },
    { id: 'bonus', label: 'Bonus' },
    { id: 'farm', label: 'Farm / ada' },
    { id: 'craft', label: 'Craft / refine' },
    { id: 'build', label: 'Ev / enchant' },
    { id: 'app', label: 'Uygulama' },
    { id: 'lookup', label: 'Sözlük' },
    { id: 'user', label: 'Kullanıcı' }
];

const COL = {
    id: { name: 'id', type: 'number', editable: false },
    active: { name: 'isActive', type: 'boolean', label: 'Aktif' }
};

export const tables = {
    cities: {
        displayName: 'Şehirler',
        group: 'game',
        source: 'curated',
        description: 'Market şehirleri — diğer tablolar cityId ile bağlanır',
        key: 'id',
        autoKey: true,
        seedUrl: './data/cities.json',
        columns: [
            COL.id,
            { name: 'name', type: 'string' },
            { name: 'displayName', type: 'string', label: 'Display Name' },
            { name: 'marketApiName', type: 'string', label: 'Market API Name' },
            { name: 'shortCode', type: 'string', label: 'Kısa kod' },
            { name: 'cityType', type: 'enum', options: ['Royal', 'Caerleon', 'Brecilien'], label: 'City Type' },
            COL.active
        ]
    },
    items: {
        displayName: 'Eşyalar',
        group: 'game',
        source: 'api',
        description: 'ao-bin-dumps — isimler buradan; ITEM_LABELS yok',
        key: 'id',
        autoKey: false,
        seedUrl: './data/items.json',
        columns: [
            COL.id,
            { name: 'uniqueName', type: 'string', label: 'Unique Name' },
            { name: 'localizedName', type: 'string', label: 'Name' },
            { name: 'tier', type: 'number', label: 'Tier' },
            { name: 'enchantment', type: 'number', label: 'Enchantment' },
            { name: 'itemType', type: 'string', label: 'Item Type' },
            { name: 'isEquipable', type: 'boolean', label: 'Equipable' },
            { name: 'shopCategory', type: 'string', label: 'Kategori', match: 'exact', filter: 'shopCategory' },
            { name: 'shopSubCategory', type: 'string', label: 'Alt kategori', match: 'exact', filter: 'shopSubCategory' },
            { name: 'shopSubCategory2', type: 'string', label: 'Alt kategori 2', match: 'exact' }
        ]
    },
    itemCategories: {
        displayName: 'Eşya Kategorileri',
        group: 'game',
        source: 'api',
        description: 'ao-bin-dumps — npm run data:fetch',
        key: 'id',
        autoKey: true,
        seedUrl: './data/item-categories.json',
        columns: [
            COL.id,
            { name: 'slug', type: 'string', label: 'Slug' },
            { name: 'level', type: 'enum', options: ['category', 'subcategory', 'subcategory2'], label: 'Level' },
            { name: 'parentSlug', type: 'string', label: 'Parent Slug' },
            { name: 'sortValue', type: 'number', label: 'Sort Value' }
        ]
    },
    locations: {
        displayName: 'Lokasyonlar',
        group: 'game',
        source: 'api',
        description: 'ao-bin-dumps world — npm run data:fetch',
        key: 'id',
        autoKey: true,
        seedUrl: './data/locations.json',
        columns: [
            COL.id,
            { name: 'index', type: 'string', label: 'Index' },
            { name: 'uniqueName', type: 'string', label: 'Unique Name' },
            { name: 'displayName', type: 'string', label: 'Display Name' },
            { name: 'locationType', type: 'enum', options: ['City', 'Market', 'Bank', 'Island', 'Dungeon', 'Zone', 'Other'], label: 'Type' }
        ]
    },
    bonusFamilies: {
        displayName: 'Bonus aileleri',
        group: 'bonus',
        source: 'curated',
        description: 'Günlük craft/refine bonus — cityId → cities; malzemeler → bonusFamilyMaterials',
        key: 'id',
        autoKey: true,
        defaultSort: { column: 'sortValue', direction: 'asc' },
        seedUrl: './data/bonus-families.json',
        columns: [
            COL.id,
            { name: 'familyKey', type: 'string', label: 'Aile anahtarı' },
            { name: 'label', type: 'string', label: 'Ad' },
            { name: 'group', type: 'string', label: 'Grup' },
            { name: 'sortValue', type: 'number', label: 'Sıra' },
            { name: 'cityId', type: 'ref', refTable: 'cities', refLabel: 'displayName', label: 'Şehir' },
            { name: 'vendor', type: 'string', label: 'İstasyon' },
            { name: 'journal', type: 'string', label: 'Kitap' },
            { name: 'tree', type: 'string', label: 'Ağaç' },
            {
                name: 'materialKeyIds',
                type: 'refs',
                refTable: 'materialKeys',
                refLabel: 'label',
                label: 'Malzemeler',
                format: 'materials',
                junction: {
                    table: 'bonusFamilyMaterials',
                    parentKey: 'bonusFamilyId',
                    childKey: 'materialKeyId',
                    sortKey: 'sortValue'
                }
            },
            { name: 'variants', type: 'string', label: 'Tarifler', format: 'variants' },
            { name: 'notes', type: 'string', label: 'Not' },
            COL.active
        ]
    },
    bonusFamilyMaterials: {
        displayName: 'Bonus aile malzemeleri',
        group: 'bonus',
        source: 'curated',
        description: 'bonusFamilyId ↔ materialKeyId',
        key: 'id',
        autoKey: true,
        defaultSort: { column: 'sortValue', direction: 'asc' },
        seedUrl: './data/bonus-family-materials.json',
        columns: [
            COL.id,
            { name: 'bonusFamilyId', type: 'ref', refTable: 'bonusFamilies', refLabel: 'familyKey', label: 'Bonus aile' },
            { name: 'materialKeyId', type: 'ref', refTable: 'materialKeys', refLabel: 'key', label: 'Malzeme' },
            { name: 'sortValue', type: 'number', label: 'Sıra' }
        ]
    },
    yieldLadders: {
        displayName: 'Verim merdivenleri',
        group: 'farm',
        source: 'curated',
        description: 'Farm/hayvan seed-return merdivenleri',
        key: 'id',
        autoKey: true,
        seedUrl: './data/yield-ladders.json',
        columns: [
            COL.id,
            { name: 'code', type: 'string', label: 'Kod' },
            { name: 'label', type: 'string', label: 'Ad' }
        ]
    },
    yieldLadderSteps: {
        displayName: 'Verim basamakları',
        group: 'farm',
        source: 'curated',
        description: 'ladderId + tier → seedReturn / waterBonus',
        key: 'id',
        autoKey: true,
        defaultSort: { column: 'tier', direction: 'asc' },
        seedUrl: './data/yield-ladder-steps.json',
        columns: [
            COL.id,
            { name: 'ladderId', type: 'ref', refTable: 'yieldLadders', refLabel: 'code', label: 'Merdiven' },
            { name: 'tier', type: 'number', label: 'Tier' },
            { name: 'seedReturn', type: 'number', label: 'Seed return' },
            { name: 'waterBonus', type: 'number', label: 'Water bonus' }
        ]
    },
    plants: {
        displayName: 'Bitkiler',
        group: 'farm',
        source: 'curated',
        description: 'Crop/herb — farming + island ortak; item FK',
        key: 'id',
        autoKey: true,
        defaultSort: { column: 'tier', direction: 'asc' },
        seedUrl: './data/plants.json',
        columns: [
            COL.id,
            { name: 'key', type: 'string', label: 'Kod' },
            { name: 'kind', type: 'enum', options: ['crop', 'herb'], label: 'Tür' },
            { name: 'tier', type: 'number', label: 'Tier' },
            { name: 'vendorSilver', type: 'number', label: 'Vendor' },
            { name: 'seedItemId', type: 'number', label: 'Tohum item id' },
            { name: 'plantItemId', type: 'number', label: 'Ürün item id' },
            { name: 'ladderId', type: 'ref', refTable: 'yieldLadders', refLabel: 'code', label: 'Merdiven' },
            { name: 'plotType', type: 'enum', options: ['farm', 'herb'], label: 'Plot' },
            COL.active
        ]
    },
    plantBonusCities: {
        displayName: 'Bitki bonus şehirleri',
        group: 'farm',
        source: 'curated',
        description: 'plantId ↔ cityId',
        key: 'id',
        autoKey: true,
        seedUrl: './data/plant-bonus-cities.json',
        columns: [
            COL.id,
            { name: 'plantId', type: 'ref', refTable: 'plants', refLabel: 'key', label: 'Bitki' },
            { name: 'cityId', type: 'ref', refTable: 'cities', refLabel: 'displayName', label: 'Şehir' }
        ]
    },
    animals: {
        displayName: 'Hayvanlar',
        group: 'farm',
        source: 'curated',
        description: 'Livestock + mount — pasture/island ortak; feedQtyPasture vs Island sütunları',
        key: 'id',
        autoKey: true,
        defaultSort: { column: 'tier', direction: 'asc' },
        seedUrl: './data/animals.json',
        columns: [
            COL.id,
            { name: 'key', type: 'string', label: 'Kod' },
            { name: 'kind', type: 'enum', options: ['livestock', 'mount'], label: 'Tür' },
            { name: 'tier', type: 'number', label: 'Tier' },
            { name: 'vendorSilver', type: 'number', label: 'Vendor' },
            { name: 'focusCost', type: 'number', label: 'Focus' },
            { name: 'babyItemId', type: 'number', label: 'Yavru item id' },
            { name: 'grownItemId', type: 'number', label: 'Yetişkin item id' },
            { name: 'meatItemId', type: 'number', label: 'Et item id' },
            { name: 'productItemId', type: 'number', label: 'Ürün item id' },
            { name: 'feedPlantId', type: 'ref', refTable: 'plants', refLabel: 'key', label: 'Yem bitkisi' },
            { name: 'ladderId', type: 'ref', refTable: 'yieldLadders', refLabel: 'code', label: 'Merdiven' },
            { name: 'seedReturn', type: 'number', label: 'Seed return override' },
            { name: 'waterBonus', type: 'number', label: 'Water override' },
            { name: 'plotType', type: 'enum', options: ['pasture', 'kennel'], label: 'Plot' },
            { name: 'pens', type: 'number', label: 'Pens' },
            { name: 'baseHours', type: 'number', label: 'Saat' },
            { name: 'feedQtyPasture', type: 'number', label: 'Yem (pasture)' },
            { name: 'feedQtyIsland', type: 'number', label: 'Yem (island)' },
            { name: 'feedDiet', type: 'enum', options: ['plants', 'meat'], label: 'Diyet' },
            { name: 'feedFixed', type: 'boolean', label: 'Sabit yem' },
            COL.active
        ]
    },
    animalBonusCities: {
        displayName: 'Hayvan bonus şehirleri',
        group: 'farm',
        source: 'curated',
        description: 'Üretim bonusu (kasap/süt) — yem bonusu bitkiden gelir',
        key: 'id',
        autoKey: true,
        seedUrl: './data/animal-bonus-cities.json',
        columns: [
            COL.id,
            { name: 'animalId', type: 'ref', refTable: 'animals', refLabel: 'key', label: 'Hayvan' },
            { name: 'cityId', type: 'ref', refTable: 'cities', refLabel: 'displayName', label: 'Şehir' },
            { name: 'kind', type: 'enum', options: ['production'], label: 'Tür' }
        ]
    },
    economyConstants: {
        displayName: 'Ekonomi sabitleri',
        group: 'farm',
        source: 'curated',
        description: 'Yield, focus, saat, pen sayıları',
        key: 'id',
        autoKey: true,
        seedUrl: './data/economy-constants.json',
        columns: [
            COL.id,
            { name: 'key', type: 'string', label: 'Anahtar' },
            { name: 'value', type: 'string', label: 'Değer' },
            { name: 'label', type: 'string', label: 'Açıklama' }
        ]
    },
    islandPlots: {
        displayName: 'Ada plot sayıları',
        group: 'farm',
        source: 'curated',
        description: 'Ada seviyesi → plot adedi',
        key: 'id',
        autoKey: true,
        defaultSort: { column: 'level', direction: 'asc' },
        seedUrl: './data/island-plots.json',
        columns: [
            COL.id,
            { name: 'level', type: 'number', label: 'Seviye' },
            { name: 'plots', type: 'number', label: 'Plot' }
        ]
    },
    craftRecipes: {
        displayName: 'Craft tarifleri',
        group: 'craft',
        source: 'curated',
        description: 'Çıktı item + tool + bonus ailesi',
        key: 'id',
        autoKey: true,
        defaultSort: { column: 'sortValue', direction: 'asc' },
        seedUrl: './data/craft-recipes.json',
        columns: [
            COL.id,
            { name: 'code', type: 'string', label: 'Kod' },
            { name: 'tool', type: 'enum', options: ['furniture', 'ava', 'caerleon', 'faction'], label: 'Tool' },
            { name: 'kind', type: 'string', label: 'Tür' },
            { name: 'tier', type: 'number', label: 'Tier' },
            { name: 'outputItemId', type: 'number', label: 'Çıktı item id' },
            { name: 'bonusFamilyId', type: 'ref', refTable: 'bonusFamilies', refLabel: 'familyKey', label: 'Bonus aile' },
            { name: 'sortValue', type: 'number', label: 'Sıra' },
            COL.active
        ]
    },
    craftRecipeLines: {
        displayName: 'Craft tarifi satırları',
        group: 'craft',
        source: 'curated',
        description: 'Malzeme satırı — materialKey veya inputItem',
        key: 'id',
        autoKey: true,
        seedUrl: './data/craft-recipe-lines.json',
        columns: [
            COL.id,
            { name: 'recipeId', type: 'ref', refTable: 'craftRecipes', refLabel: 'code', label: 'Tarif' },
            { name: 'materialKeyId', type: 'ref', refTable: 'materialKeys', refLabel: 'key', label: 'Malzeme türü' },
            { name: 'inputItemId', type: 'number', label: 'Sabit item id' },
            { name: 'qty', type: 'number', label: 'Adet' },
            { name: 'appliesRr', type: 'boolean', label: 'RR alır' },
            { name: 'sortValue', type: 'number', label: 'Sıra' }
        ]
    },
    refineFamilies: {
        displayName: 'Refine aileleri',
        group: 'craft',
        source: 'curated',
        description: 'Ore/wood… → bonusFamilyId',
        key: 'id',
        autoKey: true,
        seedUrl: './data/refine-families.json',
        columns: [
            COL.id,
            { name: 'code', type: 'string', label: 'Kod' },
            { name: 'label', type: 'string', label: 'Ad' },
            { name: 'hamWord', type: 'string', label: 'Ham kelime' },
            { name: 'outWord', type: 'string', label: 'Çıktı kelime' },
            { name: 'rawStem', type: 'string', label: 'Ham stem' },
            { name: 'outStem', type: 'string', label: 'Çıktı stem' },
            { name: 'bonusFamilyId', type: 'ref', refTable: 'bonusFamilies', refLabel: 'familyKey', label: 'Bonus aile' }
        ]
    },
    refineTiers: {
        displayName: 'Refine tier miktarları',
        group: 'craft',
        source: 'curated',
        description: 'Tier → rawQty / lowerQty',
        key: 'id',
        autoKey: true,
        defaultSort: { column: 'tier', direction: 'asc' },
        seedUrl: './data/refine-tiers.json',
        columns: [
            COL.id,
            { name: 'tier', type: 'number', label: 'Tier' },
            { name: 'rawQty', type: 'number', label: 'Ham adet' },
            { name: 'lowerQty', type: 'number', label: 'Alt refine adet' }
        ]
    },
    factions: {
        displayName: 'Factionlar',
        group: 'craft',
        source: 'curated',
        description: 'Faction şehir + heart/baby/elite item',
        key: 'id',
        autoKey: true,
        seedUrl: './data/factions.json',
        columns: [
            COL.id,
            { name: 'cityId', type: 'ref', refTable: 'cities', refLabel: 'displayName', label: 'Şehir' },
            { name: 'stem', type: 'string', label: 'Stem' },
            { name: 'heartItemId', type: 'number', label: 'Heart item id' },
            { name: 'babyItemId', type: 'number', label: 'Baby item id' },
            { name: 'eliteItemId', type: 'number', label: 'Elite item id' },
            COL.active
        ]
    },
    enchantSlots: {
        displayName: 'Enchant slotları',
        group: 'build',
        source: 'curated',
        description: 'Helmet/armor/1H/2H rune adedi',
        key: 'id',
        autoKey: true,
        seedUrl: './data/enchant-slots.json',
        columns: [
            COL.id,
            { name: 'code', type: 'string', label: 'Kod' },
            { name: 'label', type: 'string', label: 'Ad' },
            { name: 'short', type: 'string', label: 'Kısa' },
            { name: 'qty', type: 'number', label: 'Adet' },
            { name: 'iconItemId', type: 'number', label: 'İkon item id' },
            { name: 'sortValue', type: 'number', label: 'Sıra' }
        ]
    },
    enchantSteps: {
        displayName: 'Enchant adımları',
        group: 'build',
        source: 'curated',
        description: '0→1 rune, 1→2 soul, 2→3 relic',
        key: 'id',
        autoKey: true,
        seedUrl: './data/enchant-steps.json',
        columns: [
            COL.id,
            { name: 'fromEnchant', type: 'number', label: 'From' },
            { name: 'toEnchant', type: 'number', label: 'To' },
            { name: 'kind', type: 'string', label: 'Tür' },
            { name: 'label', type: 'string', label: 'Ad' },
            { name: 'itemType', type: 'string', label: 'Item type' },
            { name: 'sortValue', type: 'number', label: 'Sıra' }
        ]
    },
    enchantPaths: {
        displayName: 'Enchant yolları',
        group: 'build',
        source: 'curated',
        description: 'Tablo hücre yolları (from→to)',
        key: 'id',
        autoKey: true,
        seedUrl: './data/enchant-paths.json',
        columns: [
            COL.id,
            { name: 'fromEnchant', type: 'number', label: 'From' },
            { name: 'toEnchant', type: 'number', label: 'To' },
            { name: 'tone', type: 'string', label: 'Tone' },
            { name: 'sortValue', type: 'number', label: 'Sıra' }
        ]
    },
    buildings: {
        displayName: 'Binalar',
        group: 'build',
        source: 'curated',
        description: 'House / guild hall',
        key: 'id',
        autoKey: true,
        seedUrl: './data/buildings.json',
        columns: [
            COL.id,
            { name: 'code', type: 'string', label: 'Kod' },
            { name: 'label', type: 'string', label: 'Ad' },
            { name: 'blocks', type: 'number', label: 'Block / tier' },
            { name: 'sortValue', type: 'number', label: 'Sıra' },
            COL.active
        ]
    },
    buildingTiers: {
        displayName: 'Bina tier maliyetleri',
        group: 'build',
        source: 'curated',
        description: 'buildingId + tier → wood/stone',
        key: 'id',
        autoKey: true,
        seedUrl: './data/building-tiers.json',
        columns: [
            COL.id,
            { name: 'buildingId', type: 'ref', refTable: 'buildings', refLabel: 'code', label: 'Bina' },
            { name: 'tier', type: 'number', label: 'Tier' },
            { name: 'wood', type: 'number', label: 'Wood' },
            { name: 'stone', type: 'number', label: 'Stone' }
        ]
    },
    materialGroups: {
        displayName: 'Malzeme grupları',
        group: 'lookup',
        source: 'curated',
        description: 'Şehir makası grupları (plank, mount…)',
        key: 'id',
        autoKey: true,
        seedUrl: './data/material-groups.json',
        columns: [
            COL.id,
            { name: 'code', type: 'string', label: 'Kod' },
            { name: 'label', type: 'string', label: 'Ad' },
            { name: 'family', type: 'string', label: 'Aile' },
            { name: 'stem', type: 'string', label: 'Stem' },
            { name: 'hasEnchant', type: 'boolean', label: 'Enchant' },
            { name: 'sortValue', type: 'number', label: 'Sıra' }
        ]
    },
    materialGroupTiers: {
        displayName: 'Malzeme grup tierleri',
        group: 'lookup',
        source: 'curated',
        description: 'groupId ↔ tier',
        key: 'id',
        autoKey: true,
        seedUrl: './data/material-group-tiers.json',
        columns: [
            COL.id,
            { name: 'groupId', type: 'ref', refTable: 'materialGroups', refLabel: 'code', label: 'Grup' },
            { name: 'tier', type: 'number', label: 'Tier' }
        ]
    },
    siteTools: {
        displayName: 'Araçlar',
        group: 'app',
        source: 'curated',
        description: 'Ana sayfa / nav tool listesi',
        key: 'id',
        autoKey: true,
        defaultSort: { column: 'sortValue', direction: 'asc' },
        seedUrl: './data/site-tools.json',
        columns: [
            COL.id,
            { name: 'code', type: 'string', label: 'Kod' },
            { name: 'title', type: 'string', label: 'Başlık' },
            { name: 'description', type: 'string', label: 'Açıklama' },
            { name: 'icon', type: 'string', label: 'İkon' },
            { name: 'href', type: 'string', label: 'Href' },
            { name: 'addedAt', type: 'string', label: 'Eklendi' },
            { name: 'groupLabel', type: 'string', label: 'Grup' },
            { name: 'frequent', type: 'boolean', label: 'Sık kullanılan' },
            { name: 'sortValue', type: 'number', label: 'Sıra' },
            COL.active
        ]
    },
    sitePages: {
        displayName: 'Sayfalar',
        group: 'app',
        source: 'curated',
        description: 'Nav sabit sayfalar (home, db, settings)',
        key: 'id',
        autoKey: true,
        seedUrl: './data/site-pages.json',
        columns: [
            COL.id,
            { name: 'code', type: 'string', label: 'Kod' },
            { name: 'title', type: 'string', label: 'Başlık' },
            { name: 'href', type: 'string', label: 'Href' },
            { name: 'sortValue', type: 'number', label: 'Sıra' }
        ]
    },
    priceServers: {
        displayName: 'Fiyat sunucuları',
        group: 'app',
        source: 'curated',
        description: 'AODP region hostları',
        key: 'id',
        autoKey: true,
        seedUrl: './data/price-servers.json',
        columns: [
            COL.id,
            { name: 'code', type: 'string', label: 'Kod' },
            { name: 'label', type: 'string', label: 'Ad' },
            { name: 'host', type: 'string', label: 'Host' },
            { name: 'sortValue', type: 'number', label: 'Sıra' }
        ]
    },
    priceSources: {
        displayName: 'Fiyat kaynakları',
        group: 'app',
        source: 'curated',
        description: 'API / paket kaynak seçenekleri',
        key: 'id',
        autoKey: true,
        seedUrl: './data/price-sources.json',
        columns: [
            COL.id,
            { name: 'code', type: 'string', label: 'Kod' },
            { name: 'label', type: 'string', label: 'Ad' },
            { name: 'sortValue', type: 'number', label: 'Sıra' }
        ]
    },
    materialKeys: {
        displayName: 'Malzeme anahtarları',
        group: 'lookup',
        source: 'curated',
        description: 'plank/bar… → stem + items.id',
        key: 'id',
        autoKey: true,
        defaultSort: { column: 'sortValue', direction: 'asc' },
        seedUrl: './data/material-keys.json',
        columns: [
            COL.id,
            { name: 'key', type: 'string', label: 'Anahtar' },
            { name: 'stem', type: 'string', label: 'Stem' },
            { name: 'itemId', type: 'number', label: 'Item id (ikon)' },
            { name: 'label', type: 'string', label: 'Ad' },
            { name: 'matGroup', type: 'enum', options: ['craft', 'refine', 'other'], label: 'Grup' },
            { name: 'sortValue', type: 'number', label: 'Sıra' },
            { name: 'appliesRr', type: 'boolean', label: 'RR alır' }
        ]
    },
    dailyBonuses: {
        displayName: 'Günlük Bonuslar',
        group: 'user',
        source: 'user',
        description: 'Kullanıcı günlük bonus kayıtları (familyKey → bonusFamilies)',
        key: 'id',
        autoKey: true,
        userData: true,
        defaultSort: { column: 'date', direction: 'desc' },
        seedUrl: './data/daily-bonuses.json',
        columns: [
            COL.id,
            { name: 'date', type: 'string', label: 'Date' },
            { name: 'slot1FamilyKey', type: 'string', label: 'Bonus 1' },
            { name: 'slot1Rate', type: 'enum', options: ['10', '20'], label: 'Rate 1' },
            { name: 'slot2FamilyKey', type: 'string', label: 'Bonus 2' },
            { name: 'slot2Rate', type: 'enum', options: ['10', '20'], label: 'Rate 2' }
        ]
    }
};

export function getTableNames() {
    return Object.keys(tables).sort((a, b) => {
        const ga = TABLE_GROUPS.findIndex((g) => g.id === tables[a].group);
        const gb = TABLE_GROUPS.findIndex((g) => g.id === tables[b].group);
        if (ga !== gb) {
            return ga - gb;
        }
        return tables[a].displayName.localeCompare(tables[b].displayName, 'tr');
    });
}

export function getTable(name) {
    return tables[name] ?? null;
}

export function getEditableColumns(table) {
    return table.columns.filter((col) => col.editable !== false && col.name !== table.key);
}

export function getDisplayColumns(table) {
    return table.columns;
}

export function getColumnLabel(column) {
    return column.label ?? column.name;
}

export function getSourceLabel(source) {
    if (source === 'api') return 'API';
    if (source === 'user') return 'Kullanıcı';
    return 'Manuel';
}
