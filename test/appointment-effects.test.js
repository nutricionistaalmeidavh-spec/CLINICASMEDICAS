const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkflowCore } = require('../js/modules/workflow-core/workflow-core');
const { createMemoryWorkflowStore } = require('../js/modules/workflow-core/adapters/memory-store');

function loadModule(path, label) {
  try { return require(path); }
  catch (error) { assert.fail(`${label} unavailable: ${error.message}`); }
}

function completedEvent(overrides = {}) {
  return {
    eventId: 'evt-complete-42',
    type: 'appointment.completed',
    aggregateType: 'appointment',
    aggregateId: 42,
    occurredAt: '2026-09-09T13:10:00.000Z',
    actor: { userId: 7, role: 'medico', professionalId: 3 },
    source: 'hub',
    mutationId: null,
    payload: { professionalId: 3, patientId: 11, procedureId: 5 }
    ,...overrides
  };
}

function createServices({ failInventoryOnce = false, dental = false } = {}) {
  const calls = [];
  let inventoryAttempts = 0;
  return {
    calls,
    services: {
      dentalFinance: {
        isDentalAppointment(id) { calls.push(['dental-check', id]); return dental; },
        onAppointmentStatusChanged(id, status) { calls.push(['dental-finance', id, status]); return true; }
      },
      odontology: { onAppointmentStatusChanged(id, status) { calls.push(['odontology', id, status]); } },
      crm: { onAppointmentStatusChanged(id, status) { calls.push(['crm', id, status]); } },
      finance: { onAppointmentStatusChanged(id, status) { calls.push(['finance', id, status]); } },
      inventory: {
        consumeForAppointment(id) {
          inventoryAttempts += 1;
          calls.push(['inventory', id, inventoryAttempts]);
          if (failInventoryOnce && inventoryAttempts === 1) throw new Error('stock unavailable');
          return { consumed: 1 };
        }
      },
      whatsapp: {
        syncAppointmentMessages(id) { calls.push(['whatsapp-sync', id]); },
        cancelAppointmentMessages(id) { calls.push(['whatsapp-cancel', id]); }
      }
    }
  };
}

test('appointment.completed effects execute once and are not duplicated on later reconciliation', async () => {
  const { registerAppointmentEffects } = loadModule('../js/domains/appointment-effects', 'appointment effects');
  const store = createMemoryWorkflowStore();
  const core = createWorkflowCore({ store, clock: () => '2026-09-09T13:11:00.000Z' });
  const harness = createServices();
  registerAppointmentEffects(core, harness.services);
  await core.appendEvent(completedEvent());

  await core.dispatchPending();
  await core.dispatchPending();

  assert.equal(harness.calls.filter(call => call[0] === 'finance').length, 1);
  assert.equal(harness.calls.filter(call => call[0] === 'inventory').length, 1);
  assert.equal(harness.calls.filter(call => call[0] === 'crm').length, 1);
  assert.equal(harness.calls.filter(call => call[0] === 'whatsapp-cancel').length, 1);
});

test('failed required effect retries alone while successful effects stay applied', async () => {
  const { registerAppointmentEffects } = loadModule('../js/domains/appointment-effects', 'appointment effects');
  const store = createMemoryWorkflowStore();
  const core = createWorkflowCore({ store, clock: () => '2026-09-09T13:12:00.000Z' });
  const harness = createServices({ failInventoryOnce: true });
  registerAppointmentEffects(core, harness.services);
  await core.appendEvent(completedEvent({ eventId: 'evt-retry-42' }));

  const first = await core.dispatchPending();
  const second = await core.dispatchPending();

  assert.equal(first.failed, 1);
  assert.equal(second.dispatched, 1);
  assert.equal(harness.calls.filter(call => call[0] === 'finance').length, 1);
  assert.equal(harness.calls.filter(call => call[0] === 'crm').length, 1);
  assert.equal(harness.calls.filter(call => call[0] === 'inventory').length, 2);
});

test('dental appointments use dental finance instead of generic appointment finance', async () => {
  const { registerAppointmentEffects } = loadModule('../js/domains/appointment-effects', 'appointment effects');
  const store = createMemoryWorkflowStore();
  const core = createWorkflowCore({ store });
  const harness = createServices({ dental: true });
  registerAppointmentEffects(core, harness.services);
  await core.appendEvent(completedEvent({ eventId: 'evt-dental-42' }));

  await core.dispatchPending();

  assert.equal(harness.calls.filter(call => call[0] === 'dental-finance').length, 1);
  assert.equal(harness.calls.filter(call => call[0] === 'finance').length, 0);
});

test('cancelled appointment cancels financial and WhatsApp side effects without consuming inventory', async () => {
  const { registerAppointmentEffects } = loadModule('../js/domains/appointment-effects', 'appointment effects');
  const store = createMemoryWorkflowStore();
  const core = createWorkflowCore({ store });
  const harness = createServices();
  registerAppointmentEffects(core, harness.services);
  await core.appendEvent({ ...completedEvent({ eventId: 'evt-cancel-42' }), type: 'appointment.cancelled' });

  await core.dispatchPending();

  assert.deepEqual(harness.calls.find(call => call[0] === 'finance').slice(1), [42, 'cancelado']);
  assert.equal(harness.calls.filter(call => call[0] === 'whatsapp-cancel').length, 1);
  assert.equal(harness.calls.filter(call => call[0] === 'inventory').length, 0);
});
