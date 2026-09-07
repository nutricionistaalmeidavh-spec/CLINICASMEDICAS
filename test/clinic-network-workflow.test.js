const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../js/core/clinic-hub-policy.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('remote professional can synchronize the appointment states used by the current UI', () => {
  assert.doesNotThrow(() => policy.validateCommand('medico', 'agenda.updateStatus', {
    mutationId: 'status-atendimento-001',
    appointmentId: 1,
    status: 'atendimento'
  }));
  assert.doesNotThrow(() => policy.validateCommand('medico', 'agenda.updateStatus', {
    mutationId: 'status-realizado-001',
    appointmentId: 1,
    status: 'realizado'
  }));
});

test('agenda uses Clinic Network for remote professional status and blocks administrative writes', () => {
  const agenda = read('js/domains/agenda.js');
  assert.match(agenda, /isRemoteProfessionalMode/);
  assert.match(agenda, /PlennusClinicNetwork\.mutate/);
  assert.match(agenda, /agenda\.updateStatus/);
  assert.match(agenda, /agendarConsulta[\s\S]*bloquearOperacaoAdministrativaRemota/);
  assert.match(agenda, /salvarGrade[\s\S]*bloquearOperacaoAdministrativaRemota/);
  assert.match(agenda, /excluirGrade[\s\S]*bloquearOperacaoAdministrativaRemota/);
});

test('patient administrative mutations are blocked in remote professional mode', () => {
  const patients = read('js/domains/patients.js');
  assert.match(patients, /isRemoteProfessionalMode/);
  assert.match(patients, /salvarPaciente[\s\S]*bloquearOperacaoAdministrativaRemota/);
  assert.match(patients, /excluirPaciente[\s\S]*bloquearOperacaoAdministrativaRemota/);
});
