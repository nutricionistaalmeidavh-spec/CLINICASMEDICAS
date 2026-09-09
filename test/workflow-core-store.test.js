const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventBus } = require('../js/modules/workflow-core/event-bus');

function loadModule(path, label) {
  try {
    return require(path);
  } catch (error) {
    assert.fail(`${label} unavailable: ${error.message}`);
  }
}

function sampleEvent(overrides = {}) {
  return {
    eventId: 'evt-1',
    type: 'order.paid',
    aggregateType: 'order',
    aggregateId: '7',
    occurredAt: '2026-09-09T12:00:00.000Z',
    source: 'standalone',
    actor: { userId: 1, role: 'admin' },
    payload: {},
    mutationId: null,
    ...overrides
  };
}

test('memory store rejects duplicate event ids', async () => {
  const { createMemoryWorkflowStore } = loadModule('../js/modules/workflow-core/adapters/memory-store', 'memory workflow store');
  const store = createMemoryWorkflowStore();
  const event = sampleEvent();
  await store.appendEvent(event);
  await assert.rejects(() => store.appendEvent(event), /duplicate|exists/i);
});

test('effect runner skips an already applied event/effect pair', async () => {
  const { createMemoryWorkflowStore } = loadModule('../js/modules/workflow-core/adapters/memory-store', 'memory workflow store');
  const { createEffectRunner } = loadModule('../js/modules/workflow-core/effect-runner', 'effect runner');
  const store = createMemoryWorkflowStore();
  let calls = 0;
  const bus = createEventBus();
  bus.subscribe('order.paid', 'cash.register', async () => { calls += 1; });
  const runner = createEffectRunner({ bus, store });
  const event = sampleEvent({ eventId: 'evt-2' });

  const first = await runner.run(event);
  const second = await runner.run(event);

  assert.equal(calls, 1);
  assert.equal(first.effects[0].status, 'applied');
  assert.equal(second.effects[0].status, 'skipped');
  assert.equal(await store.hasEffect('evt-2', 'cash.register'), true);
});

test('reconciliation keeps event pending when a required effect fails', async () => {
  const { createMemoryWorkflowStore } = loadModule('../js/modules/workflow-core/adapters/memory-store', 'memory workflow store');
  const { createEffectRunner } = loadModule('../js/modules/workflow-core/effect-runner', 'effect runner');
  const { createReconciler } = loadModule('../js/modules/workflow-core/reconciliation', 'reconciler');
  const store = createMemoryWorkflowStore();
  const bus = createEventBus();
  bus.subscribe('order.paid', 'required.failure', async () => { throw new Error('temporary failure'); });
  const event = sampleEvent({ eventId: 'evt-3' });
  await store.appendEvent(event);
  const reconciler = createReconciler({ store, effectRunner: createEffectRunner({ bus, store }), clock: () => '2026-09-09T12:30:00.000Z' });

  const report = await reconciler.reconcile();
  const persisted = await store.getEvent('evt-3');

  assert.equal(report.failed, 1);
  assert.equal(persisted.dispatchedAt, null);
  assert.match(persisted.lastError, /temporary failure/);
});

test('optional effect failure does not block event dispatch', async () => {
  const { createMemoryWorkflowStore } = loadModule('../js/modules/workflow-core/adapters/memory-store', 'memory workflow store');
  const { createEffectRunner } = loadModule('../js/modules/workflow-core/effect-runner', 'effect runner');
  const { createReconciler } = loadModule('../js/modules/workflow-core/reconciliation', 'reconciler');
  const store = createMemoryWorkflowStore();
  const bus = createEventBus();
  bus.subscribe('order.paid', 'required.success', async () => ({ ok: true }));
  bus.subscribe('order.paid', 'optional.failure', async () => { throw new Error('optional failed'); }, { optional: true });
  const event = sampleEvent({ eventId: 'evt-4' });
  await store.appendEvent(event);
  const reconciler = createReconciler({ store, effectRunner: createEffectRunner({ bus, store }), clock: () => '2026-09-09T12:31:00.000Z' });

  const report = await reconciler.reconcile();
  const persisted = await store.getEvent('evt-4');

  assert.equal(report.dispatched, 1);
  assert.equal(persisted.dispatchedAt, '2026-09-09T12:31:00.000Z');
});

test('sqlite adapter serializes an outbox event through injected query/run functions', async () => {
  const { createSqliteWorkflowStore } = loadModule('../js/modules/workflow-core/adapters/sqlite-store', 'sqlite workflow store');
  const calls = [];
  const store = createSqliteWorkflowStore({
    query(sql, params = []) {
      calls.push({ kind: 'query', sql, params });
      return [];
    },
    run(sql, params = []) {
      calls.push({ kind: 'run', sql, params });
    }
  });

  await store.appendEvent(sampleEvent({ eventId: 'evt-sql' }));

  const insert = calls.find(call => call.kind === 'run' && /INSERT INTO workflow_domain_events/i.test(call.sql));
  assert.ok(insert);
  assert.match(String(insert.params[6]), /"role":"admin"/);
});
