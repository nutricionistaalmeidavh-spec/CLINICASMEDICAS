const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');
const migrations = require('../js/core/migrations');

test('runs migrations once, records schema version and is idempotent', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const backups = [];
  const audits = [];
  const first = await migrations.runMigrations({
    database: db,
    beforeMigrate: async meta => { backups.push(meta); return { ok: true }; },
    audit: async event => audits.push(event)
  });
  assert.equal(first.from, 0);
  assert.equal(first.to, migrations.CURRENT_SCHEMA_VERSION);
  assert.deepEqual(first.applied, [1]);
  assert.equal(backups.length, 1);
  assert.equal(audits.length, 1);
  const migrationRows = db.exec('SELECT version,name FROM schema_migrations');
  assert.equal(migrationRows[0].values.length, 1);
  assert.equal(migrations.readUserVersion(db), migrations.CURRENT_SCHEMA_VERSION);

  const second = await migrations.runMigrations({ database: db });
  assert.deepEqual(second.applied, []);
  assert.equal(db.exec('SELECT COUNT(*) FROM schema_migrations')[0].values[0][0], 1);
  db.close();
});
