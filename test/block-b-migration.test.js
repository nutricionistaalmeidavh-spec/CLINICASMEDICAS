const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');
const migrations = require('../js/core/migrations');

const EXPECTED_TABLES = [
  'odontogramas',
  'odontograma_condicoes',
  'planos_tratamento',
  'plano_tratamento_itens',
  'orcamentos_odontologicos',
  'orcamento_odontologico_itens'
];

function createLegacyClinicalTables(db) {
  db.run('CREATE TABLE pacientes (id INTEGER PRIMARY KEY, nome TEXT)');
  db.run('CREATE TABLE profissionais (id INTEGER PRIMARY KEY, nome TEXT)');
  db.run('CREATE TABLE procedimentos (id INTEGER PRIMARY KEY, nome TEXT, valor_particular REAL)');
  db.run('CREATE TABLE agenda (id INTEGER PRIMARY KEY, paciente_id INTEGER, profissional_id INTEGER, procedimento_id INTEGER, data TEXT, hora TEXT, status TEXT)');
  db.run('CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT)');
  db.run('CREATE TABLE caixa (id INTEGER PRIMARY KEY, tipo TEXT, descricao TEXT, valor REAL, forma_pagamento TEXT, data TEXT, observacao TEXT)');
  db.run('CREATE TABLE repasses (id INTEGER PRIMARY KEY, profissional_id INTEGER, periodo_inicio TEXT, periodo_fim TEXT, valor_bruto REAL, percentual REAL, valor_repasse REAL, status TEXT)');
}

test('Block B migration creates additive odontology schema and advances version', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  createLegacyClinicalTables(db);
  const result = await migrations.runMigrations({ database: db });
  assert.equal(result.to, migrations.CURRENT_SCHEMA_VERSION);
  assert.ok(result.applied.includes(3));

  const existing = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.flat();
  for (const table of EXPECTED_TABLES) assert.ok(existing.includes(table), `${table} must exist`);

  const version = migrations.readUserVersion(db);
  assert.equal(version, migrations.CURRENT_SCHEMA_VERSION);
  db.close();
});

test('Block B migration remains idempotent after reaching current version', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  createLegacyClinicalTables(db);
  await migrations.runMigrations({ database: db });
  const second = await migrations.runMigrations({ database: db });
  assert.deepEqual(second.applied, []);
  db.close();
});
