(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkflowCoreSqliteStore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SCHEMA_SQL = Object.freeze([
    `CREATE TABLE IF NOT EXISTS workflow_domain_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      mutation_id TEXT,
      source TEXT NOT NULL,
      actor_json TEXT,
      payload_json TEXT,
      occurred_at TEXT NOT NULL,
      dispatched_at TEXT,
      last_error TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_workflow_domain_events_pending
      ON workflow_domain_events(dispatched_at, occurred_at)`,
    `CREATE INDEX IF NOT EXISTS idx_workflow_domain_events_aggregate
      ON workflow_domain_events(aggregate_type, aggregate_id, occurred_at)`,
    `CREATE TABLE IF NOT EXISTS workflow_effects (
      event_id TEXT NOT NULL,
      effect_key TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      meta_json TEXT,
      PRIMARY KEY (event_id, effect_key)
    )`
  ]);

  function parseJson(value, fallback) {
    if (value == null || value === '') return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function normalizeEventRow(row) {
    if (!row) return null;
    return {
      eventId: row.event_id,
      type: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      mutationId: row.mutation_id || null,
      source: row.source,
      actor: parseJson(row.actor_json, {}),
      payload: parseJson(row.payload_json, {}),
      occurredAt: row.occurred_at,
      dispatchedAt: row.dispatched_at || null,
      lastError: row.last_error || null
    };
  }

  function normalizeEffectRow(row) {
    if (!row) return null;
    return {
      eventId: row.event_id,
      effectKey: row.effect_key,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      appliedAt: row.applied_at,
      meta: parseJson(row.meta_json, null)
    };
  }

  function createSqliteWorkflowStore({ query, run } = {}) {
    if (typeof query !== 'function' || typeof run !== 'function') throw new Error('SQLite workflow store requires query and run functions.');

    async function ensureSchema() {
      for (const statement of SCHEMA_SQL) run(statement, []);
      return true;
    }

    async function appendEvent(event) {
      const eventId = String(event?.eventId || '').trim();
      if (!eventId) throw new Error('eventId is required.');
      const existing = query('SELECT event_id FROM workflow_domain_events WHERE event_id=? LIMIT 1', [eventId]);
      if (existing.length) throw new Error(`Event already exists: ${eventId}`);
      run(`INSERT INTO workflow_domain_events
        (event_id,event_type,aggregate_type,aggregate_id,mutation_id,source,actor_json,payload_json,occurred_at,dispatched_at,last_error)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
        eventId,
        String(event.type || ''),
        String(event.aggregateType || ''),
        String(event.aggregateId ?? ''),
        event.mutationId || null,
        String(event.source || ''),
        JSON.stringify(event.actor || {}),
        JSON.stringify(event.payload || {}),
        String(event.occurredAt || ''),
        event.dispatchedAt || null,
        event.lastError || null
      ]);
      return getEvent(eventId);
    }

    async function getEvent(eventId) {
      return normalizeEventRow(query('SELECT * FROM workflow_domain_events WHERE event_id=? LIMIT 1', [String(eventId || '')])[0]);
    }

    function listEventsQuery({ limit = 100, aggregateType = null, aggregateId = null } = {}, pendingOnly = false) {
      const where = [];
      const params = [];
      if (pendingOnly) where.push('dispatched_at IS NULL');
      if (aggregateType != null) { where.push('aggregate_type=?'); params.push(String(aggregateType)); }
      if (aggregateId != null) { where.push('aggregate_id=?'); params.push(String(aggregateId)); }
      const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 100));
      params.push(safeLimit);
      const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      return query(`SELECT * FROM workflow_domain_events${clause} ORDER BY occurred_at,event_id LIMIT ?`, params).map(normalizeEventRow);
    }

    async function listPendingEvents(filters = {}) {
      return listEventsQuery(filters, true);
    }

    async function listEvents(filters = {}) {
      return listEventsQuery(filters, false);
    }

    async function markEventDispatched(eventId, dispatchedAt) {
      run('UPDATE workflow_domain_events SET dispatched_at=?,last_error=NULL WHERE event_id=?', [String(dispatchedAt || ''), String(eventId || '')]);
      return getEvent(eventId);
    }

    async function markEventError(eventId, errorMessage) {
      run('UPDATE workflow_domain_events SET last_error=? WHERE event_id=?', [errorMessage == null ? null : String(errorMessage), String(eventId || '')]);
      return getEvent(eventId);
    }

    async function hasEffect(eventId, effectKey) {
      return query('SELECT 1 AS found FROM workflow_effects WHERE event_id=? AND effect_key=? LIMIT 1', [String(eventId || ''), String(effectKey || '')]).length > 0;
    }

    async function markEffectApplied(eventId, effectKey, meta = {}) {
      if (await hasEffect(eventId, effectKey)) return (await listEffects(eventId)).find(item => item.effectKey === String(effectKey || '')) || null;
      const appliedAt = meta.appliedAt || new Date().toISOString();
      const storedMeta = meta.meta ?? meta.result ?? null;
      run(`INSERT INTO workflow_effects
        (event_id,effect_key,aggregate_type,aggregate_id,applied_at,meta_json)
        VALUES (?,?,?,?,?,?)`, [
        String(eventId || ''),
        String(effectKey || ''),
        String(meta.aggregateType || ''),
        String(meta.aggregateId ?? ''),
        String(appliedAt),
        storedMeta == null ? null : JSON.stringify(storedMeta)
      ]);
      return (await listEffects(eventId)).find(item => item.effectKey === String(effectKey || '')) || null;
    }

    async function listEffects(eventId) {
      return query('SELECT * FROM workflow_effects WHERE event_id=? ORDER BY applied_at,effect_key', [String(eventId || '')]).map(normalizeEffectRow);
    }

    return {
      ensureSchema,
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

  return { createSqliteWorkflowStore, SCHEMA_SQL, normalizeEventRow, normalizeEffectRow };
});
