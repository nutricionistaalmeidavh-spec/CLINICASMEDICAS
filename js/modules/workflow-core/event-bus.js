(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkflowCoreEventBus = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function createEventBus() {
    const subscribers = new Map();

    function subscriptionMap(eventType) {
      const type = String(eventType || '').trim();
      if (!type) throw new Error('eventType is required.');
      if (!subscribers.has(type)) subscribers.set(type, new Map());
      return subscribers.get(type);
    }

    function subscribe(eventType, effectKey, handler, options = {}) {
      const key = String(effectKey || '').trim();
      if (!key) throw new Error('effectKey is required.');
      if (typeof handler !== 'function') throw new TypeError('subscriber handler must be a function.');
      const map = subscriptionMap(eventType);
      if (map.has(key)) throw new Error(`Subscriber already registered for ${eventType}: ${key}`);
      map.set(key, { effectKey: key, handler, optional: options.optional === true });
      return () => unsubscribe(eventType, key);
    }

    function unsubscribe(eventType, effectKey) {
      const map = subscribers.get(String(eventType || '').trim());
      if (!map) return false;
      const removed = map.delete(String(effectKey || '').trim());
      if (!map.size) subscribers.delete(String(eventType || '').trim());
      return removed;
    }

    function subscribersFor(eventType) {
      const map = subscribers.get(String(eventType || '').trim());
      return map ? [...map.values()] : [];
    }

    async function publish(event, context = {}) {
      if (!event || !String(event.eventId || '').trim()) throw new Error('event.eventId is required.');
      if (!String(event.type || '').trim()) throw new Error('event.type is required.');
      const effects = [];
      for (const subscription of subscribersFor(event.type)) {
        try {
          const result = await subscription.handler(event, context);
          effects.push({
            effectKey: subscription.effectKey,
            status: 'applied',
            optional: subscription.optional,
            result: result ?? null,
            error: null
          });
        } catch (error) {
          effects.push({
            effectKey: subscription.effectKey,
            status: 'failed',
            optional: subscription.optional,
            result: null,
            error: error?.message || String(error)
          });
        }
      }
      return {
        eventId: event.eventId,
        effects,
        ok: effects.every(effect => effect.status === 'applied' || effect.optional)
      };
    }

    return {
      subscribe,
      unsubscribe,
      subscribersFor,
      publish
    };
  }

  return { createEventBus };
});
