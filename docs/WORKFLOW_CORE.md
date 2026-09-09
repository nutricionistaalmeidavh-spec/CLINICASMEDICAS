# Workflow Core

## Objetivo

O `Workflow Core` é um módulo interno e reutilizável para sistemas com fluxos de múltiplas etapas. Ele centraliza estados, transições, autorização, eventos de domínio, efeitos laterais, idempotência e reconciliação sem conhecer regras específicas do Plennus Clinic.

O Plennus Clinic é o primeiro consumidor do módulo. O núcleo pode ser copiado para outros sistemas Electron/JavaScript ou adaptado para outro runtime por meio das interfaces de persistência.

## Estrutura

```text
js/modules/workflow-core/
├── errors.js
├── event-bus.js
├── workflow-engine.js
├── effect-runner.js
├── outbox.js
├── reconciliation.js
├── workflow-core.js
└── adapters/
    ├── memory-store.js
    └── sqlite-store.js
```

O código genérico não importa módulos de clínica, agenda, financeiro, estoque, CRM ou WhatsApp.

## API pública

A fábrica `createWorkflowCore({ store, idGenerator, clock, logger })` retorna uma instância com:

- `registerWorkflow(name, definition)` — registra estados, transições e autorização.
- `execute(command)` — valida uma transição e produz o evento correspondente sem persistir estado do domínio.
- `appendEvent(event)` — grava o evento na outbox durável.
- `registerEffect(eventType, effectKey, handler, options)` — registra um efeito lateral idempotente.
- `dispatchPending(options)` / `reconcile(options)` — processa eventos pendentes e retenta apenas efeitos não concluídos.
- `inspect(aggregateType, aggregateId, options)` — inspeciona eventos e efeitos de um agregado.

## Contrato de evento

Um evento contém, no mínimo:

```js
{
  eventId,
  type,
  aggregateType,
  aggregateId,
  occurredAt,
  source,
  actor,
  payload,
  mutationId
}
```

`mutationId` identifica uma mutação distribuída quando há rede/offline. `eventId` identifica o evento de domínio. Os dois têm responsabilidades diferentes.

## Persistência

O adapter precisa oferecer as operações usadas pelo core:

- `appendEvent(event)`
- `getEvent(eventId)`
- `listEvents(filters)`
- `listPendingEvents(filters)`
- `markEventDispatched(eventId, dispatchedAt)`
- `markEventError(eventId, errorMessage)`
- `hasEffect(eventId, effectKey)`
- `markEffectApplied(eventId, effectKey, meta)`
- `listEffects(eventId)`

O adapter SQLite utiliza:

### `workflow_domain_events`

Outbox dos eventos produzidos pelo estado canônico. Um evento só recebe `dispatched_at` quando todos os efeitos obrigatórios terminam.

### `workflow_effects`

Registro dos efeitos já concluídos. A chave primária é:

```text
(event_id, effect_key)
```

Esse par é a barreira de idempotência dos efeitos.

## Atomicidade do host

A alteração do estado do domínio e o evento da outbox devem ser persistidos na **mesma transação do banco canônico**:

```js
DB.run('BEGIN IMMEDIATE');
try {
  DB.run('UPDATE ...');
  core.appendEvent(event);
  DB.run('COMMIT');
} catch (error) {
  DB.run('ROLLBACK');
  throw error;
}
```

Por isso o adapter SQLite do módulo é síncrono quando recebe funções `query/run` síncronas. Chamadores que usam `await` continuam compatíveis.

## Efeitos e retry

Cada efeito possui uma `effectKey` estável. Exemplo:

```text
appointment.completed
├── finance.sync
├── crm.sync
├── inventory.consume
└── whatsapp.sync
```

Se Financeiro e CRM terminarem, mas Estoque falhar, a reconciliação posterior consulta `workflow_effects` e executa novamente apenas o Estoque (e qualquer outro efeito ainda pendente). Os efeitos já concluídos não são repetidos.

Efeitos opcionais podem falhar sem bloquear o despacho do evento quando registrados com essa opção. Efeitos obrigatórios mantêm o evento pendente até uma execução bem-sucedida.

## Primeiro consumidor: Plennus Clinic

### Workflow de atendimento

Definição: `js/domains/appointment-workflow-definition.js`

Fluxo canônico:

```text
agendado -> confirmado -> espera -> atendimento -> realizado
       \          \          \
        +----------+-----------> cancelado
```

Responsabilidades:

- Recepção: confirmar, registrar chegada e cancelar dentro das transições permitidas.
- Profissional: iniciar e concluir somente seus próprios atendimentos.
- Admin: pode executar as ações administrativas previstas pela definição.

### Orquestrador

`js/domains/appointment-orchestrator.js` é a autoridade única para mudanças de status de atendimento no renderer.

As funções globais antigas continuam existindo apenas como fachada para a UI:

- `mudarStatus`
- `marcarChegadaEspera`
- `chamarParaAtendimento`

`workflow-stabilization.js`, `operations-integration.js` e `clinic-network-workflow.js` não implementam mais transições paralelas.

### Efeitos do Plennus

`js/domains/appointment-effects.js` conecta eventos do Workflow Core aos módulos existentes:

- Financeiro / Dental Finance
- Odontologia
- CRM
- Estoque
- WhatsApp

O Workflow Core continua sem depender desses módulos.

## Clinic Hub e operação offline

O `clinic.db` do Hub é a fonte canônica da operação compartilhada.

Fluxo de uma conclusão remota:

```text
Profissional
  -> agenda.updateStatus(mutationId)
  -> Clinic Hub
     BEGIN
       valida workflow/ownership
       atualiza agenda.status = realizado
       grava appointment.completed na outbox
       grava network_mutations
     COMMIT
  -> notifica renderer do Hub
  -> renderer recarrega clinic.db canônico
  -> reconcilia efeitos pendentes
```

Quando a rede cai, a estação profissional mantém a mutação na fila local. Ao reconectar, envia o mesmo `mutationId`. O Hub consulta `network_mutations`; uma mutação já aplicada retorna como duplicada e não cria outro evento.

Assim existem duas barreiras complementares:

1. `mutationId` evita reaplicar a mutação de rede.
2. `(eventId, effectKey)` evita reaplicar efeitos de domínio.

## Reutilização em outro sistema

Para usar o módulo em outro produto:

1. Copie `js/modules/workflow-core/` sem arquivos do domínio Plennus.
2. Implemente ou reutilize um adapter de persistência.
3. Defina o workflow do novo agregado em arquivo próprio.
4. Registre a definição com `registerWorkflow`.
5. Faça o host persistir estado + evento na mesma transação.
6. Registre efeitos do produto com `registerEffect`.
7. Execute `reconcile()` no startup e após eventos/mutações relevantes.
8. Em cenários distribuídos, preserve um identificador idempotente da mutação na camada de transporte.

## Regra de arquitetura

O módulo genérico **não deve importar domínios consumidores**. Dependências seguem sempre esta direção:

```text
Produto/domínio -> Workflow Core
Workflow Core -X-> Produto/domínio
```

Essa regra mantém o módulo realmente reutilizável.

## Distribuição

A versão atual é um módulo interno reutilizável do repositório. Ela não é publicada como pacote npm. Uma futura extração para pacote pode manter a mesma API pública e substituir apenas adapters/empacotamento.