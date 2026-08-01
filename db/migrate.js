require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');

(async () => {
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const migrations = [
      ['001_initial_schema', 'schema.sql'],
      ['002_announcements', '002_announcements.sql'],
      ['003_announcement_images', '003_announcement_images.sql'],
      ['004_email_password_auth', '004_email_password_auth.sql'],
    ];
    for (const [name, file] of migrations) {
      const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]);
      if (applied.rowCount) continue;
      await pool.query('BEGIN');
      await pool.query(fs.readFileSync(path.join(__dirname, file), 'utf8'));
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await pool.query('COMMIT');
      console.log(`${name} applied.`);
    }
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { await pool.end(); }
})().catch(error => { console.error(error.message); process.exit(1); });
