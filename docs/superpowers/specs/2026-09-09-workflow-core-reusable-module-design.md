# Workflow Core — Reusable Process Orchestration Module Design

## Objetivo

Extrair a arquitetura de orquestração aprovada para o Plennus Clinic em um módulo reutilizável e independente de domínio, capaz de organizar processos com múltiplas etapas, efeitos derivados, retry, idempotência, outbox e reconciliação em diferentes produtos.

O Plennus Clinic será o primeiro consumidor do módulo. O núcleo não conhecerá pacientes, consultas, vendas, tarefas de obra, estoque clínico, odontologia, financeiro ou qualquer regra específica de produto.

Esta spec complementa e substitui a parte genérica de `docs/superpowers/specs/2026-09-09-appointment-domain-event-bus-design.md`. As regras específicas do fluxo de atendimento permanecem naquele documento, mas Event Bus, workflow engine, efeitos, idempotência, outbox e reconciliação passam a ser fornecidos pelo `Workflow Core`.

## Quando usar

O módulo é indicado quando um processo possui dois ou mais destes fatores:
- múltiplos estados ou etapas de negócio;
- uma ação gera vários efeitos em módulos diferentes;
- múltiplos usuários ou estações;
- operação offline com sincronização posterior;
- retry/reprocessamento;
- necessidade de impedir duplicidade financeira/estoque/mensagens;
- auditoria ou rastreabilidade operacional importante.

CRUDs simples não devem ser obrigados a usar o módulo.

## Princípios

1. O core é agnóstico de produto e de UI.
2. O core não acessa DOM, Electron, filesystem, rede ou `sql.js` diretamente.
3. O core funciona em Node/CommonJS para testes e Electron Main, e no renderer por export global compatível com o padrão atual do repositório.
4. Regras de domínio vivem em definições registradas pelo produto consumidor.
5. Uma transição aceita gera um evento de domínio estável.
6. Efeitos derivados são registrados como subscribers e não interceptam funções de UI.
7. Eventos e efeitos podem ser reprocessados sem duplicar resultados.
8. Persistência é fornecida por adapters.
9. O adapter SQLite recebe uma interface mínima de banco; ele não instancia `sql.js`.
10. Falha de um efeito não desfaz a transição principal já confirmada.
11. O módulo não é event sourcing e não exige broker externo.
12. Nenhuma dependência npm nova é necessária na v1.

## Estrutura

```text
js/modules/workflow-core/
├── workflow-core.js
├── event-bus.js
├── workflow-engine.js
├── effect-runner.js
├── outbox.js
├── reconciliation.js
├── errors.js
└── adapters/
    ├── memory-store.js
    └── sqlite-store.js
```

Arquivos do Plennus consumidor:

```text
js/domains/
├── appointment-workflow-definition.js
├── appointment-orchestrator.js
├── appointment-effects.js
└── appointment-reconciliation.js
```

## API pública

O ponto de entrada `workflow-core.js` expõe uma API única, tanto por CommonJS quanto por `globalThis.PlennusWorkflowCore`.

```js
const core = createWorkflowCore({
  store,
  idGenerator,
  clock,
  logger
});

core.registerWorkflow(name, definition);
core.registerEffect(eventType, effectKey, handler, options);
core.execute(command);
core.dispatchPending(options);
core.reconcile(options);
core.inspect(aggregateType, aggregateId);
```

### `createWorkflowCore(options)`

Recebe:
- `store`: adapter de persistência;
- `idGenerator`: função que retorna ID único; default seguro fornecido pelo host;
- `clock`: função que retorna ISO timestamp; default `new Date().toISOString()`;
- `logger`: adapter opcional com `info`, `warn`, `error`.

O core nunca assume `crypto.randomUUID()` diretamente no renderer sem fallback injetável.

## Definição de workflow

Cada produto registra workflows declarativos.

