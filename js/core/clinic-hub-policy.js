const PROFESSIONAL_SNAPSHOT_TABLES = Object.freeze([
  'pacientes',
  'profissionais',
  'procedimentos',
  'convenios',
  'configuracoes',
  'documentos_templates',
  'agenda',
  'grade_horarios'
]);

const ALLOWED_APPOINTMENT_STATUSES = new Set([
  'agendado', 'confirmado', 'espera', 'em_atendimento', 'realizado', 'finalizado', 'cancelado', 'faltou'
]);

const SENSITIVE_CONFIG_PATTERN = /(api[_-]?key|token|secret|senha|password|credential|oauth|client[_-]?secret)/i;

function allowedSnapshotTables(role) {
  return role === 'medico' ? [...PROFESSIONAL_SNAPSHOT_TABLES] : [];
}

function sanitizeConfigurationRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter(row => {
    const key = String(row?.chave || '');
    return key && !SENSITIVE_CONFIG_PATTERN.test(key);
  }).map(row => ({ ...row }));
}

function requireMutationId(payload) {
  const mutationId = String(payload?.mutationId || '').trim();
  if (!mutationId || mutationId.length > 128) throw new Error('mutationId obrigatório.');
  return mutationId;
}

function requirePositiveId(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${field} inválido.`);
  return number;
}

function validateAgendaUpdateStatus(payload) {
  requireMutationId(payload);
  requirePositiveId(payload?.appointmentId, 'appointmentId');
  if (!ALLOWED_APPOINTMENT_STATUSES.has(String(payload?.status || ''))) throw new Error('Status de agenda inválido.');
}

function validateAgendaUpsert(payload) {
  requireMutationId(payload);
  const appointment = payload?.appointment;
  if (!appointment || typeof appointment !== 'object') throw new Error('Agendamento inválido.');
  requirePositiveId(appointment.paciente_id, 'paciente_id');
  requirePositiveId(appointment.profissional_id, 'profissional_id');
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(appointment.data || ''))) throw new Error('Data de agenda inválida.');
  if (!/^\d{2}:\d{2}$/.test(String(appointment.hora || ''))) throw new Error('Hora de agenda inválida.');
  if (!ALLOWED_APPOINTMENT_STATUSES.has(String(appointment.status || 'agendado'))) throw new Error('Status de agenda inválido.');
}

function validatePatientUpsertBasic(payload) {
  requireMutationId(payload);
  const patient = payload?.patient;
  if (!patient || typeof patient !== 'object') throw new Error('Paciente inválido.');
  if (patient.id != null) requirePositiveId(patient.id, 'patient.id');
  const nome = String(patient.nome || '').trim();
  if (nome.length < 2 || nome.length > 180) throw new Error('Nome de paciente inválido.');
  if (patient.telefone != null && String(patient.telefone).length > 32) throw new Error('Telefone inválido.');
}

const PROFESSIONAL_COMMANDS = Object.freeze({
  'agenda.updateStatus': validateAgendaUpdateStatus,
  'agenda.upsert': validateAgendaUpsert,
  'patient.upsertBasic': validatePatientUpsertBasic
});

function validateCommand(role, action, payload = {}) {
  if (role !== 'medico') throw new Error('Papel sem permissão para comando remoto.');
  const validator = PROFESSIONAL_COMMANDS[String(action || '')];
  if (!validator) throw new Error('Comando remoto não permitido.');
  validator(payload);
  return { ok: true, action: String(action), mutationId: String(payload.mutationId) };
}

module.exports = {
  PROFESSIONAL_SNAPSHOT_TABLES,
  ALLOWED_APPOINTMENT_STATUSES,
  allowedSnapshotTables,
  sanitizeConfigurationRows,
  validateCommand
};
