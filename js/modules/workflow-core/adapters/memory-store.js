(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkflowCoreMemoryStore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function createMemoryWorkflowStore() {
    const events = new Map();
    const effects = new Map();

    async function appendEvent(event) {
      const eventId = String(event?.eventId || '').trim();
      if (!eventId) throw new Error('eventId is required.');
      if (events.has(eventId)) throw new Error(`Event already exists: ${eventId}`);
      const record = {
        ...clone(event),
        eventId,
        aggregateType: String(event.aggregateType || ''),
        aggregateId: String(event.aggregateId ?? ''),
        dispatchedAt: event.dispatchedAt || null,
        lastError: event.lastError || null
      };
      events.set(eventId, record);
      return clone(record);
    }

    async function getEvent(eventId) {
      return clone(events.get(String(eventId || '')) || null);
    }

    function filterEvents({ limit = 100, aggregateType = null, aggregateId = null } = {}, pendingOnly = false) {
      return [...events.values()]
        .filter(event => !pendingOnly || !event.dispatchedAt)
        .filter(event => aggregateType == null || event.aggregateType === String(aggregateType))
        .filter(event => aggregateId == null || event.aggregateId === String(aggregateId))
        .sort((a, b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || '')))
        .slice(0, Math.max(0, Number(limit) || 0))
        .map(clone);
    }

    async function listPendingEvents(filters = {}) {
      return filterEvents(filters, true);
    }

    async function listEvents(filters = {}) {
      return filterEvents(filters, false);
    }

    async function markEventDispatched(eventId, dispatchedAt) {
      const key = String(eventId || '');
      const event = events.get(key);
      if (!event) throw new Error(`Event not found: ${key}`);
      event.dispatchedAt = String(dispatchedAt || '');
      event.lastError = null;
      return clone(event);
    }

    async function markEventError(eventId, errorMessage) {
      const key = String(eventId || '');
      const event = events.get(key);
      if (!event) throw new Error(`Event not found: ${key}`);
      event.lastError = errorMessage == null ? null : String(errorMessage);
      return clone(event);
    }

    async function hasEffect(eventId, effectKey) {
      return effects.get(String(eventId || ''))?.has(String(effectKey || '')) || false;
    }

    async function markEffectApplied(eventId, effectKey, meta = {}) {
      const eventKey = String(eventId || '').trim();
      const effect = String(effectKey || '').trim();
      if (!eventKey || !effect) throw new Error('eventId and effectKey are required.');
      if (!effects.has(eventKey)) effects.set(eventKey, new Map());
      const map = effects.get(eventKey);
      if (map.has(effect)) return clone(map.get(effect));
      const record = {
        eventId: eventKey,
        effectKey: effect,
        aggregateType: String(meta.aggregateType || ''),
        aggregateId: String(meta.aggregateId ?? ''),
        appliedAt: meta.appliedAt || new Date().toISOString(),
        meta: clone(meta.meta ?? meta.result ?? null)
      };
      map.set(effect, record);
      return clone(record);
    }

    async function listEffects(eventId) {
      const map = effects.get(String(eventId || ''));
      return map ? [...map.values()].map(clone) : [];
    }

    return {
      appendEvent,
      getEvent,
      listEvents,
      listPendingEvents,
      markEventDispatched,
      markEventError,
      hasEffect,
      markEffectApplied,
      listEffects
    };
  }

  return { createMemoryWorkflowStore };
});