```js
core.registerWorkflow('appointment', {
  aggregateType: 'appointment',
  initialState: 'agendado',
  transitions: {
    confirm: {
      from: ['agendado'],
      to: 'confirmado',
      event: 'appointment.confirmed'
    },
    arrive: {
      from: ['agendado', 'confirmado'],
      to: 'espera',
      event: 'patient.arrived'
    },
    start: {
      from: ['espera'],
      to: 'atendimento',
      event: 'appointment.started'
    },
    complete: {
      from: ['atendimento'],
      to: 'realizado',
      event: 'appointment.completed'
    }
  },
  authorize(context) {
    return true;
  }
});
```

O core não interpreta nomes como `appointment`, `sale` ou `task`.

## Command envelope

```js
{
  commandId,
  workflow: 'appointment',
  action: 'complete',
  aggregateId: 42,
  currentState: 'atendimento',
  actor: {
    userId: 7,
    role: 'medico',
    professionalId: 3
  },
  source: 'remote-professional',
  mutationId: 'optional-network-mutation-id',
  payload: {}
}
```

Campos obrigatórios:
- `workflow`;
- `action`;
- `aggregateId`;
- `currentState`;
- `actor`;
- `source`.

`commandId` pode ser fornecido pelo host ou gerado pelo core. `mutationId` é opcional e serve para correlação com redes/offline.

## Resultado do execute

```js
{
  ok: true,
  transition: {
    workflow: 'appointment',
    aggregateType: 'appointment',
    aggregateId: 42,
    from: 'atendimento',
    to: 'realizado',
    action: 'complete'
  },
  event: {
    eventId: '...',
    type: 'appointment.completed',
    aggregateType: 'appointment',
    aggregateId: 42,
    occurredAt: '...',
    actor: { ... },
    source: 'remote-professional',
    mutationId: '...',
    payload: { ... }
  }
}
```

`execute` valida e produz a transição/evento. Persistir o estado do aggregate de domínio continua responsabilidade do consumidor ou de uma transação coordenada pelo adapter do produto. O core não sabe em qual tabela a entidade vive.

## `event-bus.js`

Responsabilidades:
- registrar subscribers por `eventType`;
- impedir registro duplicado de `eventType + effectKey`;
- publicar evento para subscribers registrados;
- isolar erro de cada subscriber;
- retornar relatório de execução em vez de engolir erros.

Interface:

```js
subscribe(eventType, effectKey, handler, options = {})
unsubscribe(eventType, effectKey)
subscribersFor(eventType)
publish(event, context = {})
```

`publish` retorna:

```js
{
  eventId,
  effects: [
    { effectKey, status: 'applied' | 'skipped' | 'failed', error: null }
  ],
  ok: true | false
}
```

## `workflow-engine.js`

Responsabilidades:
- registrar definição;
- validar estados/transições;
- executar `authorize(context, transition)` quando definido;
- gerar resultado puro de transição;
- construir envelope de evento via funções injetadas de ID/clock.

Não persiste nada e não publica efeitos diretamente.

Erros específicos:
- `WorkflowNotFoundError`;
- `ActionNotFoundError`;
- `InvalidTransitionError`;
- `WorkflowAuthorizationError`;
- `InvalidWorkflowDefinitionError`.

## `effect-runner.js`

Responsabilidades:
- receber evento e subscribers do Event Bus;
- consultar `store.hasEffect(eventId, effectKey)` antes de executar;
- executar handler;
- marcar efeito somente após sucesso;
- manter falhas reprocessáveis;
- classificar efeito como `optional` ou `required`.

Handler:

```js
async function handler(event, context) {
  return { ok: true };
}
```

Regra de idempotência:

```text
se domain_event_effects(event_id, effect_key) existe
→ não executar novamente
→ status = skipped
```

## `outbox.js`

Abstração para persistência de eventos duráveis.

Interface do store usada pela outbox:

