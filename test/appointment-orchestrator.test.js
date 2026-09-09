const test = require('node:test');
const assert = require('node:assert/strict');

function loadModule(path, label) {
  try { return require(path); }
  catch (error) { assert.fail(`${label} unavailable: ${error.message}`); }
}

function appointment(overrides = {}) {
  return {
    id: 42,
    paciente_id: 11,
    profissional_id: 3,
    procedimento_id: 5,
    convenio_id: null,
    status: 'atendimento',
    chegada_em: '10:00',
    ...overrides
  };
}

function createHarness({ remote = false, row = appointment(), actor = { userId: 7, role: 'medico', professionalId: 3 }, networkResult = { ok: true, queued: false } } = {}) {
  const { createAppointmentOrchestrator } = loadModule('../js/domains/appointment-orchestrator', 'appointment orchestrator');
  const calls = [];
  let current = { ...row };
  const events = [];
  const core = {
    execute(command) {
      calls.push(['execute', command]);
      const map = {
        confirm: ['confirmado', 'appointment.confirmed'],
        arrive: ['espera', 'patient.arrived'],
        start: ['atendimento', 'appointment.started'],
        complete: ['realizado', 'appointment.completed'],
        cancel: ['cancelado', 'appointment.cancelled']
      };
      const [to, type] = map[command.action];
      if (command.actor.role === 'medico' && Number(command.actor.professionalId) !== Number(command.payload.professionalId)) {
        throw new Error('Workflow authorization denied.');
      }
      return {
        ok: true,
        transition: { workflow: 'appointment', aggregateType: 'appointment', aggregateId: command.aggregateId, from: command.currentState, to, action: command.action },
        event: { eventId: `evt-${command.action}`, type, aggregateType: 'appointment', aggregateId: command.aggregateId, occurredAt: '2026-09-09T13:00:00.000Z', actor: command.actor, source: command.source, mutationId: null, payload: command.payload }
      };
    },
    appendEvent(event) {
      calls.push(['appendEvent', event]);
      events.push(event);
      return event;
    }
  };
  const db = {
    query(sql, params) {
      calls.push(['query', sql, params]);
      if (/FROM agenda/i.test(sql)) return current ? [{ ...current }] : [];
      return [];
    },
    run(sql, params) {
      calls.push(['run', sql, params]);
      if (/UPDATE agenda SET status=\?, chegada_em=\?/i.test(sql)) {
        current.status = params[0];
        current.chegada_em = params[1];
      } else if (/UPDATE agenda SET status=\?/i.test(sql)) {
        current.status = params[0];
      }
    }
  };
  const transact = work => {
    calls.push(['begin']);
    const result = work();
    calls.push(['commit']);
    return result;
  };
  const networkMutate = async (command, data) => {
    calls.push(['networkMutate', command, data]);
    return networkResult;
  };
  const orchestrator = createAppointmentOrchestrator({
    core,
    db,
    transact,
    getActor: () => actor,
    isRemoteProfessionalMode: () => remote,
    networkMutate,
    refresh: () => calls.push(['refresh']),
    openPep: (...args) => calls.push(['openPep', ...args]),
    nowTime: () => '10:05',
    onEventPersisted: event => calls.push(['onEventPersisted', event.eventId])
  });
  return { orchestrator, calls, events, getCurrent: () => ({ ...current }) };
}

test('local completion persists appointment status and outbox event inside one host transaction', async () => {
  const { orchestrator, calls, events, getCurrent } = createHarness({ remote: false });

  const result = await orchestrator.complete(42);

  assert.equal(result.ok, true);
  assert.equal(getCurrent().status, 'realizado');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'appointment.completed');
  const begin = calls.findIndex(call => call[0] === 'begin');
  const update = calls.findIndex(call => call[0] === 'run' && /UPDATE agenda/i.test(call[1]));
  const append = calls.findIndex(call => call[0] === 'appendEvent');
  const commit = calls.findIndex(call => call[0] === 'commit');
  assert.ok(begin < update && update < append && append < commit);
});

test('remote professional completion mutates the Hub but never appends a local administrative event', async () => {
  const { orchestrator, calls, events, getCurrent } = createHarness({ remote: true });

  const result = await orchestrator.complete(42);

  assert.equal(result.ok, true);
  assert.equal(getCurrent().status, 'realizado');
  assert.equal(events.length, 0);
  const mutation = calls.find(call => call[0] === 'networkMutate');
  assert.equal(mutation[1], 'agenda.updateStatus');
  assert.equal(mutation[2].appointmentId, 42);
  assert.equal(mutation[2].status, 'realizado');
});

test('remote professional cannot start another professional appointment', async () => {
  const { orchestrator, calls } = createHarness({
    remote: true,
    row: appointment({ status: 'espera', profissional_id: 9 }),
    actor: { userId: 7, role: 'medico', professionalId: 3 }
  });

  await assert.rejects(() => orchestrator.start(42), /authoriz|acesso|permiss/i);
  assert.equal(calls.some(call => call[0] === 'networkMutate'), false);
});

test('arrival persists arrival time and emits patient.arrived', async () => {
  const { orchestrator, events, getCurrent } = createHarness({
    remote: false,
    row: appointment({ status: 'confirmado', chegada_em: null }),
    actor: { userId: 2, role: 'recepcao', professionalId: null }
  });

  await orchestrator.arrive(42);

  assert.equal(getCurrent().status, 'espera');
  assert.equal(getCurrent().chegada_em, '10:05');
  assert.equal(events[0].type, 'patient.arrived');
});
