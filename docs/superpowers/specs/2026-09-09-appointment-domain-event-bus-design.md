# Plennus Clinic — Appointment Domain Event Bus Design

## Objetivo
Consolidar o fluxo operacional `Recepção → Clinic Hub → Profissional → Atendimento → efeitos administrativos` em uma arquitetura orientada a eventos de domínio, removendo a dependência crescente de wrappers globais e garantindo que o mesmo evento produza os mesmos efeitos independentemente de ter sido originado localmente no Hub ou em uma estação profissional remota.

A mudança preserva o modelo local-first, Electron + JavaScript, o `clinic.db` como autoridade compartilhada no Hub e o `clinical.db` de cada profissional fisicamente local.

## Problema atual
O fluxo operacional é composto por funções globais (`agendarConsulta`, `mudarStatus`, `marcarChegadaEspera`, `chamarParaAtendimento`) interceptadas por módulos carregados em sequência.

Hoje:
- `operations-integration.js` adiciona efeitos para CRM, Financeiro, Estoque, Odontologia e WhatsApp;
- `workflow-completion.js` complementa vínculos e validações;
- `clinic-network-workflow.js` substitui parte das operações quando o profissional está conectado remotamente;
- o Hub aplica `agenda.updateStatus` diretamente no `clinic.db` no processo principal Electron e notifica o renderer, sem uma camada canônica única responsável pelos efeitos administrativos.

O resultado é funcional, porém a execução dos efeitos depende do caminho e da ordem de carregamento dos wrappers. Há ainda uma fronteira de processo: mutações remotas são persistidas no Electron Main, enquanto vários efeitos administrativos atuais são implementados no renderer.

## Princípios
1. Um único comando operacional gera uma única transição de estado.
2. Uma transição aceita gera um único evento de domínio canônico.
3. O evento canônico é persistido junto do estado compartilhado antes de ser consumido.
4. Efeitos derivados escutam eventos; não interceptam funções de UI.
5. Eventos, mutações e efeitos são idempotentes.
6. O Hub é autoridade sobre estado operacional compartilhado.
7. O prontuário clínico permanece local ao profissional.
8. Não existe SQL remoto livre.
9. Falha ou ausência temporária do renderer não pode fazer um evento canônico desaparecer.
10. A migração será incremental e compatível com as APIs globais existentes durante a transição.
11. Nenhuma mudança de framework, paleta ou arquitetura visual faz parte desta entrega.

## Arquitetura

```text
Recepção / Admin / Profissional
              |
              v
      Appointment Service
              |
      valida comando/ator
              |
              v
      transição canônica
              |
              +---- grava estado
              |
              +---- grava Domain Event Outbox
              |
              v
       Event Dispatcher
              |
              v
          Event Bus
       /   /   |   \   \
     CRM Fin Estoque Odonto WhatsApp
              |
              +--> Retornos / Repasse quando aplicável
```

No modo LAN:

```text
Estação profissional
   clinical.db local
         |
  comando operacional
         |
         v
   Clinic Network
         |
         v
      Clinic Hub
  [Electron Main]
         |
  clinic.db canônico
   + domain_events
         |
         v IPC/notificação
  Renderer do Hub
         |
  Event Dispatcher
         |
     Domain Event Bus
         |
 efeitos administrativos
```

Se o renderer do Hub estiver indisponível no instante da mutação, o evento permanece em `domain_events` e será consumido depois. A arquitetura não depende de uma janela específica estar pronta no exato momento da gravação.

## Componentes

### 1. `js/core/domain-event-bus.js`
Event Bus síncrono de processo para eventos de domínio conhecidos.

Responsabilidades:
- `subscribe(eventName, handler)`;
- `publish(event)`;
- validação mínima do envelope;
- isolamento de falhas entre subscribers;
- prevenção de registro duplicado do mesmo handler;
- suporte a testes sem DOM.

Não será broker externo nem terá persistência própria. A durabilidade dos eventos pertence à outbox no `clinic.db`.

Envelope base:

```js
{
  eventId,
  type,
  aggregate: 'appointment',
  aggregateId,
  occurredAt,
  actor: { userId, role, professionalId },
  source: 'hub' | 'standalone' | 'remote-professional',
  mutationId,
  payload
}
```

`eventId` será estável dentro da operação. Quando o evento vier de mutação LAN, o `mutationId` será propagado para permitir correlação e idempotência ponta a ponta.

### 2. `js/core/appointment-workflow.js`
Modelo puro de transições e autorização operacional.

Estados oficiais:
- `agendado`
- `confirmado`
- `espera`
- `atendimento`
- `realizado`
- `cancelado`

Transições principais:

