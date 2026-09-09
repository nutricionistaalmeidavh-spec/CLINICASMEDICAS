(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkflowCoreEffectRunner = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function createEffectRunner({ bus, store, clock = () => new Date().toISOString() } = {}) {
    if (!bus || typeof bus.subscribersFor !== 'function') throw new Error('Workflow event bus is required.');
    if (!store || typeof store.hasEffect !== 'function' || typeof store.markEffectApplied !== 'function') {
      throw new Error('Workflow store with effect tracking is required.');
    }

    async function run(event, context = {}) {
      if (!event || !String(event.eventId || '').trim()) throw new Error('event.eventId is required.');
      if (!String(event.type || '').trim()) throw new Error('event.type is required.');
      const effects = [];
      for (const subscription of bus.subscribersFor(event.type)) {
        if (await store.hasEffect(event.eventId, subscription.effectKey)) {
          effects.push({
            effectKey: subscription.effectKey,
            status: 'skipped',
            optional: subscription.optional === true,
            result: null,
            error: null
          });
          continue;
        }
        try {
          const result = await subscription.handler(event, context);
          await store.markEffectApplied(event.eventId, subscription.effectKey, {
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            appliedAt: clock(),
            result: result ?? null
          });
          effects.push({
            effectKey: subscription.effectKey,
            status: 'applied',
            optional: subscription.optional === true,
            result: result ?? null,
            error: null
          });
        } catch (error) {
          effects.push({
            effectKey: subscription.effectKey,
            status: 'failed',
            optional: subscription.optional === true,
            result: null,
            error: error?.message || String(error)
          });
        }
      }
      return {
        eventId: event.eventId,
        effects,
        ok: effects.every(effect => effect.status !== 'failed' || effect.optional)
      };
    }

    return { run };
  }

  return { createEffectRunner };
});
