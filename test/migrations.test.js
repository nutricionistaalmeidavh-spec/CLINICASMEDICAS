const test = require('node:test');
const assert = require('node:assert/strict');
const migrations = require('../js/core/migrations');

test('migration registry is monotonic and current version matches last migration', () => {
  const versions = migrations.MIGRATIONS.map(m => m.version);
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b));
  assert.equal(new Set(versions).size, versions.length);
  assert.equal(migrations.CURRENT_SCHEMA_VERSION, versions.at(-1));
});

test('pending migrations only include versions above current', () => {
  assert.ok(migrations.getPendingMigrations(0).length > 0);
  assert.deepEqual(migrations.getPendingMigrations(migrations.CURRENT_SCHEMA_VERSION), []);
});
