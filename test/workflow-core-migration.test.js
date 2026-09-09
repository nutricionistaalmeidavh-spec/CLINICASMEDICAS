const test = require('node:test');
const assert = require('node:assert/strict');
const migrations = require('../js/core/migrations');
const supernumerary = require('../js/core/supernumerary-migration');
const workflowMigration = require('../js/core/workflow-core-migration');

test('Workflow Core installs after the existing modular dental migration', () => {
  supernumerary.install(migrations);
  workflowMigration.install(migrations);

  const dental = migrations.MIGRATIONS.find(item => item.version === 4);
  const migration = migrations.MIGRATIONS.find(item => item.version === workflowMigration.VERSION);
  const sql = migration.sql.join('\n');

  assert.equal(dental.name, 'dental_supernumerary_elements');
  assert.equal(migration.version, 5);
  assert.equal(migrations.MIGRATIONS.at(-1).version, 5);
  assert.match(migration.name, /workflow/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS workflow_domain_events/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS workflow_effects/i);
  assert.match(sql, /PRIMARY KEY \(event_id, effect_key\)/i);
  assert.match(sql, /idx_workflow_domain_events_pending/i);
  assert.match(sql, /idx_workflow_domain_events_aggregate/i);
});
