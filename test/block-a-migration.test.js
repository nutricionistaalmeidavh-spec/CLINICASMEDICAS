const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');
const migrations = require('../js/core/migrations');

async function createBaselineDatabase() {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  database.run(`
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, nivel TEXT);
    CREATE TABLE pacientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT);
    CREATE TABLE profissionais (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, percentual_repasse REAL DEFAULT 30);
    CREATE TABLE procedimentos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, valor_particular REAL DEFAULT 0);
    CREATE TABLE agenda (id INTEGER PRIMARY KEY AUTOINCREMENT, paciente_id INTEGER, profissional_id INTEGER, procedimento_id INTEGER, data TEXT, hora TEXT, status TEXT);
    CREATE TABLE caixa (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, descricao TEXT, valor REAL, forma_pagamento TEXT, data TEXT);
    CREATE TABLE repasses (id INTEGER PRIMARY KEY AUTOINCREMENT, profissional_id INTEGER, periodo_inicio TEXT, periodo_fim TEXT, valor_bruto REAL, percentual REAL, valor_repasse REAL, data_pagamento TEXT, status TEXT, criado_em TEXT);
  `);
  return database;
}

function tableNames(database) {
  const result = database.exec("SELECT name FROM sqlite_master WHERE type='table'");
  return new Set((result[0]?.values || []).map(row => row[0]));
}

test('Block A migration creates additive operational schema and advances user_version', async () => {
  const database = await createBaselineDatabase();
  const result = await migrations.runMigrations({ database });

  assert.deepEqual(result.applied, [1, 2]);
  assert.equal(migrations.readUserVersion(database), 2);

  const tables = tableNames(database);
  for (const table of [
    'financeiro_categorias', 'financeiro_lancamentos', 'financeiro_caixa_links', 'financeiro_repasse_links',
    'estoque_itens', 'estoque_movimentos', 'procedimento_estoque',
    'crm_pacientes', 'crm_interacoes', 'crm_oportunidades', 'mensagens_whatsapp'
  ]) {
    assert.equal(tables.has(table), true, `expected table ${table}`);
  }

  const categories = database.exec('SELECT nome,tipo FROM financeiro_categorias ORDER BY id')[0].values;
  assert.ok(categories.some(([name, type]) => name === 'Consultas' && type === 'receita'));
  assert.ok(categories.some(([name, type]) => name === 'Materiais e insumos' && type === 'despesa'));
});

test('Block A migration is idempotent after schema version is current', async () => {
  const database = await createBaselineDatabase();
  await migrations.runMigrations({ database });
  const second = await migrations.runMigrations({ database });
  assert.deepEqual(second.applied, []);
  assert.equal(second.from, 2);
  assert.equal(second.to, 2);
});
