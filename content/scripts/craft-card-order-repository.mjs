import { DatabaseSync } from 'node:sqlite';
import { validCraftCardOrder, validCraftFamily } from '../js/core/craft-card-order.mjs';

export class CraftCardOrderRepository {
    constructor(path) {
        this.ownsDatabase = typeof path === 'string';
        this.db = this.ownsDatabase ? new DatabaseSync(path) : path;
        this.db.exec('CREATE TABLE IF NOT EXISTS craft_card_order (family TEXT PRIMARY KEY, item_order TEXT NOT NULL)');
    }

    all() {
        return Object.fromEntries(this.db.prepare('SELECT family, item_order FROM craft_card_order').all()
            .map(row => [row.family, JSON.parse(row.item_order)]));
    }

    save(family, order, { onlyIfMissing = false } = {}) {
        if (!validCraftFamily(family) || !validCraftCardOrder(order)) {
            throw new Error('Geçersiz kart sırası');
        }
        const conflict = onlyIfMissing ? 'DO NOTHING' : 'DO UPDATE SET item_order = excluded.item_order';
        this.db.prepare(`INSERT INTO craft_card_order (family, item_order) VALUES (?, ?) ON CONFLICT(family) ${conflict}`)
            .run(family, JSON.stringify(order));
        return this.all()[family];
    }

    close() { if (this.ownsDatabase) this.db.close(); }
}