```text
agendado -> confirmado
agendado -> espera
confirmado -> espera
espera -> atendimento
atendimento -> realizado
agendado|confirmado|espera -> cancelado
```

Regras:
- Recepção/admin pode criar agendamento, confirmar, registrar chegada e cancelar.
- Profissional remoto não cria nem altera grade/cadastro administrativo nesta entrega.
- Profissional pode iniciar e concluir somente atendimento próprio.
- Operações inválidas são rejeitadas antes de gravar o estado.
- `realizado` e `cancelado` são terminais no fluxo padrão.

O módulo não acessa DOM nem filesystem.

### 3. `js/core/domain-event-outbox.js`
Adaptador para persistência e consulta dos eventos canônicos no banco compartilhado.

Tabela prevista:

```sql
CREATE TABLE IF NOT EXISTS domain_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id INTEGER,
  mutation_id TEXT,
  source TEXT NOT NULL,
  actor_json TEXT,
  payload_json TEXT,
  occurred_at TEXT NOT NULL,
  dispatched_at TEXT,
  last_error TEXT
);
```

Responsabilidades:
- inserir evento na mesma transação lógica da mudança de estado quando possível;
- listar eventos ainda não despachados;
- marcar dispatch concluído somente depois da passagem pelo dispatcher;
- preservar `last_error` para diagnóstico/retry;
- impedir duplicidade por `event_id`.

`domain_events` é uma outbox operacional, não um log de event sourcing. Eventos concluídos podem receber política de retenção/pruning futura; isso não faz parte desta entrega.

### 4. `js/domains/appointment-orchestrator.js`
Porta de entrada do renderer para operações de agenda.

Responsabilidades:
- traduzir ações de UI em comandos de domínio;
- consultar sessão/ator;
- aplicar `appointment-workflow`;
- persistir localmente quando standalone/Hub;
- criar evento na outbox para transições canônicas locais;
- delegar mutação ao Clinic Network quando em modo profissional remoto;
- atualizar UI após sucesso;
- preservar compatibilidade temporária com funções globais existentes.

As funções globais continuam existindo enquanto os call sites legados são migrados, mas deixam de conter regras de negócio próprias.

### 5. `js/domains/domain-event-dispatcher.js`
Consumidor da outbox no renderer autorizado.

Responsabilidades:
- carregar eventos pendentes do `clinic.db`;
- publicar cada evento no `domain-event-bus`;
- executar subscribers idempotentes;
- marcar o evento como despachado quando todos os efeitos exigidos foram concluídos ou reconhecidos como já aplicados;
- deixar evento pendente/reconciliável se algum efeito falhar;
- rodar após bootstrap, mutação local, notificação do Hub e sincronização/reconexão.

### 6. `js/domains/appointment-effects.js`
Registro central dos subscribers derivados.

Eventos iniciais:
- `appointment.created`
- `appointment.confirmed`
- `patient.arrived`
- `appointment.started`
- `appointment.completed`
- `appointment.cancelled`

Subscribers previstos:

#### `appointment.created`
- CRM: atualizar estágio/oportunidade;
- WhatsApp: criar confirmação/lembretes;
- Odontologia: vincular tratamento quando aplicável.

#### `appointment.confirmed`
- CRM: registrar confirmação;
- WhatsApp: ajustar fila quando necessário.

#### `patient.arrived`
- atualizar indicadores operacionais/sala de espera.

#### `appointment.started`
- atualizar estado operacional;
- abrir prontuário somente no renderer autorizado, sem mover dado clínico ao Hub.

#### `appointment.completed`
- Financeiro: gerar/atualizar recebível aplicável;
- Odontologia/dental-finance: refletir procedimento realizado;
- Estoque: consumir itens vinculados;
- CRM: atualizar acompanhamento/retorno;
- WhatsApp: cancelar mensagens pré-consulta e preparar follow-up quando configurado;
- Repasse: gerar/atualizar obrigação quando as regras atuais exigirem.

#### `appointment.cancelled`
- Financeiro: cancelar efeitos não liquidados quando aplicável;
- CRM: registrar cancelamento;
- WhatsApp: cancelar mensagens futuras;
- Odontologia: atualizar vínculo quando aplicável.

## Autoridade e persistência

### Standalone
O computador local:
1. valida o comando;
2. grava alteração no `clinic.db`;
3. grava o evento na outbox;
4. solicita dispatch;
5. subscribers executam efeitos;
6. evento é marcado como despachado quando concluído.

### Hub — operação local
Segue o mesmo caminho do standalone usando o `clinic.db` canônico.

