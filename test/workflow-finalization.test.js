const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

const rootDir = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(rootDir, file), 'utf8');
const hubDb = require('../js/core/clinic-hub-database.js');

async function hubFixture() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE profissionais (id INTEGER PRIMARY KEY,nome TEXT,ativo INTEGER,uid TEXT);
    CREATE TABLE agenda (
      id INTEGER PRIMARY KEY,
      paciente_id INTEGER,
      profissional_id INTEGER,
      procedimento_id INTEGER,
      convenio_id INTEGER,
      data TEXT,
      hora TEXT,
      status TEXT,
      observacao TEXT,
      chegada_em TEXT
    );
    INSERT INTO profissionais VALUES (1,'Dra Ana',1,'prof-a');
    INSERT INTO agenda VALUES (100,10,1,20,NULL,'09/09/2026','10:00','atendimento',NULL,NULL);
  `);
  let bytes = Array.from(db.export());
  db.close();
  return {
    getBytes: () => bytes,
    setBytes: next => { bytes = Array.from(next); },
    inspect: sql => {
      const current = new SQL.Database(new Uint8Array(bytes));
      try { return current.exec(sql)?.[0]?.values || []; }
      finally { current.close(); }
    }
  };
}

test('legacy integration layers no longer own appointment status transitions', () => {
  const stabilization = read('js/domains/workflow-stabilization.js');
  const operations = read('js/domains/operations-integration.js');
  const networkWorkflow = read('js/domains/clinic-network-workflow.js');
  const orchestrator = read('js/domains/appointment-orchestrator.js');

  assert.doesNotMatch(stabilization, /root\.mudarStatus\s*=/);
  assert.doesNotMatch(stabilization, /root\.marcarChegadaEspera\s*=/);
  assert.doesNotMatch(stabilization, /root\.chamarParaAtendimento\s*=/);
  assert.doesNotMatch(operations, /root\.mudarStatus\s*=/);
  assert.doesNotMatch(networkWorkflow, /root\.mudarStatus\s*=/);
  assert.doesNotMatch(networkWorkflow, /syncRemoteAppointmentStatus/);
  assert.match(orchestrator, /root\.mudarStatus\s*=\s*async function mudarStatusPorWorkflow/);
});

test('Clinic Hub persists appointment completion event atomically and deduplicates replay by mutationId', async () => {
  const storage = await hubFixture();
  const service = hubDb.createClinicHubDatabaseService(storage);

  const first = await service.mutate('medico', 1, 'agenda.updateStatus', {
    mutationId: 'offline-complete-1', appointmentId: 100, status: 'realizado'
  }, { userId: 7 });
  const replay = await service.mutate('medico', 1, 'agenda.updateStatus', {
    mutationId: 'offline-complete-1', appointmentId: 100, status: 'realizado'
  }, { userId: 7 });

  assert.equal(first.duplicate, false);
  assert.equal(replay.duplicate, true);
  assert.deepEqual(storage.inspect('SELECT status FROM agenda WHERE id=100'), [['realizado']]);

  const events = storage.inspect(`SELECT event_type,aggregate_type,aggregate_id,mutation_id,source,dispatched_at
    FROM workflow_domain_events ORDER BY occurred_at,event_id`);
  assert.deepEqual(events, [['appointment.completed','appointment','100','offline-complete-1','remote-professional',null]]);
  assert.equal(storage.inspect("SELECT COUNT(*) FROM network_mutations WHERE mutation_id='offline-complete-1'")[0][0], 1);
});

test('Hub mutation notifications trigger canonical reconciliation after the DB reload', () => {
  const client = read('js/core/clinic-network-client.js');
  assert.match(client, /reloadCanonicalClinic/);
  assert.match(client, /PlennusAppointmentReconciliation\?\.onHubMutationApplied/);
});
