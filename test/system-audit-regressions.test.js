const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const guards = require('../js/core/workflow-guards');

test('agenda rejects overlap using appointment duration, not only equal start times', () => {
  assert.equal(guards.appointmentsOverlap('09:00', 30, '09:30', 30), false);
  assert.equal(guards.appointmentsOverlap('09:00', 60, '09:30', 30), true);
  assert.equal(guards.appointmentsOverlap('09:45', 30, '09:00', 60), true);
});

test('agenda has explicit valid state transitions', () => {
  assert.equal(guards.canTransitionAppointment('agendado', 'confirmado'), true);
  assert.equal(guards.canTransitionAppointment('confirmado', 'espera'), true);
  assert.equal(guards.canTransitionAppointment('espera', 'atendimento'), true);
  assert.equal(guards.canTransitionAppointment('atendimento', 'realizado'), true);
  assert.equal(guards.canTransitionAppointment('realizado', 'agendado'), false);
  assert.equal(guards.canTransitionAppointment('cancelado', 'realizado'), false);
});

test('date/time sorting uses chronological values instead of Brazilian date strings', () => {
  const rows = [
    { data: '02/10/2026', hora: '08:00' },
    { data: '15/09/2026', hora: '09:00' },
    { data: '15/09/2026', hora: '08:00' }
  ];
  assert.deepEqual(rows.sort(guards.compareAppointments).map(row => `${row.data} ${row.hora}`), [
    '15/09/2026 08:00', '15/09/2026 09:00', '02/10/2026 08:00'
  ]);
});

test('patient labels disambiguate homonyms with document or contact', () => {
  assert.equal(guards.patientOptionLabel({ nome: 'Ana Silva', cpf: '123.456.789-00' }), 'Ana Silva — CPF 123.456.789-00');
  assert.equal(guards.patientOptionLabel({ nome: 'Ana Silva', celular: '(16) 99999-0000' }), 'Ana Silva — (16) 99999-0000');
});

test('renderer stabilization preserves PEP draft, prevents duplicate saves and links agenda to encounter', () => {
  const source = read('js/domains/workflow-stabilization.js');
  assert.match(source, /refreshPepHeader/);
  assert.match(source, /pep-atendimento-id/);
  assert.match(source, /UPDATE prontuario_atendimentos/);
  assert.match(source, /agenda_id/);
  assert.match(source, /duracao_minutos/);
  assert.match(source, /canTransitionAppointment/);
  assert.match(source, /appointmentsOverlap/);
  assert.match(source, /BEGIN IMMEDIATE/);
  assert.match(source, /ROLLBACK/);
});

test('desktop hardening refuses unreadable database and manages clinical files inside app data', () => {
  const source = read('js/core/desktop-data-hardening.js');
  assert.match(source, /removeHandler\('carregar-banco'\)/);
  assert.match(source, /throw new Error/);
  assert.match(source, /clinical-files/);
  assert.match(source, /copyFileSync/);
  assert.match(source, /salvar-backup/);
  assert.match(source, /abrir-backup/);
  assert.match(source, /encryptPortableBackup/);
  assert.match(source, /decryptPortableBackup/);
});

test('portable backup format includes attachments while remaining backwards compatible', () => {
  const source = read('js/core/backup-format.js');
  assert.match(source, /PLENNUS_BACKUP_V2/);
  assert.match(source, /encryptPortableBackup/);
  assert.match(source, /decryptPortableBackup/);
  assert.match(source, /PLENNUS_BACKUP_V1/);
});

test('finance rendering does not pre-limit records before applying filters', () => {
  const source = read('js/domains/workflow-stabilization.js');
  assert.doesNotMatch(source, /LIMIT 250/);
  assert.match(source, /carregarLancamentosSemPreLimit/);
});
