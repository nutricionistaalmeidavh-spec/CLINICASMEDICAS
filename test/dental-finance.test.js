const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');

function rowsFromExec(result) {
  if (!result?.length) return [];
  const [{ columns, values }] = result;
  return values.map(valueRow => Object.fromEntries(columns.map((column, index) => [column, valueRow[index]])));
}

async function setup() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE pacientes (id INTEGER PRIMARY KEY, nome TEXT)');
  db.run('CREATE TABLE agenda (id INTEGER PRIMARY KEY, paciente_id INTEGER, profissional_id INTEGER, procedimento_id INTEGER, data TEXT)');
  db.run('CREATE TABLE plano_tratamento_itens (id INTEGER PRIMARY KEY, agenda_id INTEGER)');
  db.run('CREATE TABLE financeiro_categorias (id INTEGER PRIMARY KEY, nome TEXT, tipo TEXT)');
  db.run(`CREATE TABLE financeiro_lancamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, descricao TEXT, categoria_id INTEGER, paciente_id INTEGER,
    profissional_id INTEGER, agenda_id INTEGER, procedimento_id INTEGER, chave_origem TEXT UNIQUE, valor REAL,
    vencimento_em TEXT, competencia TEXT, status TEXT, atualizado_em TEXT
  )`);
  db.run("INSERT INTO pacientes (id,nome) VALUES (2,'Paciente teste')");
  db.run("INSERT INTO agenda (id,paciente_id,profissional_id,procedimento_id,data) VALUES (7,2,3,4,'06/09/2026')");
  db.run('INSERT INTO plano_tratamento_itens (id,agenda_id) VALUES (11,7)');
  db.run("INSERT INTO financeiro_categorias (id,nome,tipo) VALUES (1,'Procedimentos','receita')");

  let lastId = 0;
  global.DB = {
    isReady: () => true,
    query(sql, params = []) {
      const statement = db.prepare(sql);
      statement.bind(params);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      statement.free();
      return rows;
    },
    run(sql, params = []) {
      db.run(sql, params);
      const row = rowsFromExec(db.exec('SELECT last_insert_rowid() id'))[0];
      lastId = Number(row?.id || 0);
    },
    getLastId: () => lastId
  };
  global.PlennusOperationsModel = require('../js/core/operations-model');
  global.PlennusOdontology = {
    resolveAppointmentCharge: () => ({ handled: true, charge: { amount: 480, description: 'Coroa — Plano posterior', procedureId: 4 } })
  };
  const modulePath = require.resolve('../js/domains/dental-finance.js');
  delete require.cache[modulePath];
  require(modulePath);
  return { db, modulePath };
}

test('dental appointment creates one receivable using approved treatment value', async () => {
  const { db, modulePath } = await setup();
  assert.equal(global.PlennusDentalFinance.ensureReceivableForAppointment(7), true);
  assert.equal(global.PlennusDentalFinance.ensureReceivableForAppointment(7), true);
  const rows = rowsFromExec(db.exec('SELECT * FROM financeiro_lancamentos'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].valor, 480);
  assert.equal(rows[0].descricao, 'Coroa — Plano posterior');
  assert.equal(rows[0].chave_origem, 'odontologia:agenda:7:receita');
  assert.equal(rows[0].status, 'pendente');
  db.close();
  delete require.cache[modulePath];
  delete global.PlennusDentalFinance;
  delete global.PlennusOdontology;
  delete global.PlennusOperationsModel;
  delete global.DB;
});

test('dental appointment with blocked charge is handled without falling back to generic billing', async () => {
  const { db, modulePath } = await setup();
  global.PlennusOdontology.resolveAppointmentCharge = () => ({ handled: true, charge: null, reason: 'pending approval' });
  assert.equal(global.PlennusDentalFinance.ensureReceivableForAppointment(7), true);
  assert.equal(rowsFromExec(db.exec('SELECT * FROM financeiro_lancamentos')).length, 0);
  db.close();
  delete require.cache[modulePath];
  delete global.PlennusDentalFinance;
  delete global.PlennusOdontology;
  delete global.PlennusOperationsModel;
  delete global.DB;
});
