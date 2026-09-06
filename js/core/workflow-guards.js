(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusWorkflowGuards = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const APPOINTMENT_TRANSITIONS = Object.freeze({
    agendado: ['confirmado', 'espera', 'cancelado'],
    confirmado: ['espera', 'atendimento', 'cancelado'],
    espera: ['atendimento', 'cancelado'],
    atendimento: ['realizado'],
    realizado: [],
    cancelado: []
  });

  function timeToMinutes(value) {
    const match = String(value || '').trim().match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function normalizeDuration(value, fallback = 30) {
    const duration = Number(value);
    if (!Number.isFinite(duration) || duration < 5 || duration > 480) return fallback;
    return Math.round(duration);
  }

  function appointmentsOverlap(startA, durationA, startB, durationB) {
    const a = timeToMinutes(startA);
    const b = timeToMinutes(startB);
    if (a == null || b == null) return false;
    const endA = a + normalizeDuration(durationA);
    const endB = b + normalizeDuration(durationB);
    return a < endB && b < endA;
  }

  function canTransitionAppointment(from, to) {
    if (from === to) return true;
    return Boolean(APPOINTMENT_TRANSITIONS[String(from || '')]?.includes(String(to || '')));
  }

  function brDateSortKey(value) {
    const match = String(value || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return '9999-99-99';
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  function compareAppointments(a, b) {
    return `${brDateSortKey(a?.data)}T${a?.hora || '99:99'}`.localeCompare(`${brDateSortKey(b?.data)}T${b?.hora || '99:99'}`);
  }

  function patientOptionLabel(patient = {}) {
    const name = String(patient.nome || 'Paciente').trim();
    if (patient.cpf) return `${name} — CPF ${String(patient.cpf).trim()}`;
    const contact = patient.celular || patient.telefone;
    return contact ? `${name} — ${String(contact).trim()}` : name;
  }

  function isWithinScheduleBlock(start, duration, blockStart, blockEnd) {
    const startMinutes = timeToMinutes(start);
    const blockStartMinutes = timeToMinutes(blockStart);
    const blockEndMinutes = timeToMinutes(blockEnd);
    if (startMinutes == null || blockStartMinutes == null || blockEndMinutes == null) return false;
    const endMinutes = startMinutes + normalizeDuration(duration);
    return startMinutes >= blockStartMinutes && endMinutes <= blockEndMinutes;
  }

  return {
    APPOINTMENT_TRANSITIONS,
    timeToMinutes,
    normalizeDuration,
    appointmentsOverlap,
    canTransitionAppointment,
    brDateSortKey,
    compareAppointments,
    patientOptionLabel,
    isWithinScheduleBlock
  };
});
