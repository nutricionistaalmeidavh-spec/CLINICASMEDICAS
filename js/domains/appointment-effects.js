(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusAppointmentEffectsModule = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const EVENT_STATUS = Object.freeze({
    'appointment.confirmed': 'confirmado',
    'patient.arrived': 'espera',
    'appointment.started': 'atendimento',
    'appointment.completed': 'realizado',
    'appointment.cancelled': 'cancelado'
  });

  function appointmentId(event) {
    const id = Number(event?.aggregateId);
    if (!Number.isInteger(id) || id <= 0) throw new Error('Evento de agendamento inválido.');
    return id;
  }

  function registerAppointmentEffects(core, services = {}) {
    if (!core || typeof core.registerEffect !== 'function') throw new Error('Workflow Core is required to register appointment effects.');
    const dentalFinance = services.dentalFinance || {};
    const odontology = services.odontology || {};
    const crm = services.crm || {};
    const finance = services.finance || {};
    const inventory = services.inventory || {};
    const whatsapp = services.whatsapp || {};

    const statusEvents = Object.keys(EVENT_STATUS);
    statusEvents.forEach(eventType => {
      core.registerEffect(eventType, 'crm.appointment-status', event => {
        const status = EVENT_STATUS[event.type];
        return crm.onAppointmentStatusChanged?.(appointmentId(event), status) ?? null;
      });

      core.registerEffect(eventType, 'odontology.appointment-status', event => {
        const status = EVENT_STATUS[event.type];
        return odontology.onAppointmentStatusChanged?.(appointmentId(event), status) ?? null;
      });
    });

    ['appointment.completed', 'appointment.cancelled'].forEach(eventType => {
      core.registerEffect(eventType, 'dental-finance.appointment-status', event => {
        const id = appointmentId(event);
        const status = EVENT_STATUS[event.type];
        if (dentalFinance.isDentalAppointment?.(id) !== true) return { handled: false };
        return dentalFinance.onAppointmentStatusChanged?.(id, status) ?? { handled: true };
      });

      core.registerEffect(eventType, 'finance.appointment-status', event => {
        const id = appointmentId(event);
        const status = EVENT_STATUS[event.type];
        if (dentalFinance.isDentalAppointment?.(id) === true) return { skipped: 'dental' };
        return finance.onAppointmentStatusChanged?.(id, status) ?? null;
      });

      core.registerEffect(eventType, 'whatsapp.appointment-status', event => {
        return whatsapp.cancelAppointmentMessages?.(appointmentId(event)) ?? null;
      });
    });

    core.registerEffect('appointment.completed', 'inventory.appointment-completed', event => {
      return inventory.consumeForAppointment?.(appointmentId(event)) ?? null;
    });

    core.registerEffect('appointment.confirmed', 'whatsapp.appointment-confirmed', event => {
      return whatsapp.syncAppointmentMessages?.(appointmentId(event)) ?? null;
    });

    return core;
  }

  function installBrowserEffects(root) {
    const runtime = root?.PlennusAppointmentWorkflowRuntime;
    if (!runtime?.core || runtime.effectsInstalled) return runtime?.core || null;
    registerAppointmentEffects(runtime.core, {
      dentalFinance: root.PlennusDentalFinance,
      odontology: root.PlennusOdontology,
      crm: root.PlennusCRM,
      finance: root.PlennusFinanceAdvanced,
      inventory: root.PlennusInventory,
      whatsapp: root.PlennusWhatsAppAutomation
    });
    runtime.effectsInstalled = true;
    root.PlennusAppointmentEffects = { installed: true, core: runtime.core };
    return runtime.core;
  }

  const api = { EVENT_STATUS, registerAppointmentEffects, installBrowserEffects };
  if (typeof window !== 'undefined') installBrowserEffects(window);
  return api;
});
