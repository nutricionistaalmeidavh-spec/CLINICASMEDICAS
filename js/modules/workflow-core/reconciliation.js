(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkflowCoreReconciliation = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function createReconciler({ store, effectRunner, clock = () => new Date().toISOString(), logger = null } = {}) {
    if (!store || typeof store.listPendingEvents !== 'function') throw new Error('Workflow store is required.');
    if (!effectRunner || typeof effectRunner.run !== 'function') throw new Error('Workflow effect runner is required.');

    async function reconcile({ limit = 100, aggregateType = null, aggregateId = null, context = {} } = {}) {
      const pending = await store.listPendingEvents({ limit, aggregateType, aggregateId });
      const report = { processed: 0, dispatched: 0, failed: 0, events: [] };
      for (const event of pending) {
        report.processed += 1;
        const effectReport = await effectRunner.run(event, context);
        const requiredFailures = effectReport.effects.filter(effect => effect.status === 'failed' && !effect.optional);
        if (requiredFailures.length) {
          const message = requiredFailures.map(effect => `${effect.effectKey}: ${effect.error}`).join('; ');
          await store.markEventError(event.eventId, message);
          report.failed += 1;
          logger?.warn?.('Workflow event remains pending.', { eventId: event.eventId, error: message });
          report.events.push({ eventId: event.eventId, status: 'failed', effects: effectReport.effects });
          continue;
        }
        const dispatchedAt = clock();
        await store.markEventDispatched(event.eventId, dispatchedAt);
        report.dispatched += 1;
        report.events.push({ eventId: event.eventId, status: 'dispatched', dispatchedAt, effects: effectReport.effects });
      }
      return report;
    }

    return { reconcile };
  }

  return { createReconciler };
});