### Profissional remoto
A estação profissional:
1. valida preliminarmente ownership/transição para feedback imediato;
2. atualiza o espelho local apenas como estado otimista controlado;
3. envia comando ao Hub com `mutationId`;
4. o Hub valida novamente no Electron Main;
5. o Hub grava a mudança em `agenda` e o registro em `domain_events` dentro da mesma operação transacional do `clinic.db`;
6. o Hub notifica o renderer que existem eventos pendentes;
7. o dispatcher do renderer recarrega o banco compartilhado canônico e processa a outbox;
8. efeitos administrativos são executados apenas no lado Hub;
9. a estação profissional recebe confirmação/snapshot posterior.

Se a notificação IPC não for entregue porque o renderer reiniciou/crashou, o evento continua na outbox e o bootstrap posterior executa o dispatcher.

A estação profissional não executa Financeiro, Repasse, Estoque administrativo ou outros efeitos compartilhados em paralelo.

## Idempotência

### Mutação de rede
A tabela `network_mutations` existente continua impedindo aplicação duplicada da mesma mutação LAN.

### Evento canônico
`domain_events.event_id` impede duplicidade do mesmo evento.

### Efeitos de domínio
Será criada tabela compartilhada:

```sql
CREATE TABLE IF NOT EXISTS domain_event_effects (
  event_id TEXT NOT NULL,
  effect_key TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id INTEGER,
  applied_at TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (event_id, effect_key)
);
```

Cada subscriber possui `effect_key` estável, por exemplo:
- `finance.appointment-completed`
- `inventory.appointment-completed`
- `crm.appointment-completed`
- `whatsapp.appointment-completed`
- `payout.appointment-completed`

Antes do efeito, verifica-se a chave. Após sucesso, registra-se a aplicação na mesma transação quando tecnicamente possível.

Reprocessar o mesmo `eventId` não duplica cobrança, baixa de estoque, repasse ou follow-up.

## Falhas de subscriber
Um evento canônico não perde a transição de agenda porque um efeito secundário falhou.

Estratégia:
- estado da agenda + evento canônico são persistidos primeiro;
- subscribers executam individualmente;
- sucesso de cada efeito é registrado em `domain_event_effects`;
- falha é registrada em `domain_events.last_error`/auditoria;
- evento permanece pendente até que os efeitos obrigatórios estejam aplicados;
- dispatcher/reconciliação pode tentar novamente com segurança.

Efeitos financeiros/estoque usam transações próprias e proteções existentes.

## Reconciliação
Será disponibilizada função interna `reconcileAppointmentEvents()` para:
- consumir `domain_events` não despachados;
- identificar efeitos faltantes pelo `event_id`;
- reexecutar somente o que ainda não possui `effect_key` aplicado;
- limpar `last_error` após recuperação.

Uso:
- bootstrap do renderer Hub/standalone;
- após mutação local;
- após notificação `clinic-network:hub-mutation-applied`;
- após flush da fila offline;
- após sync/reconexão;
- em testes de recuperação.

A reconciliação não recria indiscriminadamente eventos históricos anteriores à migração. Ela opera somente sobre eventos registrados pela nova outbox.

## Modo offline do profissional
O `clinical.db` continua disponível normalmente.

Se o Hub estiver indisponível:
- prontuário permanece local;
- mudança operacional compartilhada entra na fila existente;
- UI mostra estado pendente de sincronização;
- nenhum efeito administrativo é criado localmente;
- quando a fila for enviada, o Hub aplica a mutação, grava o evento na outbox e os efeitos são consumidos uma única vez.

## Segurança
- Renderer continua sem `nodeIntegration`.
- Event Bus do renderer não recebe acesso a filesystem/socket.
- Hub aceita somente comandos de domínio allowlisted.
- `clinical.db` nunca entra no Event Bus compartilhado nem trafega pela rede.
- Eventos não transportam SOAP, anamnese, exames, prescrições ou anexos clínicos.
- Payload usa somente identificadores e dados operacionais mínimos necessários aos efeitos administrativos.
- Regras de papel/ownership são verificadas no Hub mesmo que tenham sido verificadas no cliente.
- IPC novo expõe somente sinalização/consulta necessária à outbox; não expõe SQL arbitrário.

## Migração dos wrappers existentes

### Etapa 1 — Infraestrutura
Adicionar Event Bus, workflow, outbox, migrations e testes sem alterar comportamento visual.

### Etapa 2 — Orquestrador
Fazer funções globais atuais delegarem ao `appointment-orchestrator`.

### Etapa 3 — Eventos locais
Migrar efeitos de `operations-integration.js` para subscribers de `appointment-effects.js` e despachar via outbox.