```js
appendEvent(event)
getEvent(eventId)
listPendingEvents({ limit, aggregateType, aggregateId })
markEventDispatched(eventId, dispatchedAt)
markEventError(eventId, errorMessage)
```

O core não exige que todo consumidor use outbox. O adapter `memory-store` permite uso simples em processos locais. Produtos com múltiplos módulos, offline, financeiro ou rede devem usar uma store durável.

## `reconciliation.js`

Responsabilidades:
- listar eventos pendentes;
- executar apenas efeitos ainda não aplicados;
- marcar evento como despachado quando todos os efeitos `required` estiverem aplicados;
- manter pendente quando houver falha obrigatória;
- registrar diagnóstico da última falha;
- suportar filtro por aggregate.

Interface:

```js
reconcile({ limit = 100, aggregateType = null, aggregateId = null, context = {} })
```

## Store contract

Todo adapter implementa:

```js
{
  appendEvent(event),
  getEvent(eventId),
  listPendingEvents(filters),
  markEventDispatched(eventId, dispatchedAt),
  markEventError(eventId, errorMessage),
  hasEffect(eventId, effectKey),
  markEffectApplied(eventId, effectKey, meta),
  listEffects(eventId)
}
```

Métodos podem retornar valor imediato ou Promise. O Workflow Core normaliza com `await` internamente.

## `memory-store.js`

Uso:
- testes;
- protótipos;
- workflows sem requisito de durabilidade.

Implementação com `Map`, sem dependências externas.

Deve reproduzir as mesmas garantias lógicas do adapter SQLite:
- unicidade de `eventId`;
- unicidade de `eventId + effectKey`;
- filtro de pendentes;
- tracking de erro/dispatch.

## `sqlite-store.js`

O adapter não importa `sql.js`. Recebe uma interface:

```js
createSqliteWorkflowStore({
  query(sql, params),
  run(sql, params),
  transact(callback)
});
```

`transact` é opcional para operações isoladas, mas obrigatório quando o consumidor pede persistência atômica entre mudança de aggregate e append da outbox.

Tabelas padrão:

```sql
CREATE TABLE IF NOT EXISTS workflow_domain_events (
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
);

CREATE INDEX IF NOT EXISTS idx_workflow_domain_events_pending
ON workflow_domain_events(dispatched_at, occurred_at);

CREATE INDEX IF NOT EXISTS idx_workflow_domain_events_aggregate
ON workflow_domain_events(aggregate_type, aggregate_id, occurred_at);

CREATE TABLE IF NOT EXISTS workflow_effects (
  event_id TEXT NOT NULL,
  effect_key TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  meta_json TEXT,
  PRIMARY KEY (event_id, effect_key)
);
```

Os nomes são genéricos para permitir copiar o módulo a outros sistemas sem renomear schema.

## Atomicidade

O módulo oferece uma primitiva de integração, não tenta atualizar tabelas de domínio por conta própria.

O consumidor pode fazer:

```js
store.transact(async tx => {
  updateAggregate(tx, transition);
  await tx.workflow.appendEvent(event);
});
```

Para o Plennus, `agenda.status` e `workflow_domain_events` devem ser gravados na mesma transação canônica no Hub/standalone quando a operação for durável.

No modo profissional remoto, somente o Hub executa a transação compartilhada.

## Integração Plennus Clinic

### `appointment-workflow-definition.js`
Contém apenas regras específicas da agenda:
- estados `agendado`, `confirmado`, `espera`, `atendimento`, `realizado`, `cancelado`;
- transições permitidas;
- papéis autorizados;
- ownership do profissional;
- mapeamento para eventos `appointment.*`.

### `appointment-orchestrator.js`
Responsável por:
- converter ações de UI em commands;
- obter ator atual;
- consultar estado canônico/espelho;
- chamar Workflow Core;
- persistir `agenda` + outbox;
- enviar mutação ao Hub no modo remoto;
- manter funções globais legadas como adapters temporários.

