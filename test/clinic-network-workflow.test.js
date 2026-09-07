const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../js/core/clinic-hub-policy.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('remote professional can synchronize the appointment states used by the current UI', () => {
  assert.doesNotThrow(() => policy.validateCommand('medico', 'agenda.updateStatus', {
    mutationId: 'status-atendimento-001', appointmentId: 1, status: 'atendimento'
  }));
  assert.doesNotThrow(() => policy.validateCommand('medico', 'agenda.updateStatus', {
    mutationId: 'status-realizado-001', appointmentId: 1, status: 'realizado'
  }));
});

test('remote professional workflow layer synchronizes clinical status and blocks administrative writes', () => {
  const workflow = read('js/domains/clinic-network-workflow.js');
  const navigation = read('js/core/navigation.js');

  assert.match(workflow, /isRemoteProfessionalMode/);
  assert.match(workflow, /bloquearOperacaoAdministrativaRemota/);
  assert.match(workflow, /PlennusClinicNetwork\.mutate/);
  assert.match(workflow, /agenda\.updateStatus/);
  for (const operation of ['agendarConsulta', 'salvarGrade', 'excluirGrade', 'salvarPaciente', 'excluirPaciente', 'marcarChegadaEspera']) {
    assert.match(workflow, new RegExp(operation));
  }
  assert.match(workflow, /profissional_id/);
  assert.match(navigation, /js\/domains\/clinic-network-workflow\.js/);
});

test('remote professional RPC rejects administrative agenda and patient mutations server-side', () => {
  assert.throws(() => policy.validateCommand('medico', 'agenda.upsert', {
    mutationId: 'admin-agenda', appointment: { paciente_id: 1, profissional_id: 1, data: '07/09/2026', hora: '09:00' }
  }));
  assert.throws(() => policy.validateCommand('medico', 'patient.upsertBasic', {
    mutationId: 'admin-patient', patient: { id: 1, nome: 'Maria' }
  }));
  assert.throws(() => policy.validateCommand('medico', 'agenda.updateStatus', {
    mutationId: 'reception-arrival', appointmentId: 1, status: 'espera'
  }), /status/i);
});