### Etapa 4 — Hub/Main
Alterar `clinic-hub-database.js` para gravar a transição e o evento canônico na mesma transação; `clinic-network-main.js` passa apenas a sinalizar ao renderer que há outbox pendente.

### Etapa 5 — Remover duplicidade
Desativar wrappers antigos de status depois que todos os efeitos estiverem cobertos por eventos e testes.

### Etapa 6 — Reconciliação e regressão
Cobrir eventos duplicados, falha entre processos, renderer reiniciado, fila offline, reconexão, cancelamento, atendimento concluído e isolamento entre profissionais.

## Arquivos principais previstos
Novos:
- `js/core/domain-event-bus.js`
- `js/core/domain-event-outbox.js`
- `js/core/appointment-workflow.js`
- `js/domains/appointment-orchestrator.js`
- `js/domains/domain-event-dispatcher.js`
- `js/domains/appointment-effects.js`
- `test/domain-event-bus.test.js`
- `test/domain-event-outbox.test.js`
- `test/appointment-workflow.test.js`
- `test/appointment-orchestrator.test.js`
- `test/appointment-effects.test.js`
- `test/clinic-network-event-integration.test.js`

Modificados principalmente:
- `js/core/navigation.js`
- `js/core/migrations.js`
- `js/domains/agenda.js`
- `js/domains/operations-integration.js`
- `js/domains/clinic-network-workflow.js`
- `js/core/clinic-hub-database.js`
- `js/core/clinic-network-main.js`
- `preload.js` apenas se necessário para sinalização segura da outbox

Mudanças em CRM/Financeiro/Estoque/Odonto/WhatsApp devem ser pequenas e limitadas a expor handlers idempotentes quando o comportamento atual não puder ser reutilizado diretamente.

## Compatibilidade
- Electron + JavaScript permanecem.
- Não migrar para React.
- Não mudar paleta ou redesign nesta entrega.
- APIs globais legadas permanecem como adaptadores durante a migração.
- Bancos existentes recebem apenas migração incremental compatível.
- Clinic Hub LAN e pareamento existentes são preservados.
- Backup V3 inclui as novas tabelas compartilhadas por estarem no `clinic.db`.

## Testes obrigatórios
1. Event Bus publica uma vez para subscribers registrados.
2. Falha de um subscriber não impede os demais de registrar seus próprios resultados.
3. Transição inválida é recusada.
4. Profissional não altera agendamento de outro profissional.
5. Recepção não inicia/escreve prontuário clínico.
6. Mudança de estado e criação do evento são atômicas no Hub.
7. `appointment.completed` gera efeitos previstos uma única vez.
8. Repetir `eventId` não duplica financeiro.
9. Repetir `eventId` não duplica estoque.
10. Repetir `eventId` não duplica CRM/WhatsApp/repasse.
11. Mutação LAN duplicada continua idempotente.
12. Mutação offline aplicada após reconexão gera efeitos somente no Hub.
13. Renderer indisponível no instante da mutação não perde o evento.
14. Bootstrap posterior consome evento pendente da outbox.
15. Falha de efeito permite reconciliação posterior.
16. `clinical.db` não é acessado pelo Hub durante eventos operacionais.
17. Suíte existente permanece verde.
18. Lint e testes de arquitetura continuam verdes.

## Critérios de aceite
1. Toda transição de agenda relevante passa por um único modelo de workflow.
2. Toda transição aceita produz e persiste evento de domínio previsível.
3. CRM, Financeiro, Estoque, Odontologia e WhatsApp deixam de depender da interceptação de `mudarStatus` para o fluxo principal.
4. O mesmo `appointment.completed` produz os mesmos efeitos no modo standalone e via Clinic Hub.
5. Eventos, mutações e efeitos são idempotentes.
6. Eventos remotos sobrevivem a reinício/falha temporária do renderer Hub.
7. Profissional remoto continua atendendo com `clinical.db` local durante indisponibilidade do Hub.
8. Nenhum dado clínico privado é enviado ao Hub.
9. Nenhuma funcionalidade atual de agenda é perdida.
10. Não há duplicação de cobrança, estoque, repasse ou follow-up após reconexão/retry.
11. Testes existentes e novos passam antes da remoção dos wrappers legados.

## Não objetivos
- Microserviços.
- Broker externo (Kafka, RabbitMQ, Redis etc.).
- Cloud/SaaS.
- Sincronização de prontuário entre computadores.
- Redesign visual.
- Reescrita geral dos módulos existentes.
- Event sourcing completo.

Esta entrega usa uma outbox persistente + eventos de domínio para desacoplamento e consistência operacional; o histórico de eventos serve à entrega confiável dos efeitos, não como fonte primária para reconstruir todo o estado do sistema.
