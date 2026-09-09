# Workflow Core Reusable Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um módulo reutilizável de orquestração de processos (`Workflow Core`) e migrar o fluxo de atendimento do Plennus Clinic para usá-lo sem perder funcionalidades, isolamento clínico, operação LAN ou modo offline.

**Architecture:** O núcleo ficará em `js/modules/workflow-core/` e será agnóstico de produto, UI, Electron e `sql.js`. O Plennus registrará seu workflow de atendimento e seus efeitos em módulos de domínio; o Clinic Hub continuará autoridade do `clinic.db` e gravará mudança de estado + outbox na mesma transação canônica. A migração será incremental, mantendo funções globais legadas como adapters até o fim.

**Tech Stack:** JavaScript CommonJS/UMD, Node test runner (`node --test`), Electron 44, `sql.js` 1.10.3, SQLite local, Clinic Hub LAN existente.

**Spec:** `docs/superpowers/specs/2026-09-09-workflow-core-reusable-module-design.md`

## Global Constraints

- Não adicionar dependências npm na v1.
- O Workflow Core não acessa DOM, Electron, filesystem, rede ou `sql.js` diretamente.
- Exportar por CommonJS e `globalThis.WorkflowCore`.
- `clinical.db` permanece local ao profissional e nunca trafega pela LAN.
- Sem SQL remoto livre.
- Mudança de estado compartilhada + append da outbox devem ser atômicos no host Plennus.
- Efeitos devem ser idempotentes por `eventId + effectKey`.
- Falha de efeito não desfaz transição canônica já confirmada.
- APIs globais de Agenda permanecem compatíveis durante a migração.
- Não alterar React/framework, paleta ou UI nesta entrega.

---

## File Map

### Workflow Core genérico
- `js/modules/workflow-core/errors.js` — erros tipados do engine.
- `js/modules/workflow-core/event-bus.js` — registry e publicação de subscribers.
- `js/modules/workflow-core/workflow-engine.js` — validação e geração pura de transição/evento.
- `js/modules/workflow-core/effect-runner.js` — execução idempotente de efeitos.
- `js/modules/workflow-core/outbox.js` — façade de eventos duráveis.
- `js/modules/workflow-core/reconciliation.js` — retry/reconciliação de pendências.
- `js/modules/workflow-core/adapters/memory-store.js` — adapter sem persistência externa para testes/protótipos.
- `js/modules/workflow-core/adapters/sqlite-store.js` — adapter SQLite genérico por `query/run` injetados.
- `js/modules/workflow-core/workflow-core.js` — factory pública `createWorkflowCore`.

### Plennus consumidor
- `js/domains/appointment-workflow-definition.js` — estados, transições, papéis e ownership.
- `js/domains/appointment-orchestrator.js` — comandos UI/LAN e compatibilidade global.
- `js/domains/appointment-effects.js` — CRM, financeiro, estoque, odontologia, WhatsApp e repasse.
- `js/domains/appointment-reconciliation.js` — dispatcher/retry do Plennus.

### Integrações alteradas
- `js/core/migrations.js`
- `js/core/navigation.js`
- `js/core/clinic-hub-database.js`
- `js/core/clinic-network-main.js`
- `js/domains/operations-integration.js`
- `js/domains/clinic-network-workflow.js`
- `package.json`

---

### Task 1: Workflow Engine + Event Bus

**Files:**
- Create: `js/modules/workflow-core/errors.js`
- Create: `js/modules/workflow-core/event-bus.js`
- Create: `js/modules/workflow-core/workflow-engine.js`
- Test: `test/workflow-core-engine.test.js`

**Interfaces:**
- Produces: `createEventBus()`, `createWorkflowEngine({ idGenerator, clock })`.
- `engine.registerWorkflow(name, definition)`.
- `engine.execute(command)` retorna `{ ok, transition, event }`.
- `bus.subscribe(eventType, effectKey, handler, options)` e `bus.publish(event, context)`.

