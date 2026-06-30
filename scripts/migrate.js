require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../src/config/db');

async function migrate() {
    const dir = path.resolve(__dirname, '../../database/migrations');
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, checksum VARCHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

    for (const filename of files) {
        const sql = fs.readFileSync(path.join(dir, filename), 'utf8');
        const checksum = crypto.createHash('sha256').update(sql).digest('hex');
        const existing = await pool.query('SELECT checksum FROM schema_migrations WHERE filename=$1', [filename]);
        if (existing.rows[0]) {
            if (existing.rows[0].checksum !== checksum) throw new Error(`Migration changed after apply: ${filename}`);
            console.log(`Skipped: ${filename}`);
            continue;
        }
        await pool.query(sql);
        await pool.query('INSERT INTO schema_migrations (filename,checksum) VALUES ($1,$2)', [filename,checksum]);
        console.log(`Applied: ${filename}`);
    }
    console.log('Database migration completed');
}

migrate().catch((e) => { console.error('Migration failed:', e.message); process.exitCode = 1; }).finally(() => pool.end());
