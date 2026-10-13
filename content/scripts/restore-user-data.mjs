import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';

// Always restore to a new file. Never replace the live database or erase the recovery source.
const [sourceArg, targetArg] = process.argv.slice(2);
if (!sourceArg || !targetArg) throw new Error('Kullanım: node content/scripts/restore-user-data.mjs YEDEK.sqlite YENI.sqlite');
const source = resolve(sourceArg), target = resolve(targetArg);
if (source === target || existsSync(target)) throw new Error('Hedef yeni bir dosya olmalı; mevcut veritabanı üzerine yazılmaz.');
const db = new DatabaseSync(source, { readOnly: true });
try {
    if (Object.values(db.prepare('PRAGMA quick_check').get())[0] !== 'ok') throw new Error('Yedek bütünlük kontrolü başarısız.');
    if (!db.prepare("SELECT name FROM sqlite_master WHERE name = 'user_data'").get()) throw new Error('Bu dosya uygulama veritabanı değil.');
    closeSync(openSync(target, 'wx'));
    await backup(db, target);
    console.log(`Geri yüklenen veritabanı: ${target}\nHub kapalıyken ALBION_DATA_PATH değişkenini bu dosyaya ayarlayıp hub’ı başlatın.`);
} finally { db.close(); }
