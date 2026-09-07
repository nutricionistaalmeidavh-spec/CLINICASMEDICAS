const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const model = require('../js/core/supernumerary-model');
const migrations = require('../js/core/migrations');
const supernumeraryMigration = require('../js/core/supernumerary-migration');
supernumeraryMigration.install(migrations);
const supernumeraryDatabase = require('../js/domains/supernumerary-database');

function sqliteAdapter(database, professionalId = 2) {
  return {
    query(sql, params = []) {
      const stmt = database.prepare(sql);
      stmt.bind(params);
      const rows = [];
      try { while (stmt.step()) rows.push(stmt.getAsObject()); return rows; }
      finally { stmt.free(); }
    },
    run(sql, params = []) { database.run(sql, params); return database.getRowsModified(); },
    getLastId() { return Number(database.exec('SELECT last_insert_rowid() id')[0].values[0][0]); },
    session() { return { role: 'medico', professionalId }; }
  };
}

function columns(database, table) {
  const result = database.exec(`PRAGMA table_info(${table})`);
  return new Set((result?.[0]?.values || []).map(row => String(row[1])));
}

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

test('real legacy professional database at v3 migrates to v4 with additive dental columns', async () => {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  database.run('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL)');
  database.run('CREATE TABLE usuarios (id INTEGER PRIMARY KEY)');
  database.run('CREATE TABLE profissionais (id INTEGER PRIMARY KEY)');
  database.run('CREATE TABLE odontogramas (id INTEGER PRIMARY KEY, paciente_id INTEGER)');
  database.run('CREATE TABLE odontograma_condicoes (id INTEGER PRIMARY KEY, odontograma_id INTEGER, dente INTEGER, ativo INTEGER)');
  database.run('CREATE TABLE plano_tratamento_itens (id INTEGER PRIMARY KEY, dente INTEGER)');
  database.run('CREATE TABLE orcamento_odontologico_itens (id INTEGER PRIMARY KEY, dente INTEGER)');
  database.run("INSERT INTO schema_migrations(version,name) VALUES (3,'block_b_odontology')");
  database.run('PRAGMA user_version=3');

  const result = await migrations.runMigrations({ database });
  assert.deepEqual(result.applied, [4]);
  assert.equal(Number(database.exec('PRAGMA user_version')[0].values[0][0]), 4);
  assert.equal(database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='odontograma_elementos'")[0].values[0][0], 'odontograma_elementos');
  assert.equal(columns(database, 'odontograma_condicoes').has('elemento_dental_id'), true);
  assert.equal(columns(database, 'plano_tratamento_itens').has('elemento_dental_id'), true);
  assert.equal(columns(database, 'orcamento_odontologico_itens').has('elemento_dental_id'), true);
  assert.equal(columns(database, 'orcamento_odontologico_itens').has('rotulo_dental'), true);
  database.close();
});

test('supernumerary schema columns are repaired idempotently after migration registration', () => {
  const calls = [];
  const schema = new Map([
    ['odontograma_condicoes', new Set(['id', 'dente'])],
    ['plano_tratamento_itens', new Set(['id', 'dente'])],
    ['orcamento_odontologico_itens', new Set(['id', 'dente'])]
  ]);
  const database = {
    query(sql) {
      const table = /PRAGMA table_info\(([^)]+)\)/i.exec(sql)?.[1];
      if (!table) return [];
      return [...(schema.get(table) || [])].map(name => ({ name }));
    },
    run(sql) {
      calls.push(sql);
      const match = /ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i.exec(sql);
      if (match) {
        if (!schema.has(match[1])) schema.set(match[1], new Set());
        schema.get(match[1]).add(match[2]);
      }
    }
  };
  const first = supernumeraryMigration.ensureColumns(database);
  const second = supernumeraryMigration.ensureColumns(database);
  assert.equal(first.added, 4);
  assert.equal(second.added, 0);
  assert.equal(calls.filter(sql => /^ALTER TABLE/i.test(sql)).length, 4);
});

test('supernumerary database persists SN1/SN2, status history and element-scoped conditions', async () => {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  database.run('CREATE TABLE usuarios (id INTEGER PRIMARY KEY)');
  database.run('CREATE TABLE profissionais (id INTEGER PRIMARY KEY)');
  database.run('CREATE TABLE odontogramas (id INTEGER PRIMARY KEY, paciente_id INTEGER)');
  database.run(`CREATE TABLE odontograma_condicoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, odontograma_id INTEGER NOT NULL, dente INTEGER NOT NULL,
    face TEXT, condicao TEXT NOT NULL, observacao TEXT, ativo INTEGER DEFAULT 1, registrado_por INTEGER,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP, atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  database.run('CREATE TABLE plano_tratamento_itens (id INTEGER PRIMARY KEY, dente INTEGER)');
  database.run('CREATE TABLE orcamento_odontologico_itens (id INTEGER PRIMARY KEY, dente INTEGER)');
  database.run('INSERT INTO usuarios(id) VALUES (7)');
  database.run('INSERT INTO profissionais(id) VALUES (2)');
  database.run('INSERT INTO odontogramas(id,paciente_id) VALUES (10,99)');
  supernumeraryMigration.MIGRATION.sql.forEach(sql => database.run(sql));
  supernumeraryMigration.ensureColumns(database);

  const api = supernumeraryDatabase.createApi({ DB: sqliteAdapter(database), model, currentUser: () => ({ id: 7 }) });
  const first = api.create({ odontogramId: 10, referenceTooth: 11 });
  const second = api.create({ odontogramId: 10, referenceTooth: 11 });
  assert.equal(first.label, '11-SN1');
  assert.equal(second.label, '11-SN2');
  assert.equal(api.list(10).length, 2);

  api.setStatus(first.id, 'extraido');
  assert.equal(api.get(first.id).status, 'extraido');
  const history = api.history(first.id);
  assert.equal(history.at(-1).status_novo, 'extraido');

  api.addCondition(first.id, { condition: 'carie', face: 'vestibular', observation: 'Teste' });
  const conditions = api.conditions(first.id);
  assert.equal(conditions.length, 1);
  assert.equal(Number(conditions[0].elemento_dental_id), first.id);
  assert.equal(Number(conditions[0].dente), 11);
  database.close();
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

test('odontology keeps FDI compatibility and snapshots supernumerary identity through plan, budget and charge', () => {
  const source = read('js/domains/odontology.js');
  assert.match(source, /AND elemento_dental_id IS NULL/);
  assert.match(source, /plano_tratamento_itens \(plano_id,procedimento_id,profissional_id,descricao,dente,face,elemento_dental_id/);
  assert.match(source, /orcamento_odontologico_itens \(orcamento_id,plano_item_id,descricao,dente,face,elemento_dental_id,rotulo_dental/);
  assert.match(source, /budgetItem\.rotulo_dental \|\| dentalLabelForItem\(item\)/);
  assert.match(source, /labelForElement/);
});

test('backup V3 remains SQLite-composite and does not enumerate dental tables', () => {
  const inventory = read('js/core/composite-backup-main.js');
  const service = read('js/core/composite-backup-service.js');
  assert.match(inventory, /clinical\.db\.enc/);
  assert.match(service, /professional\.database/);
  assert.doesNotMatch(inventory, /odontograma_elementos/);
  assert.doesNotMatch(service, /odontograma_elementos/);
});