- [ ] **Step 1: Write failing engine/event bus tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkflowEngine } = require('../js/modules/workflow-core/workflow-engine');
const { createEventBus } = require('../js/modules/workflow-core/event-bus');

test('workflow engine emits the declared domain event for a valid transition', () => {
  const engine = createWorkflowEngine({ idGenerator: () => 'evt-1', clock: () => '2026-09-09T12:00:00.000Z' });
  engine.registerWorkflow('order', {
    aggregateType: 'order',
    transitions: { pay: { from: ['open'], to: 'paid', event: 'order.paid' } }
  });
  const result = engine.execute({ workflow: 'order', action: 'pay', aggregateId: 7, currentState: 'open', actor: { userId: 1, role: 'admin' }, source: 'standalone', payload: {} });
  assert.equal(result.transition.to, 'paid');
  assert.equal(result.event.type, 'order.paid');
  assert.equal(result.event.eventId, 'evt-1');
});

test('workflow engine rejects an invalid transition', () => {
  const engine = createWorkflowEngine({ idGenerator: () => 'evt-2' });
  engine.registerWorkflow('order', {
    aggregateType: 'order',
    transitions: { pay: { from: ['open'], to: 'paid', event: 'order.paid' } }
  });
  assert.throws(() => engine.execute({ workflow: 'order', action: 'pay', aggregateId: 7, currentState: 'paid', actor: { role: 'admin' }, source: 'standalone' }), /transition/i);
});

test('event bus isolates subscriber failures and reports every effect', async () => {
  const bus = createEventBus();
  bus.subscribe('order.paid', 'audit', async () => ({ ok: true }));
  bus.subscribe('order.paid', 'broken', async () => { throw new Error('boom'); });
  const report = await bus.publish({ eventId: 'evt-1', type: 'order.paid' });
  assert.equal(report.effects.length, 2);
  assert.equal(report.effects.find(item => item.effectKey === 'audit').status, 'applied');
  assert.equal(report.effects.find(item => item.effectKey === 'broken').status, 'failed');
});
```

- [ ] **Step 2: Commit RED and verify CI fails**

Run via branch CI: `npm test -- --test-name-pattern="workflow engine|event bus"` or full `npm test`.
Expected: FAIL because Workflow Core files do not exist.

- [ ] **Step 3: Implement minimal engine, errors and bus**

Implement UMD/CommonJS modules, definition validation, authorization callback, transition validation and subscriber isolation. Keep files free of DOM/Electron/DB dependencies.

- [ ] **Step 4: Run tests and lint**

Run: `npm test` and `npm run lint`.
Expected: PASS.

- [ ] **Step 5: Commit GREEN**

Commit: `feat: add reusable workflow engine and event bus`

---

### Task 2: Stores, Idempotent Effects and Reconciliation

**Files:**
- Create: `js/modules/workflow-core/effect-runner.js`
- Create: `js/modules/workflow-core/outbox.js`
- Create: `js/modules/workflow-core/reconciliation.js`
- Create: `js/modules/workflow-core/adapters/memory-store.js`
- Create: `js/modules/workflow-core/adapters/sqlite-store.js`
- Test: `test/workflow-core-store.test.js`

**Interfaces:**
- `createMemoryWorkflowStore()`.
- `createSqliteWorkflowStore({ query, run })`.
- Store methods: `appendEvent`, `getEvent`, `listPendingEvents`, `markEventDispatched`, `markEventError`, `hasEffect`, `markEffectApplied`, `listEffects`.
- `createEffectRunner({ bus, store })`.
- `reconcile({ limit, aggregateType, aggregateId, context })`.

- [ ] **Step 1: Write failing store/idempotency tests**

```js
test('memory store rejects duplicate event ids', async () => {
  const store = createMemoryWorkflowStore();
  const event = { eventId: 'evt-1', type: 'order.paid', aggregateType: 'order', aggregateId: '7', occurredAt: '2026-09-09T12:00:00.000Z', source: 'standalone', actor: {}, payload: {} };
  await store.appendEvent(event);
  await assert.rejects(() => store.appendEvent(event), /duplicate|exists/i);
});

