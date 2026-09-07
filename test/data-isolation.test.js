const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');
const isolation = require('../js/core/data-isolation.js');

function makeAdapter(database) {
  return {
    query(sql, params = []) {
      const stmt = database.prepare(sql);
      stmt.bind(params);
      const rows = [];
      try {
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    },
    run(sql, params = []) {
      database.run(sql, params);
      return database.getRowsModified();
    }
  };
}

test('detects clinical tables without treating shared scheduling as clinical data', () => {
  assert.deepEqual(isolation.extractSqlTables('SELECT p.id FROM pacientes p JOIN prontuario_atendimentos a ON a.paciente_id=p.id'), [
    'pacientes',
    'prontuario_atendimentos'
  ]);
  assert.equal(isolation.touchesClinicalTable('SELECT * FROM prontuario_atendimentos WHERE paciente_id=?'), true);
  assert.equal(isolation.touchesClinicalTable('UPDATE documentos_emitidos SET titulo=? WHERE id=?'), true);
  assert.equal(isolation.touchesClinicalTable('SELECT * FROM agenda WHERE profissional_id=?'), false);
  assert.equal(isolation.touchesClinicalTable('INSERT INTO caixa (tipo,valor) VALUES (?,?)'), false);
});

test('only professional role can bind a clinical database', () => {
  assert.equal(isolation.canUseClinicalDatabase('medico'), true);
  assert.equal(isolation.canUseClinicalDatabase('admin'), false);
  assert.equal(isolation.canUseClinicalDatabase('recepcao'), false);
  assert.equal(isolation.canUseClinicalDatabase(null), false);
});

test('isolation schema assigns stable ids and links legacy professional users', async () => {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  const db = makeAdapter(database);
  try {
    database.run(`
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT,usuario TEXT,senha TEXT,nivel TEXT,ativo INTEGER DEFAULT 1);
      CREATE TABLE profissionais (id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT,especialidade TEXT,ativo INTEGER DEFAULT 1);
      CREATE TABLE pacientes (id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT,ativo INTEGER DEFAULT 1);
      CREATE TABLE configuracoes (chave TEXT PRIMARY KEY,valor TEXT);
      INSERT INTO usuarios (nome,usuario,senha,nivel) VALUES ('Dra. Ana','ana','hash','medico');
      INSERT INTO pacientes (nome) VALUES ('Paciente Um');
    `);

    isolation.ensureIsolationSchema(db);

    const user = db.query("SELECT uid,profissional_id FROM usuarios WHERE usuario='ana'")[0];
    const professional = db.query('SELECT id,uid,nome FROM profissionais WHERE id=?', [user.profissional_id])[0];
    const patient = db.query('SELECT uid FROM pacientes WHERE id=1')[0];
    const clinic = db.query("SELECT valor FROM configuracoes WHERE chave='clinic_uid'")[0];

    assert.match(user.uid, /^[0-9a-f]{32}$/);
    assert.equal(Number(user.profissional_id), Number(professional.id));
    assert.equal(professional.nome, 'Dra. Ana');
    assert.match(professional.uid, /^[0-9a-f]{32}$/);
    assert.match(patient.uid, /^[0-9a-f]{32}$/);
    assert.match(clinic.valor, /^[0-9a-f]{32}$/);
    assert.equal(db.query("SELECT valor FROM configuracoes WHERE chave='data_isolation_version'")[0].valor, '1');
  } finally {
    database.close();
  }
});

test('migration summary resolves patients assigned to the selected professional only', async () => {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  const db = makeAdapter(database);
  try {
    database.run(`
      CREATE TABLE agenda (id INTEGER PRIMARY KEY,paciente_id INTEGER,profissional_id INTEGER);
      CREATE TABLE prontuario_atendimentos (id INTEGER PRIMARY KEY,paciente_id INTEGER,profissional_id INTEGER);
      CREATE TABLE documentos_emitidos (id INTEGER PRIMARY KEY,paciente_id INTEGER,profissional_id INTEGER);
      CREATE TABLE planos_tratamento (id INTEGER PRIMARY KEY,paciente_id INTEGER,profissional_id INTEGER);
      INSERT INTO agenda VALUES (1,10,1),(2,20,2),(3,30,1);
      INSERT INTO prontuario_atendimentos VALUES (1,10,1),(2,20,2);
      INSERT INTO documentos_emitidos VALUES (1,40,1);
      INSERT INTO planos_tratamento VALUES (1,50,1),(2,60,2);
    `);

    const summary = isolation.buildProfessionalMigrationSummary(db, 1);
    assert.deepEqual(summary.patientIds, [10, 30, 40, 50]);
    assert.equal(summary.patientCount, 4);
    assert.equal(summary.clinicalRecordCount, 3);
  } finally {
    database.close();
  }
});

test('professional database pruning removes foreign and unassigned professional records', async () => {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  const db = makeAdapter(database);
  try {
    database.run(`
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY,senha TEXT);
      CREATE TABLE prontuario_atendimentos (id INTEGER PRIMARY KEY,paciente_id INTEGER,profissional_id INTEGER);
      CREATE TABLE documentos_emitidos (id INTEGER PRIMARY KEY,paciente_id INTEGER,profissional_id INTEGER);
      CREATE TABLE planos_tratamento (id INTEGER PRIMARY KEY,paciente_id INTEGER,profissional_id INTEGER);
      INSERT INTO usuarios VALUES (1,'secret');
      INSERT INTO prontuario_atendimentos VALUES (1,10,1),(2,20,2),(3,30,NULL);
      INSERT INTO documentos_emitidos VALUES (1,10,1),(2,20,2),(3,30,NULL);
      INSERT INTO planos_tratamento VALUES (1,10,1),(2,20,2),(3,30,NULL);
    `);

    isolation.pruneProfessionalDatabase(db, 1, [10]);

    assert.deepEqual(db.query('SELECT id FROM prontuario_atendimentos ORDER BY id').map(row => row.id), [1]);
    assert.deepEqual(db.query('SELECT id FROM documentos_emitidos ORDER BY id').map(row => row.id), [1]);
    assert.deepEqual(db.query('SELECT id FROM planos_tratamento ORDER BY id').map(row => row.id), [1]);
    assert.equal(db.query('SELECT senha FROM usuarios WHERE id=1')[0].senha, '');
  } finally {
    database.close();
  }
});