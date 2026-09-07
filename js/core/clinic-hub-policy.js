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
  'atendimento', 'em_atendimento', 'realizado', 'finalizado'
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
  if (!ALLOWED_APPOINTMENT_STATUSES.has(String(payload?.status || ''))) throw new Error('Status de agenda não permitido para profissional remoto.');
  if (payload.chegadaEm != null) throw new Error('Registro de chegada é operação da recepção.');
}

const PROFESSIONAL_COMMANDS = Object.freeze({
  'agenda.updateStatus': validateAgendaUpdateStatus
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