### `appointment-effects.js`
Registra handlers no core:
- CRM;
- Financeiro;
- Estoque;
- Odontologia/dental-finance;
- WhatsApp;
- Repasse/retorno quando aplicável.

Todos usam `effectKey` estável.

### Clinic Hub
`clinic-hub-database.js` continua responsável pela autoridade de `clinic.db`, mas passa a usar a definição/engine genérica para validar a transição e gravar evento durável na mesma transação.

`clinical.db` não participa do Workflow Core compartilhado e nunca trafega pela rede.

## Portabilidade para outros sistemas

### PDV

```js
registerWorkflow('sale', {
  aggregateType: 'sale',
  initialState: 'open',
  transitions: {
    pay: { from: ['open'], to: 'paid', event: 'sale.paid' },
    finalize: { from: ['paid'], to: 'completed', event: 'sale.completed' },
    cancel: { from: ['open', 'paid'], to: 'cancelled', event: 'sale.cancelled' }
  }
});
```

Subscribers de `sale.completed` podem baixar estoque, registrar caixa, financeiro e auditoria.

### Obra

```js
registerWorkflow('task', {
  aggregateType: 'task',
  initialState: 'planned',
  transitions: {
    release: { from: ['planned'], to: 'released', event: 'task.released' },
    start: { from: ['released'], to: 'running', event: 'task.started' },
    complete: { from: ['running'], to: 'completed', event: 'task.completed' }
  }
});
```

### Financeiro/RH
Pode ser usado para fechamento de competência, aprovação de pagamento, folha, documento ou outro processo em que uma transição gere múltiplos efeitos.

## Segurança e privacidade

O core não possui conceito de dado sensível. A responsabilidade é do consumidor ao construir `payload`.

Regras obrigatórias para o Plennus:
- eventos compartilhados não transportam SOAP, anamnese, exames, receitas ou anexos;
- somente IDs e metadados operacionais mínimos entram no evento;
- autorização é revalidada no Hub;
- sem SQL remoto livre;
- renderer continua sem Node integration;
- adapters de filesystem/rede não fazem parte do Workflow Core.

## Migração do Plennus

### Entrega 0 — Workflow Core
Criar o módulo genérico, memory adapter, SQLite adapter e testes unitários sem alterar comportamento atual do Plennus.

### Entrega 1 — Persistência durável
Adicionar migrations das tabelas genéricas e integrar o adapter SQLite ao `clinic.db`.

### Entrega 2 — Workflow de atendimento
Registrar `appointment` como consumidor e mover validação de transições/ownership para a definição de domínio.

### Entrega 3 — Efeitos
Migrar CRM, Financeiro, Estoque, Odontologia, WhatsApp e Repasse de wrappers para subscribers idempotentes.

### Entrega 4 — Clinic Hub e offline
Fazer mutações LAN gerarem o mesmo evento canônico durável no Hub; retry da fila não duplica efeitos.

### Entrega 5 — Compatibilidade e remoção de wrappers
As funções globais legadas delegam ao orquestrador; wrappers antigos são removidos apenas após cobertura equivalente por testes.

### Entrega 6 — Documentação de reutilização
Adicionar documentação mínima com exemplos de criação de workflow, registro de efeitos, adapter SQLite e critérios de quando usar.

## Arquivos previstos no Plennus

Novos:
- `js/modules/workflow-core/workflow-core.js`
- `js/modules/workflow-core/event-bus.js`
- `js/modules/workflow-core/workflow-engine.js`
- `js/modules/workflow-core/effect-runner.js`
- `js/modules/workflow-core/outbox.js`
- `js/modules/workflow-core/reconciliation.js`
- `js/modules/workflow-core/errors.js`
- `js/modules/workflow-core/adapters/memory-store.js`
- `js/modules/workflow-core/adapters/sqlite-store.js`
- `js/domains/appointment-workflow-definition.js`
- `js/domains/appointment-orchestrator.js`
- `js/domains/appointment-effects.js`
- `js/domains/appointment-reconciliation.js`
- `test/workflow-core-event-bus.test.js`
- `test/workflow-core-engine.test.js`
- `test/workflow-core-effects.test.js`
- `test/workflow-core-store.test.js`
- `test/appointment-workflow-core-integration.test.js`

