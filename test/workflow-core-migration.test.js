const test = require('node:test');
const assert = require('node:assert/strict');
const migrations = require('../js/core/migrations');

test('latest migration installs reusable Workflow Core outbox and effect tables', () => {
  const migration = migrations.MIGRATIONS.at(-1);
  const sql = migration.sql.join('\n');
  assert.ok(migration.version >= 4);
  assert.match(migration.name, /workflow/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS workflow_domain_events/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS workflow_effects/i);
  assert.match(sql, /PRIMARY KEY \(event_id, effect_key\)/i);
  assert.match(sql, /idx_workflow_domain_events_pending/i);
  assert.match(sql, /idx_workflow_domain_events_aggregate/i);
});
