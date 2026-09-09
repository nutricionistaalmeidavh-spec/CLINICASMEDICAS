(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkflowCoreOutbox = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function createOutbox({ store } = {}) {
    if (!store) throw new Error('Workflow store is required.');
    const required = ['appendEvent', 'getEvent', 'listPendingEvents', 'markEventDispatched', 'markEventError'];
    for (const method of required) {
      if (typeof store[method] !== 'function') throw new Error(`Workflow store is missing ${method}().`);
    }
    return {
      append: event => store.appendEvent(event),
      get: eventId => store.getEvent(eventId),
      pending: filters => store.listPendingEvents(filters),
      markDispatched: (eventId, dispatchedAt) => store.markEventDispatched(eventId, dispatchedAt),
      markError: (eventId, errorMessage) => store.markEventError(eventId, errorMessage)
    };
  }

  return { createOutbox };
});