Modificados principalmente:
- `js/core/migrations.js`
- `js/core/navigation.js`
- `js/domains/agenda.js`
- `js/domains/operations-integration.js`
- `js/domains/clinic-network-workflow.js`
- `js/core/clinic-hub-database.js`
- `js/core/clinic-network-main.js`
- `package.json` apenas para lint dos novos arquivos, sem nova dependência.

## Testes obrigatórios

### Núcleo reutilizável
1. registra e rejeita workflows inválidos;
2. aceita transição válida;
3. rejeita estado de origem inválido;
4. rejeita ação desconhecida;
5. executa autorização injetada;
6. gera evento com ID/timestamp injetáveis;
7. registra subscribers por chave única;
8. falha de um subscriber não impede relatório dos demais;
9. efeito já aplicado é pulado;
10. retry executa somente efeito faltante;
11. memory store mantém unicidade;
12. SQLite store mantém unicidade e pendências;
13. reconciliação marca evento concluído apenas quando efeitos obrigatórios terminaram;
14. efeito opcional falho não bloqueia dispatch quando configurado como opcional.

### Plennus
15. fluxo `agendado → confirmado → espera → atendimento → realizado` funciona;
16. transição inválida é recusada;
17. profissional não altera atendimento de outro profissional;
18. recepção não inicia/conclui atendimento clínico quando a regra não permitir;
19. `appointment.completed` gera efeitos uma única vez;
20. repetição da mesma mutação LAN não duplica evento/efeito;
21. offline + reconexão gera efeitos somente no Hub;
22. reinício do renderer não perde evento pendente;
23. `clinical.db` não é lido pelo Hub durante dispatch compartilhado;
24. suíte existente permanece verde;
25. lint permanece verde.

## Critérios de aceite

1. Nenhum arquivo em `js/modules/workflow-core` contém termos ou imports específicos de clínica.
2. Core pode ser carregado por `require()` em Node e como global no renderer.
3. Workflow Core não depende de DOM/Electron/filesystem/network/sql.js.
4. Memory adapter e SQLite adapter passam a mesma suíte comportamental de store.
5. Definições de workflow são declarativas e registradas externamente.
6. Efeitos são idempotentes por `eventId + effectKey`.
7. Eventos duráveis podem sobreviver a reinício do renderer.
8. Falha de efeito pode ser reconciliada sem repetir efeitos já aplicados.
9. Plennus usa o módulo no fluxo de atendimento sem perder funcionalidades atuais.
10. Clinic Hub continua autoridade operacional e `clinical.db` permanece local ao profissional.
11. Nenhuma dependência externa nova é adicionada na v1.
12. O módulo possui documentação suficiente para ser copiado/reutilizado em outro produto sem conhecer o Plennus.

## Não objetivos

- Microserviços.
- Kafka, RabbitMQ, Redis ou broker externo.
- Event sourcing completo.
- Motor BPMN visual.
- Editor gráfico de workflows.
- Scheduler genérico.
- Regras de negócio específicas de qualquer produto dentro do core.
- Cloud/SaaS.
- Mudança de UI/paleta/framework.

## Decisão final

O `Workflow Core` será a camada reutilizável de orquestração dos produtos que possuem processos relevantes. O Event Bus é uma parte interna dessa camada, não o produto final do módulo.

O Plennus Clinic será o primeiro consumidor e servirá como validação real da arquitetura antes de reutilização no PDV, Obra na Mão, FluxoDRE ou outros sistemas.