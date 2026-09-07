const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../js/core/clinic-hub-policy.js');

test('professional snapshot allowlist excludes credentials, finance and clinical tables', () => {
  const tables = policy.allowedSnapshotTables('medico');
  for (const table of ['pacientes', 'profissionais', 'procedimentos', 'convenios', 'configuracoes', 'documentos_templates', 'agenda', 'grade_horarios']) {
    assert.ok(tables.includes(table), table);
  }
  for (const table of ['usuarios', 'caixa', 'financeiro_lancamentos', 'prontuario_atendimentos', 'documentos_emitidos', 'exames_laboratoriais']) {
    assert.equal(tables.includes(table), false, table);
  }
});

test('configuration snapshot removes secret-like keys', () => {
  const rows = policy.sanitizeConfigurationRows([
    { chave: 'clinic_uid', valor: 'abc' },
    { chave: 'nome_clinica', valor: 'Plennus' },
    { chave: 'api_key_gemini', valor: 'secret' },
    { chave: 'token_whatsapp', valor: 'secret' },
    { chave: 'client_secret', valor: 'secret' }
  ]);
  assert.deepEqual(rows, [
    { chave: 'clinic_uid', valor: 'abc' },
    { chave: 'nome_clinica', valor: 'Plennus' }
  ]);
});

test('professional RPC only allows clinical appointment-state transitions on shared data', () => {
  for (const status of ['atendimento', 'em_atendimento', 'realizado', 'finalizado']) {
    assert.doesNotThrow(() => policy.validateCommand('medico', 'agenda.updateStatus', { appointmentId: 2, status, mutationId: `m-${status}` }));
  }

  for (const status of ['agendado', 'confirmado', 'espera', 'cancelado', 'faltou']) {
    assert.throws(() => policy.validateCommand('medico', 'agenda.updateStatus', { appointmentId: 2, status, mutationId: `m-${status}` }), /status/i);
  }

  assert.throws(() => policy.validateCommand('medico', 'agenda.upsert', { mutationId: 'm-2', appointment: { id: 2, paciente_id: 1, profissional_id: 4, data: '07/09/2026', hora: '09:00', status: 'agendado' } }));
  assert.throws(() => policy.validateCommand('medico', 'patient.upsertBasic', { mutationId: 'm-3', patient: { id: 1, nome: 'Maria', telefone: '16999999999' } }));
  assert.throws(() => policy.validateCommand('medico', 'sql.execute', { sql: 'SELECT * FROM usuarios' }));
  assert.throws(() => policy.validateCommand('medico', 'clinical.write', { table: 'prontuario_atendimentos' }));
  assert.throws(() => policy.validateCommand('medico', 'finance.delete', { id: 1 }));
});

test('mutation contract rejects missing idempotency key and invalid status', () => {
  assert.throws(() => policy.validateCommand('medico', 'agenda.updateStatus', { appointmentId: 2, status: 'finalizado' }));
  assert.throws(() => policy.validateCommand('medico', 'agenda.updateStatus', { appointmentId: 2, status: 'drop table', mutationId: 'm-1' }));
});
