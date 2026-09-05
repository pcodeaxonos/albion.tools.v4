/** Tablo tanımları — yeni tablo eklemek için buraya + data/*.json seed dosyası ekle. */
export const tables = {
    cities: {
        displayName: 'Şehirler',
        key: 'id',
        autoKey: true,
        seedUrl: './data/cities.json',
        columns: [
            { name: 'id', type: 'number', editable: false },
            { name: 'name', type: 'string' },
            { name: 'displayName', type: 'string', label: 'Display Name' },
            { name: 'marketApiName', type: 'string', label: 'Market API Name' },
            { name: 'cityType', type: 'enum', options: ['Royal', 'Caerleon', 'Brecilien'], label: 'City Type' },
            { name: 'isActive', type: 'boolean', label: 'Active' }
        ]
    },
    items: {
        displayName: 'Eşyalar',
        key: 'id',
        autoKey: false,
        seedUrl: './data/items.json',
        columns: [
            { name: 'id', type: 'number', editable: false },
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
        key: 'id',
        autoKey: true,
        seedUrl: './data/item-categories.json',
        columns: [
            { name: 'id', type: 'number', editable: false },
            { name: 'slug', type: 'string', label: 'Slug' },
            { name: 'level', type: 'enum', options: ['category', 'subcategory', 'subcategory2'], label: 'Level' },
            { name: 'parentSlug', type: 'string', label: 'Parent Slug' },
            { name: 'sortValue', type: 'number', label: 'Sort Value' }
        ]
    },
    locations: {
        displayName: 'Lokasyonlar',
        key: 'id',
        autoKey: true,
        seedUrl: './data/locations.json',
        columns: [
            { name: 'id', type: 'number', editable: false },
            { name: 'index', type: 'string', label: 'Index' },
            { name: 'uniqueName', type: 'string', label: 'Unique Name' },
            { name: 'displayName', type: 'string', label: 'Display Name' },
            { name: 'locationType', type: 'enum', options: ['City', 'Market', 'Bank', 'Island', 'Dungeon', 'Zone', 'Other'], label: 'Type' }
        ]
    },
    dailyBonuses: {
        displayName: 'Günlük Bonuslar',
        key: 'id',
        autoKey: true,
        userData: true,
        defaultSort: { column: 'date', direction: 'desc' },
        seedUrl: './data/daily-bonuses.json',
        columns: [
            { name: 'id', type: 'number', editable: false },
            { name: 'date', type: 'string', label: 'Date' },
            { name: 'slot1FamilyKey', type: 'string', label: 'Bonus 1' },
            { name: 'slot1Rate', type: 'enum', options: ['10', '20'], label: 'Rate 1' },
            { name: 'slot2FamilyKey', type: 'string', label: 'Bonus 2' },
            { name: 'slot2Rate', type: 'enum', options: ['10', '20'], label: 'Rate 2' }
        ]
    }
};

export function getTableNames() {
    return Object.keys(tables).sort();
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
