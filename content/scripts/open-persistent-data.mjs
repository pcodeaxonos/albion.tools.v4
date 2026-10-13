import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UserDataRepository } from './user-data-repository.mjs';
import { CraftCardOrderRepository } from './craft-card-order-repository.mjs';
import { OpportunityEvidenceRepository } from './opportunity-evidence-repository.mjs';
import { refreshGeneratedCatalogs } from './generated-catalogs.mjs';
import { USER_DATA_FILE, USER_DATA_BACKUP_DIRECTORY, LEGACY_DATA_FILE, LEGACY_DATA_KIND, LEGACY_DATA_VERSION } from '../js/core/persistence-config.mjs';
import { LEGACY_CRAFT_CARD_ORDER_KEY, validCraftCardOrder, validCraftFamily } from '../js/core/craft-card-order.mjs';

export async function openPersistentData(root, { refreshCatalogs = true } = {}) {
    let legacy = null;
    try {
        legacy = JSON.parse(readFileSync(join(root, LEGACY_DATA_FILE), 'utf8'));
        if (legacy?.kind !== LEGACY_DATA_KIND || legacy.version !== LEGACY_DATA_VERSION || !legacy.data || typeof legacy.data !== 'object' || Array.isArray(legacy.data)) {
            throw new Error('Eski kullanıcı veri dosyası geçersiz; aktarım durduruldu.');
        }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const repository = new UserDataRepository(process.env.ALBION_DATA_PATH || join(root, USER_DATA_FILE), {
        backupDirectory: process.env.ALBION_BACKUP_DIR || join(root, USER_DATA_BACKUP_DIRECTORY)
    });
    let opportunityEvidence;
    try {
        // Acquire the legacy service lock before marking any migration complete.
        opportunityEvidence = new OpportunityEvidenceRepository(join(root, '.opportunity-evidence.jsonl'), { database: repository.db });
        repository.importOnce('legacy-hub-json', legacy?.data || {});
        if (refreshCatalogs) await refreshGeneratedCatalogs(repository, root);
        const craftCardOrders = new CraftCardOrderRepository(repository.db);
        const raw = legacy?.data?.[LEGACY_CRAFT_CARD_ORDER_KEY];
        const oldOrders = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
        for (const [family, order] of Object.entries(oldOrders)) {
            if (validCraftFamily(family) && validCraftCardOrder(order)) craftCardOrders.save(family, order, { onlyIfMissing: true });
        }
        await repository.createBackup();
        return { repository, craftCardOrders, opportunityEvidence };
    } catch (error) { opportunityEvidence?.close(); repository.close(); throw error; }
}
