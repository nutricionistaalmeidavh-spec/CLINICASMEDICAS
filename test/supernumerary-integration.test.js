const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const model = require('../js/core/supernumerary-model');
const migrations = require('../js/core/migrations');
const supernumeraryMigration = require('../js/core/supernumerary-migration');
supernumeraryMigration.install(migrations);

test('supranumerary model generates stable FDI labels and monotonic indexes', () => {
  assert.equal(model.validateReferenceTooth(11), 11);
  assert.equal(model.validateReferenceTooth('55'), 55);
  assert.throws(() => model.validateReferenceTooth(19), /FDI/i);
  assert.equal(model.makeLabel(11, 1), '11-SN1');
  assert.equal(model.makeLabel(55, 2), '55-SN2');
  assert.equal(model.nextIndex([{ dente_referencia_fdi: 11, indice: 1 }, { dente_referencia_fdi: 11, indice: 3 }], 11), 4);
});

test('schema migration v4 adds dental element identity without replacing legacy tooth columns', () => {
  const migration = migrations.MIGRATIONS.find(item => item.version === 4);
  assert.ok(migration, 'migration v4 must exist');
  assert.equal(migration.name, 'dental_supernumerary_elements');
  const sql = migration.sql.join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS odontograma_elementos/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS odontograma_elemento_eventos/i);
  assert.ok(Array.isArray(migration.columns));
  assert.deepEqual(
    migration.columns.map(item => `${item.table}.${item.column}`),
    [
      'odontograma_condicoes.elemento_dental_id',
      'plano_tratamento_itens.elemento_dental_id',
      'orcamento_odontologico_itens.elemento_dental_id',
      'orcamento_odontologico_itens.rotulo_dental'
    ]
  );
  const legacy = migrations.MIGRATIONS.find(item => item.version === 3).sql.join('\n');
  assert.match(legacy, /dente INTEGER/);
});

test('supernumerary schema columns are repaired idempotently after migration registration', () => {
  const calls = [];
  const columns = new Map([
    ['odontograma_condicoes', new Set(['id', 'dente'])],
    ['plano_tratamento_itens', new Set(['id', 'dente'])],
    ['orcamento_odontologico_itens', new Set(['id', 'dente'])]
  ]);
  const database = {
    query(sql) {
      const table = /PRAGMA table_info\(([^)]+)\)/i.exec(sql)?.[1];
      if (!table) return [];
      return [...(columns.get(table) || [])].map(name => ({ name }));
    },
    run(sql) {
      calls.push(sql);
      const match = /ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i.exec(sql);
      if (match) {
        if (!columns.has(match[1])) columns.set(match[1], new Set());
        columns.get(match[1]).add(match[2]);
      }
    }
  };
  const first = supernumeraryMigration.ensureColumns(database);
  const second = supernumeraryMigration.ensureColumns(database);
  assert.equal(first.added, 4);
  assert.equal(second.added, 0);
  assert.equal(calls.filter(sql => /^ALTER TABLE/i.test(sql)).length, 4);
});

test('new dental element tables are clinical and never shared through clinic LAN snapshots', () => {
  const isolation = require('../js/core/data-isolation');
  assert.equal(isolation.CLINICAL_TABLES.has('odontograma_elementos'), true);
  assert.equal(isolation.CLINICAL_TABLES.has('odontograma_elemento_eventos'), true);
  assert.equal(isolation.SHARED_MIRROR_TABLES.includes('odontograma_elementos'), false);
  assert.equal(isolation.SHARED_MIRROR_TABLES.includes('odontograma_elemento_eventos'), false);
});

test('professional database activation migrates existing clinical databases before exposing the session', () => {
  const router = read('js/core/database-isolation-router-safe.js');
  assert.match(router, /migrateProfessionalDatabase/);
  const loaded = router.indexOf('professionalDb = new sqlModule.Database(new Uint8Array(loaded.data))');
  const migrateAfterLoaded = router.indexOf('await migrateProfessionalDatabase()', loaded);
  const successAfterMigration = router.indexOf('professionalDatabase: true, created: false', loaded);
  assert.ok(loaded >= 0 && migrateAfterLoaded > loaded && successAfterMigration > migrateAfterLoaded);
});

test('renderer loads supernumerary modules before odontology integration', () => {
  const navigation = read('js/core/navigation.js');
  const modelIndex = navigation.indexOf("'js/core/supernumerary-model.js'");
  const migrationIndex = navigation.indexOf("'js/core/supernumerary-migration.js'");
  const dbIndex = navigation.indexOf("'js/domains/supernumerary-database.js'");
  const odontologyIndex = navigation.indexOf("'js/domains/odontology.js'");
  assert.ok(modelIndex >= 0);
  assert.ok(migrationIndex > modelIndex);
  assert.ok(dbIndex > migrationIndex);
  assert.ok(odontologyIndex > dbIndex);
});

test('odontology keeps FDI compatibility while persisting supernumerary identity through plan and budget', () => {
  const source = read('js/domains/odontology.js');
  assert.match(source, /elemento_dental_id/);
  assert.match(source, /rotulo_dental/);
  assert.match(source, /11-SN1|SN\$\{|makeLabel|labelForElement/);
  assert.match(source, /AND elemento_dental_id IS NULL/);
});

test('backup V3 remains SQLite-composite and does not enumerate dental tables', () => {
  const inventory = read('js/core/composite-backup-main.js');
  const service = read('js/core/composite-backup-service.js');
  assert.match(inventory, /clinical\.db\.enc/);
  assert.match(service, /professional\.database/);
  assert.doesNotMatch(inventory, /odontograma_elementos/);
  assert.doesNotMatch(service, /odontograma_elementos/);
});
