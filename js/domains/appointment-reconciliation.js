(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusAppointmentReconciliationModule = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function createAppointmentReconciliation({ core, isRemoteProfessionalMode = () => false, logger = null } = {}) {
    if (!core || typeof core.reconcile !== 'function') throw new Error('Appointment Workflow Core runtime is required.');
    let queue = Promise.resolve();

    function reconcile(options = {}) {
      if (isRemoteProfessionalMode()) return Promise.resolve({ ignored: true, reason: 'remote-professional' });
      queue = queue.catch(() => {}).then(() => core.reconcile({ aggregateType: 'appointment', ...options }));
      return queue;
    }

    function onEventPersisted(event) {
      return reconcile({ aggregateId: event?.aggregateId ?? null }).catch(error => {
        logger?.error?.('Falha ao reconciliar evento de atendimento.', error);
        return { failed: true, error: error?.message || String(error) };
      });
    }

    function onHubMutationApplied(change) {
      if (!String(change?.command || '').startsWith('agenda.')) return Promise.resolve({ ignored: true });
      return reconcile().catch(error => {
        logger?.error?.('Falha ao reconciliar mutação do Clinic Hub.', error);
        return { failed: true, error: error?.message || String(error) };
      });
    }

    return { reconcile, onEventPersisted, onHubMutationApplied };
  }

  function installBrowserReconciliation(root) {
    const runtime = root?.PlennusAppointmentWorkflowRuntime;
    if (!runtime?.core) return null;
    if (root.PlennusAppointmentReconciliation) return root.PlennusAppointmentReconciliation;
    const api = createAppointmentReconciliation({
      core: runtime.core,
      isRemoteProfessionalMode: () => Boolean(root.PlennusClinicNetwork?.isRemoteProfessionalMode?.()),
      logger: root.console || null
    });
    root.PlennusAppointmentReconciliation = api;
    if (typeof document !== 'undefined') {
      document.addEventListener('DOMContentLoaded', () => { api.reconcile().catch(() => {}); }, { once: true });
    }
    return api;
  }

  const api = { createAppointmentReconciliation, installBrowserReconciliation };
  if (typeof window !== 'undefined') installBrowserReconciliation(window);
  return api;
});
