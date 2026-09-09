const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryWorkflowStore } = require('../js/modules/workflow-core/adapters/memory-store');

function loadModule(path, label) {
  try { return require(path); }
  catch (error) { assert.fail(`${label} unavailable: ${error.message}`); }
}

test('Workflow Core public factory can execute, persist and dispatch a workflow event', async () => {
  const { createWorkflowCore } = loadModule('../js/modules/workflow-core/workflow-core', 'Workflow Core');
  const store = createMemoryWorkflowStore();
  const core = createWorkflowCore({
    store,
    idGenerator: () => 'evt-api-1',
    clock: () => '2026-09-09T12:00:00.000Z'
  });

  core.registerWorkflow('order', {
    aggregateType: 'order',
    transitions: {
      pay: { from: ['open'], to: 'paid', event: 'order.paid' }
    }
  });
  let called = 0;
  core.registerEffect('order.paid', 'audit', async () => { called += 1; });

  const executed = core.execute({
    workflow: 'order',
    action: 'pay',
    aggregateId: 1,
    currentState: 'open',
    actor: { role: 'admin' },
    source: 'standalone'
  });
  await core.appendEvent(executed.event);
  const report = await core.dispatchPending();

  assert.equal(called, 1);
  assert.equal(report.dispatched, 1);
  assert.equal((await core.inspect('order', 1)).events.length, 1);
});

test('Workflow Core exposes the same factory through its neutral browser global', () => {
  const api = loadModule('../js/modules/workflow-core/workflow-core', 'Workflow Core');
  assert.equal(typeof api.createWorkflowCore, 'function');
  assert.equal(typeof globalThis.WorkflowCore?.createWorkflowCore, 'function');
});
