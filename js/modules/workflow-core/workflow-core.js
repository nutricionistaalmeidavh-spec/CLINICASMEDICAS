(function (root, factory) {
  const deps = typeof module === 'object' && module.exports
    ? {
        engine: require('./workflow-engine'),
        bus: require('./event-bus'),
        runner: require('./effect-runner'),
        reconciliation: require('./reconciliation'),
        outbox: require('./outbox')
      }
    : {
        engine: root.WorkflowCoreEngine,
        bus: root.WorkflowCoreEventBus,
        runner: root.WorkflowCoreEffectRunner,
        reconciliation: root.WorkflowCoreReconciliation,
        outbox: root.WorkflowCoreOutbox
      };
  const api = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkflowCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function (deps) {
  function createWorkflowCore({ store, idGenerator, clock, logger = null } = {}) {
    if (!store) throw new Error('Workflow store is required.');
    const engine = deps.engine.createWorkflowEngine({ idGenerator, clock });
    const bus = deps.bus.createEventBus();
    const effectRunner = deps.runner.createEffectRunner({ bus, store, clock });
    const reconciler = deps.reconciliation.createReconciler({ store, effectRunner, clock, logger });
    const outbox = deps.outbox.createOutbox({ store });

    function registerWorkflow(name, definition) {
      return engine.registerWorkflow(name, definition);
    }

    function registerEffect(eventType, effectKey, handler, options = {}) {
      return bus.subscribe(eventType, effectKey, handler, options);
    }

    function execute(command) {
      return engine.execute(command);
    }

    function appendEvent(event) {
      return outbox.append(event);
    }

    function dispatchPending(options = {}) {
      return reconciler.reconcile(options);
    }

    function reconcile(options = {}) {
      return reconciler.reconcile(options);
    }

    async function inspect(aggregateType, aggregateId, { limit = 100 } = {}) {
      const filters = { limit, aggregateType, aggregateId };
      const events = typeof store.listEvents === 'function'
        ? await store.listEvents(filters)
        : await store.listPendingEvents(filters);
      const enriched = [];
      for (const event of events) {
        enriched.push({
          ...event,
          effects: typeof store.listEffects === 'function' ? await store.listEffects(event.eventId) : []
        });
      }
      return { aggregateType: String(aggregateType || ''), aggregateId: String(aggregateId ?? ''), events: enriched };
    }

    return {
      registerWorkflow,
      registerEffect,
      execute,
      appendEvent,
      dispatchPending,
      reconcile,
      inspect,
      engine,
      bus,
      store
    };
  }

  return { createWorkflowCore };
});