test('effect runner skips an already applied event/effect pair', async () => {
  const store = createMemoryWorkflowStore();
  let calls = 0;
  const bus = createEventBus();
  bus.subscribe('order.paid', 'cash.register', async () => { calls += 1; });
  const runner = createEffectRunner({ bus, store });
  const event = { eventId: 'evt-2', type: 'order.paid', aggregateType: 'order', aggregateId: '7', occurredAt: '2026-09-09T12:00:00.000Z', source: 'standalone', actor: {}, payload: {} };
  await runner.run(event);
  await runner.run(event);
  assert.equal(calls, 1);
});

test('reconciliation keeps event pending when a required effect fails', async () => {
  // append event, register required failing effect, reconcile, assert dispatchedAt remains null and lastError is set
});
```

- [ ] **Step 2: Commit RED and verify failure**
Expected: FAIL because stores/effect runner do not exist.

- [ ] **Step 3: Implement memory + SQLite stores and effect runner**
SQLite adapter serializes actor/payload/meta as JSON and uses generic table names `workflow_domain_events` and `workflow_effects`.

- [ ] **Step 4: Implement reconciliation**
Required effect failure keeps event pending; optional failures are reported but do not block dispatch once required effects have succeeded.

- [ ] **Step 5: Run full tests/lint and commit**
Commit: `feat: add workflow outbox idempotency and reconciliation`

---

### Task 3: Public Workflow Core Factory

**Files:**
- Create: `js/modules/workflow-core/workflow-core.js`
- Test: `test/workflow-core-api.test.js`
- Modify: `package.json`

**Interfaces:**
- `createWorkflowCore({ store, idGenerator, clock, logger })`.
- API: `registerWorkflow`, `registerEffect`, `execute`, `appendEvent`, `dispatchPending`, `reconcile`, `inspect`.
- Export: CommonJS + `globalThis.WorkflowCore`.

- [ ] **Step 1: Write failing public API test**

```js
test('Workflow Core public factory can execute, persist and dispatch a workflow event', async () => {
  const store = createMemoryWorkflowStore();
  const core = createWorkflowCore({ store, idGenerator: () => 'evt-api-1', clock: () => '2026-09-09T12:00:00.000Z' });
  core.registerWorkflow('order', { aggregateType: 'order', transitions: { pay: { from: ['open'], to: 'paid', event: 'order.paid' } } });
  let called = 0;
  core.registerEffect('order.paid', 'audit', async () => { called += 1; });
  const executed = core.execute({ workflow: 'order', action: 'pay', aggregateId: 1, currentState: 'open', actor: { role: 'admin' }, source: 'standalone' });
  await core.appendEvent(executed.event);
  await core.dispatchPending();
  assert.equal(called, 1);
});
```

- [ ] **Step 2: Commit RED and verify failure**
- [ ] **Step 3: Implement factory and inspection API**
- [ ] **Step 4: Add all Workflow Core files to `npm run lint`**
- [ ] **Step 5: Full test/lint and commit**
Commit: `feat: expose reusable Workflow Core API`

---

### Task 4: Plennus Appointment Workflow Definition + Migration

**Files:**
- Create: `js/domains/appointment-workflow-definition.js`
- Modify: `js/core/migrations.js`
- Modify: `js/core/navigation.js`
- Test: `test/appointment-workflow-definition.test.js`
- Test: `test/workflow-core-migration.test.js`

**Interfaces:**
- `createAppointmentWorkflowDefinition()`.
- States: `agendado`, `confirmado`, `espera`, `atendimento`, `realizado`, `cancelado`.
- Events: `appointment.confirmed`, `patient.arrived`, `appointment.started`, `appointment.completed`, `appointment.cancelled`.

- [ ] **Step 1: Write failing transition/authorization tests**
Test reception/admin operational actions, professional ownership for start/complete, invalid terminal transitions, and rejection of another professional's appointment.

- [ ] **Step 2: Write failing migration test**
Assert next schema migration creates `workflow_domain_events`, pending/aggregate indexes and `workflow_effects` with composite primary key.

- [ ] **Step 3: Commit RED and verify failure**
- [ ] **Step 4: Implement workflow definition and schema migration**
- [ ] **Step 5: Load generic Workflow Core scripts before Plennus appointment domain scripts in navigation**
- [ ] **Step 6: Full test/lint and commit**
Commit: `feat: define Plennus appointment workflow on Workflow Core`

---

### Task 5: Appointment Orchestrator + Legacy API Adapters

**Files:**
- Create: `js/domains/appointment-orchestrator.js`
- Modify: `js/domains/agenda.js`
- Modify: `js/domains/clinic-network-workflow.js`
- Test: `test/appointment-orchestrator.test.js`

**Interfaces:**
- `PlennusAppointmentOrchestrator.confirm(id)`
- `arrive(id, arrivedAt)`
- `start(id)`
- `complete(id)`
- `cancel(id)`
- Legacy globals delegate to orchestrator: `mudarStatus`, `marcarChegadaEspera`, `chamarParaAtendimento`.

- [ ] **Step 1: Write failing standalone orchestration test**
Assert a transition updates agenda and appends exactly one outbox event with matching aggregate id.

- [ ] **Step 2: Write failing remote-professional orchestration test**
Assert professional remote start/complete calls `PlennusClinicNetwork.mutate('agenda.updateStatus', ...)`, never runs admin effects locally, and rejects ownership mismatch.

- [ ] **Step 3: Commit RED and verify failure**
- [ ] **Step 4: Implement orchestrator with dependency injection wrappers for DB/session/network**
- [ ] **Step 5: Replace business logic inside legacy globals with delegation only**
- [ ] **Step 6: Full tests/lint and commit**
Commit: `refactor: route appointment transitions through Workflow Core`

---

### Task 6: Appointment Effects + Removal of Status Wrappers

**Files:**
- Create: `js/domains/appointment-effects.js`
- Create: `js/domains/appointment-reconciliation.js`
- Modify: `js/domains/operations-integration.js`
- Modify: `js/core/navigation.js`
- Test: `test/appointment-effects.test.js`

**Interfaces:**
- Stable effect keys:
  - `crm.appointment-created`
  - `crm.appointment-status`
  - `finance.appointment-completed`
  - `dental-finance.appointment-status`
  - `odontology.appointment-status`
  - `inventory.appointment-completed`
  - `whatsapp.appointment-status`
  - `payout.appointment-completed` when existing domain behavior requires it.

- [ ] **Step 1: Write failing completion-effects test**
Publish the same `appointment.completed` twice; assert Finance, Inventory, CRM and WhatsApp handlers each execute once.

- [ ] **Step 2: Write failing partial-failure test**
Make inventory fail first run; assert finance remains recorded/applied and second reconcile retries only inventory.

- [ ] **Step 3: Commit RED and verify failure**
- [ ] **Step 4: Register effects using existing domain APIs**
Reuse existing functions such as `onAppointmentStatusChanged`, `consumeForAppointment` and message cancellation/sync; do not reimplement domain rules inside Workflow Core.

- [ ] **Step 5: Remove `mudarStatus` interception from `operations-integration.js` after coverage is green**
Keep non-status integrations such as appointment field enrichment where still needed.

- [ ] **Step 6: Add reconciliation triggers on bootstrap/local transition**
- [ ] **Step 7: Full tests/lint and commit**
Commit: `refactor: move appointment side effects to domain events`

---

### Task 7: Clinic Hub Atomic Event Outbox

**Files:**
- Modify: `js/core/clinic-hub-database.js`
- Modify: `js/core/clinic-network-main.js`
- Modify: `preload.js` only if an additional safe notification is necessary; prefer existing `clinic-network:hub-mutation-applied`.
- Test: `test/clinic-hub-workflow-events.test.js`

**Interfaces:**
- `agenda.updateStatus` validates via Appointment Workflow definition in Hub process.
- Same DB transaction performs agenda update + `workflow_domain_events` insert + `network_mutations` insert.
- Duplicate `mutationId` returns prior result without duplicate event.

- [ ] **Step 1: Write failing Hub atomicity/idempotency tests**
Assert successful remote complete creates one network mutation and one `appointment.completed` outbox event; duplicate mutation creates neither a second event nor second status effect.

- [ ] **Step 2: Write failing authorization test**
A professional cannot update appointment owned by another professional.

- [ ] **Step 3: Commit RED and verify failure**
- [ ] **Step 4: Integrate Workflow Core engine/store primitives into Hub database service**
Use existing `BEGIN/COMMIT/ROLLBACK`; do not expose SQL via RPC.

- [ ] **Step 5: Keep Main-process notification as signal only**
`clinic-network-main.js` notifies renderer that canonical mutation/outbox changed; renderer reconciles durable events.

- [ ] **Step 6: Full Clinic Hub tests + full suite/lint and commit**
Commit: `feat: persist workflow events atomically in Clinic Hub`

---

### Task 8: Offline/Retry, Regression and Reusable Documentation

**Files:**
- Modify: `js/domains/appointment-reconciliation.js`
- Modify: `js/domains/clinic-network-status.js` only if existing pending mutation feedback cannot represent workflow reconciliation status.
- Create: `test/workflow-core-offline-retry.test.js`
- Create: `docs/modules/workflow-core.md`
- Modify: `README.md`

**Interfaces:**
- Reconnect flow: flush pending network mutations → fetch snapshot → reconcile Hub outbox.
- Documentation includes minimal examples for Plennus, PDV and obra/task workflows.

- [ ] **Step 1: Write failing offline retry regression test**
Simulate queued `appointment.completed`, apply it once after reconnect, process event twice, and assert finance/inventory/etc remain single-application.

- [ ] **Step 2: Commit RED and verify failure**
- [ ] **Step 3: Implement missing reconciliation hooks**
Trigger on bootstrap, local transition, Hub mutation notification and sync/reconnect.

- [ ] **Step 4: Document reusable module contract and copy/adoption checklist**
Document when to use Workflow Core, how to define workflow, register effects, choose memory vs SQLite store, and host responsibility for atomic domain-state + outbox writes.

- [ ] **Step 5: Run final verification**
Run: `npm test`.
Expected: all tests pass.
Run: `npm run lint`.
Expected: exit 0.

- [ ] **Step 6: Commit final delivery**
Commit: `docs: finalize reusable Workflow Core integration`

---

## Final Verification Checklist

- [ ] Workflow Core has zero Plennus-specific names or data rules.
- [ ] CommonJS and browser-global exports work.
- [ ] Memory and SQLite adapters obey the same contract.
- [ ] Invalid transitions are rejected before persistence.
- [ ] Professional ownership is enforced locally and again on Hub.
- [ ] Remote completion creates durable event on Hub, not on professional client.
- [ ] `clinical.db` is never read/written by shared Workflow Core integration.
- [ ] Same event/effect pair is never applied twice.
- [ ] Required effect failure remains retryable.
- [ ] Existing Agenda global calls still function through adapters.
- [ ] Old status-effect wrapper is removed only after event tests are green.
- [ ] Offline queue/reconnect does not duplicate finance, stock, CRM, WhatsApp or payout effects.
- [ ] Full existing suite passes.
- [ ] `npm run lint` passes.
