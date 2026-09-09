const test = require('node:test');
const assert = require('node:assert/strict');

function loadModule(path, label) {
  try {
    return require(path);
  } catch (error) {
    assert.fail(`${label} unavailable: ${error.message}`);
  }
}

test('workflow engine emits the declared domain event for a valid transition', () => {
  const { createWorkflowEngine } = loadModule('../js/modules/workflow-core/workflow-engine', 'workflow engine');
  const engine = createWorkflowEngine({
    idGenerator: () => 'evt-1',
    clock: () => '2026-09-09T12:00:00.000Z'
  });
  engine.registerWorkflow('order', {
    aggregateType: 'order',
    transitions: {
      pay: { from: ['open'], to: 'paid', event: 'order.paid' }
    }
  });

  const result = engine.execute({
    workflow: 'order',
    action: 'pay',
    aggregateId: 7,
    currentState: 'open',
    actor: { userId: 1, role: 'admin' },
    source: 'standalone',
    payload: {}
  });

  assert.equal(result.transition.to, 'paid');
  assert.equal(result.transition.from, 'open');
  assert.equal(result.event.type, 'order.paid');
  assert.equal(result.event.eventId, 'evt-1');
  assert.equal(result.event.aggregateType, 'order');
  assert.equal(result.event.aggregateId, 7);
});

test('workflow engine rejects an invalid transition', () => {
  const { createWorkflowEngine } = loadModule('../js/modules/workflow-core/workflow-engine', 'workflow engine');
  const engine = createWorkflowEngine({ idGenerator: () => 'evt-2' });
  engine.registerWorkflow('order', {
    aggregateType: 'order',
    transitions: {
      pay: { from: ['open'], to: 'paid', event: 'order.paid' }
    }
  });

  assert.throws(() => engine.execute({
    workflow: 'order',
    action: 'pay',
    aggregateId: 7,
    currentState: 'paid',
    actor: { userId: 1, role: 'admin' },
    source: 'standalone',
    payload: {}
  }), /transition/i);
});

test('workflow engine honors workflow authorization callbacks', () => {
  const { createWorkflowEngine } = loadModule('../js/modules/workflow-core/workflow-engine', 'workflow engine');
  const engine = createWorkflowEngine({ idGenerator: () => 'evt-3' });
  engine.registerWorkflow('order', {
    aggregateType: 'order',
    transitions: {
      pay: { from: ['open'], to: 'paid', event: 'order.paid' }
    },
    authorize(context) {
      return context.actor?.role === 'admin';
    }
  });

  assert.throws(() => engine.execute({
    workflow: 'order',
    action: 'pay',
    aggregateId: 7,
    currentState: 'open',
    actor: { userId: 2, role: 'viewer' },
    source: 'standalone',
    payload: {}
  }), /authoriz|permiss|acesso/i);
});

test('event bus isolates subscriber failures and reports every effect', async () => {
  const { createEventBus } = loadModule('../js/modules/workflow-core/event-bus', 'event bus');
  const bus = createEventBus();
  bus.subscribe('order.paid', 'audit', async () => ({ ok: true }));
  bus.subscribe('order.paid', 'broken', async () => { throw new Error('boom'); });

  const report = await bus.publish({ eventId: 'evt-1', type: 'order.paid' });

  assert.equal(report.effects.length, 2);
  assert.equal(report.effects.find(item => item.effectKey === 'audit').status, 'applied');
  assert.equal(report.effects.find(item => item.effectKey === 'broken').status, 'failed');
  assert.equal(report.ok, false);
});

test('event bus rejects duplicate event/effect subscriptions', () => {
  const { createEventBus } = loadModule('../js/modules/workflow-core/event-bus', 'event bus');
  const bus = createEventBus();
  const handler = async () => ({ ok: true });
  bus.subscribe('order.paid', 'audit', handler);
  assert.throws(() => bus.subscribe('order.paid', 'audit', handler), /duplicate|registered|exists/i);
});
