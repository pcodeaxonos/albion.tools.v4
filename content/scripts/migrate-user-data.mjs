import { fileURLToPath } from 'node:url';
import { openPersistentData } from './open-persistent-data.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { repository, opportunityEvidence } = await openPersistentData(root);
try {
    console.log(JSON.stringify({ ...repository.status(), storedKeys: repository.snapshot().entries.length,
        archivedImports: repository.db.prepare('SELECT COUNT(*) AS total FROM legacy_imports').get().total }, null, 2));
} finally { opportunityEvidence.close(); repository.close(); }
