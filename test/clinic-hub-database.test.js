const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const initSqlJs = require('sql.js');

const hubDb = require('../js/core/clinic-hub-database.js');

async function fixture() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY,nome TEXT,usuario TEXT,senha TEXT,nivel TEXT,ativo INTEGER,profissional_id INTEGER);
    CREATE TABLE profissionais (id INTEGER PRIMARY KEY,nome TEXT,especialidade TEXT,ativo INTEGER,uid TEXT);
    CREATE TABLE pacientes (id INTEGER PRIMARY KEY,nome TEXT,telefone TEXT,celular TEXT,email TEXT,cpf TEXT,ativo INTEGER,uid TEXT);
    CREATE TABLE agenda (id INTEGER PRIMARY KEY,paciente_id INTEGER,profissional_id INTEGER,data TEXT,hora TEXT,status TEXT,observacao TEXT);
    CREATE TABLE procedimentos (id INTEGER PRIMARY KEY,nome TEXT,valor_particular REAL,ativo INTEGER);
    CREATE TABLE convenios (id INTEGER PRIMARY KEY,nome TEXT,ativo INTEGER);
    CREATE TABLE configuracoes (chave TEXT PRIMARY KEY,valor TEXT);
    CREATE TABLE documentos_templates (id INTEGER PRIMARY KEY,nome TEXT,tipo TEXT,conteudo TEXT,ativo INTEGER);
    CREATE TABLE grade_horarios (id INTEGER PRIMARY KEY,profissional_id INTEGER,dia_semana INTEGER,hora_inicio TEXT,hora_fim TEXT,intervalo_minutos INTEGER);
    INSERT INTO profissionais VALUES (1,'Dra Ana','Clínica',1,'prof-a'),(2,'Dr Beto','Clínica',1,'prof-b');
    INSERT INTO usuarios VALUES
      (1,'Dra Ana','ana','${crypto.createHash('sha256').update('senha123').digest('hex')}','medico',1,1),
      (2,'Admin','admin','${crypto.createHash('sha256').update('admin123').digest('hex')}','admin',1,NULL);
    INSERT INTO pacientes VALUES (10,'Paciente A','111',NULL,NULL,NULL,1,'pat-a'),(20,'Paciente B','222',NULL,NULL,NULL,1,'pat-b');
    INSERT INTO agenda VALUES (100,10,1,'07/09/2026','09:00','agendado',NULL),(200,20,2,'07/09/2026','10:00','agendado',NULL);
    INSERT INTO configuracoes VALUES ('clinic_uid','clinic-x'),('nome_clinica','Clínica X'),('api_key_gemini','segredo');
  `);
  let bytes = Array.from(db.export());
  db.close();
  return {
    getBytes: () => bytes,
    setBytes: next => { bytes = Array.from(next); },
    inspect: async sql => {
      const current = new SQL.Database(new Uint8Array(bytes));
      try {
        const result = current.exec(sql);
        return result?.[0]?.values || [];
      } finally { current.close(); }
    }
  };
}

test('hub database authenticates professional without returning credential fields', async () => {
  const data = await fixture();
  const service = hubDb.createClinicHubDatabaseService(data);
  const result = await service.authenticate('ana', 'senha123');
  assert.equal(result.ok, true);
  assert.equal(result.user.nivel, 'medico');
  assert.equal(result.user.profissional_id, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(result.user, 'senha'), false);
  assert.equal((await service.authenticate('ana', 'errada')).ok, false);
});

test('professional snapshot filters patient and agenda rows and strips sensitive configuration', async () => {
  const data = await fixture();
  const service = hubDb.createClinicHubDatabaseService(data);
  const snapshot = await service.snapshot('medico', 1);
  assert.deepEqual(snapshot.tables.pacientes.map(row => Number(row.id)), [10]);
  assert.deepEqual(snapshot.tables.agenda.map(row => Number(row.id)), [100]);
  assert.equal(snapshot.tables.configuracoes.some(row => row.chave === 'api_key_gemini'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.tables, 'usuarios'), false);
});

test('shared mutation is idempotent by mutationId', async () => {
  const data = await fixture();
  const service = hubDb.createClinicHubDatabaseService(data);
  const first = await service.mutate('medico', 1, 'agenda.updateStatus', { mutationId: 'mut-1', appointmentId: 100, status: 'finalizado' });
  const second = await service.mutate('medico', 1, 'agenda.updateStatus', { mutationId: 'mut-1', appointmentId: 100, status: 'finalizado' });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.deepEqual(await data.inspect("SELECT status FROM agenda WHERE id=100"), [['finalizado']]);
  assert.equal((await data.inspect("SELECT COUNT(*) FROM network_mutations WHERE mutation_id='mut-1'"))[0][0], 1);
});

test('RPC controller allows only remote professional sessions', async () => {
  const data = await fixture();
  const service = hubDb.createClinicHubDatabaseService(data);
  const controller = hubDb.createClinicHubRpcController({ databaseService: service, now: () => 50_000 });

  const login = await controller.handle({ deviceId: 'dev-1', action: 'session.login', payload: { username: 'ana', password: 'senha123' } });
  assert.match(login.sessionToken, /^[a-f0-9]{64}$/);
  const snapshot = await controller.handle({ deviceId: 'dev-1', action: 'shared.snapshot', payload: { sessionToken: login.sessionToken } });
  assert.deepEqual(snapshot.tables.pacientes.map(row => Number(row.id)), [10]);
  await assert.rejects(() => controller.handle({ deviceId: 'dev-2', action: 'shared.snapshot', payload: { sessionToken: login.sessionToken } }), /sessão/i);
  await assert.rejects(() => controller.handle({ deviceId: 'dev-1', action: 'session.login', payload: { username: 'admin', password: 'admin123' } }), /profissionais/i);
});
