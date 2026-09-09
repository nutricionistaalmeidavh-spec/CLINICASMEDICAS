(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusAppointmentWorkflowDefinition = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const ACTIONS_BY_ROLE = Object.freeze({
    admin: new Set(['confirm', 'arrive', 'start', 'complete', 'cancel']),
    recepcao: new Set(['confirm', 'arrive', 'cancel']),
    medico: new Set(['start', 'complete'])
  });

  function authorizeAppointment(context = {}) {
    const role = String(context.actor?.role || '').trim();
    const action = String(context.action || '').trim();
    if (!ACTIONS_BY_ROLE[role]?.has(action)) return false;
    if (role !== 'medico') return true;
    const actorProfessionalId = Number(context.actor?.professionalId);
    const appointmentProfessionalId = Number(context.payload?.professionalId);
    return Number.isInteger(actorProfessionalId)
      && actorProfessionalId > 0
      && actorProfessionalId === appointmentProfessionalId;
  }

  function createAppointmentWorkflowDefinition() {
    return {
      aggregateType: 'appointment',
      initialState: 'agendado',
      transitions: {
        confirm: {
          from: ['agendado'],
          to: 'confirmado',
          event: 'appointment.confirmed'
        },
        arrive: {
          from: ['agendado', 'confirmado'],
          to: 'espera',
          event: 'patient.arrived'
        },
        start: {
          from: ['espera'],
          to: 'atendimento',
          event: 'appointment.started'
        },
        complete: {
          from: ['atendimento'],
          to: 'realizado',
          event: 'appointment.completed'
        },
        cancel: {
          from: ['agendado', 'confirmado', 'espera'],
          to: 'cancelado',
          event: 'appointment.cancelled'
        }
      },
      authorize: authorizeAppointment
    };
  }

  return {
    ACTIONS_BY_ROLE,
    authorizeAppointment,
    createAppointmentWorkflowDefinition
  };
});
