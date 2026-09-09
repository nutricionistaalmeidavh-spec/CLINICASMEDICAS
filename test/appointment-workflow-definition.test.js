const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkflowEngine } = require('../js/modules/workflow-core/workflow-engine');

function loadDefinition() {
  try { return require('../js/domains/appointment-workflow-definition'); }
  catch (error) { assert.fail(`appointment workflow definition unavailable: ${error.message}`); }
}

function command(action, currentState, actor, professionalId = 3) {
  return {
    workflow: 'appointment',
    action,
    aggregateId: 42,
    currentState,
    actor,
    source: actor.role === 'medico' ? 'remote-professional' : 'hub',
    payload: { professionalId }
  };
}

test('reception can move an appointment through confirmation and arrival but cannot start care', () => {
  const { createAppointmentWorkflowDefinition } = loadDefinition();
  const engine = createWorkflowEngine({ idGenerator: () => 'evt-1' });
  engine.registerWorkflow('appointment', createAppointmentWorkflowDefinition());
  assert.equal(engine.execute(command('confirm', 'agendado', { userId: 1, role: 'recepcao' })).transition.to, 'confirmado');
  assert.equal(engine.execute(command('arrive', 'confirmado', { userId: 1, role: 'recepcao' })).transition.to, 'espera');
  assert.throws(() => engine.execute(command('start', 'espera', { userId: 1, role: 'recepcao' })), /authoriz|acesso|permiss/i);
});

test('professional can start and complete only their own appointment', () => {
  const { createAppointmentWorkflowDefinition } = loadDefinition();
  const engine = createWorkflowEngine({ idGenerator: () => 'evt-2' });
  engine.registerWorkflow('appointment', createAppointmentWorkflowDefinition());
  const own = { userId: 7, role: 'medico', professionalId: 3 };
  assert.equal(engine.execute(command('start', 'espera', own, 3)).event.type, 'appointment.started');
  assert.equal(engine.execute(command('complete', 'atendimento', own, 3)).event.type, 'appointment.completed');
  assert.throws(() => engine.execute(command('start', 'espera', own, 9)), /authoriz|acesso|permiss/i);
});

test('terminal appointment states cannot transition through the normal workflow', () => {
  const { createAppointmentWorkflowDefinition } = loadDefinition();
  const engine = createWorkflowEngine({ idGenerator: () => 'evt-3' });
  engine.registerWorkflow('appointment', createAppointmentWorkflowDefinition());
  assert.throws(() => engine.execute(command('complete', 'realizado', { userId: 1, role: 'admin' })), /transition/i);
  assert.throws(() => engine.execute(command('cancel', 'cancelado', { userId: 1, role: 'admin' })), /transition/i);
});

test('appointment workflow uses stable event names for every operational transition', () => {
  const { createAppointmentWorkflowDefinition } = loadDefinition();
  const definition = createAppointmentWorkflowDefinition();
  assert.equal(definition.transitions.confirm.event, 'appointment.confirmed');
  assert.equal(definition.transitions.arrive.event, 'patient.arrived');
  assert.equal(definition.transitions.start.event, 'appointment.started');
  assert.equal(definition.transitions.complete.event, 'appointment.completed');
  assert.equal(definition.transitions.cancel.event, 'appointment.cancelled');
});
