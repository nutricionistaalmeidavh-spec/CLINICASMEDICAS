# Plennus Clinic — Appointment Domain Event Bus Design

## Objetivo
Consolidar o fluxo operacional `Recepção → Clinic Hub → Profissional → Atendimento → efeitos administrativos` em uma arquitetura orientada a eventos de domínio, removendo a dependência crescente de wrappers globais e garantindo que o mesmo evento produza os mesmos efeitos independentemente de ter sido originado localmente no Hub ou em uma estação profissional remota.

A mudança preserva o modelo local-first, Electron + JavaScript, o `clinic.db` como autoridade compartilhada no Hub e o `clinical.db` de cada profissional fisicamente local.

## Problema atual
O fluxo operacional é composto por funções globais (`agendarConsulta`, `mudarStatus`, `marcarChegadaEspera`, `chamarParaAtendimento`) que são interceptadas por módulos carregados em sequência.

Hoje:
- `operations-integration.js` adiciona efeitos para CRM, Financeiro, Estoque, Odontologia e WhatsApp;
- `workflow-completion.js` complementa vínculos e validações;
- `clinic-network-workflow.js` substitui parte das operações quando o profissional está conectado remotamente;
- o Hub aplica `agenda.updateStatus` diretamente no `clinic.db` e notifica a UI, sem uma camada canônica única responsável pelos efeitos administrativos.

O resultado é funcional, porém a execução dos efeitos depende do caminho e da ordem de carregamento dos wrappers.

## Princípios
1. Um único comando operacional gera uma única transição de estado.
2. Uma transição aceita gera um único evento de domínio canônico.
3. Efeitos derivados escutam eventos; não interceptam funções de UI.
4. Eventos e efeitos são idempotentes.
5. O Hub é autoridade sobre estado operacional compartilhado.
6. O prontuário clínico permanece local ao profissional.
7. Não existe SQL remoto livre.
8. A migração será incremental e compatível com as APIs globais existentes durante a transição.
9. Nenhuma mudança de framework, paleta ou arquitetura visual faz parte desta entrega.

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
              v
         Domain Event
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
         |
  clinic.db canônico
         |
         v
   Domain Event Bus
         |
 efeitos administrativos
```

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

Não será um message broker genérico, não usará dependência externa e não terá persistência própria.

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

`eventId` será estável dentro da operação. Quando o evento vier de uma mutação LAN, o `mutationId` será propagado para permitir reconciliação e idempotência ponta a ponta.

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

### 3. `js/domains/appointment-orchestrator.js`
Porta de entrada do renderer para operações de agenda.

Responsabilidades:
- traduzir ações de UI em comandos de domínio;
- consultar sessão/ator;
- aplicar `appointment-workflow`;
- persistir localmente quando standalone/Hub;
- delegar mutação ao Clinic Network quando em modo profissional remoto;
- publicar eventos após confirmação da transição canônica;
- atualizar UI após sucesso;
- preservar compatibilidade temporária com funções globais existentes.

As funções globais continuam existindo enquanto os call sites legados são migrados, mas deixam de conter regras de negócio próprias.

### 4. `js/domains/appointment-effects.js`
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
O computador local grava `clinic.db`, cria o evento e executa os subscribers localmente.

### Hub
A máquina Hub grava o `clinic.db`, cria o evento canônico e executa os subscribers administrativos.

### Profissional remoto
A estação profissional:
1. valida preliminarmente ownership e transição para feedback imediato;
2. atualiza o espelho local apenas como estado otimista controlado;
3. envia comando ao Hub com `mutationId`;
4. o Hub valida novamente;
5. o Hub grava o estado canônico;
6. o Hub cria/publica o evento;
7. os efeitos administrativos são executados no Hub;
8. a estação recebe confirmação/snapshot posterior.

A estação profissional não executa Financeiro, Repasse ou outros efeitos administrativos em paralelo.

## Idempotência

### Mutação de rede
A tabela `network_mutations` existente continua impedindo aplicação duplicada da mesma mutação LAN.

### Efeitos de domínio
Será criada uma tabela compartilhada, por exemplo:

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

Antes do efeito, verifica-se a chave. Após sucesso, registra-se a aplicação na mesma transação quando tecnicamente possível.

Reprocessar um mesmo `eventId` não duplica cobrança, baixa de estoque, repasse ou follow-up.

## Falhas de subscriber
Um evento canônico não perde a transição de agenda porque um efeito secundário falhou.

Estratégia:
- persistir a transição principal primeiro;
- executar subscribers individualmente;
- registrar sucesso por efeito;
- registrar falha/auditoria sem marcar o efeito como aplicado;
- permitir reconciliação posterior dos efeitos pendentes.

Efeitos financeiros/estoque devem usar transações próprias e suas proteções já existentes.

## Reconciliação
Será disponibilizada função interna `reconcileAppointmentEffects(appointmentId)` para comparar o estado canônico do agendamento com efeitos esperados ainda não registrados.

Uso:
- após mutação remota aplicada;
- após flush da fila offline;
- opcionalmente no bootstrap do Hub para eventos terminais recentes;
- em testes de recuperação.

A reconciliação não recria indiscriminadamente eventos históricos. Ela opera somente sobre estados/efeitos explicitamente reconhecidos pelo novo modelo.

## Modo offline do profissional
O `clinical.db` continua disponível normalmente.

Se o Hub estiver indisponível:
- prontuário permanece local;
- mudança operacional compartilhada entra na fila já existente;
- UI mostra estado pendente de sincronização;
- nenhum efeito administrativo é criado localmente;
- quando a fila for enviada, o Hub aplica a mutação, gera o evento e executa efeitos uma única vez.

## Segurança
- Renderer continua sem `nodeIntegration`.
- Event Bus do renderer não recebe acesso a filesystem/socket.
- Hub aceita somente comandos de domínio allowlisted.
- `clinical.db` nunca entra no Event Bus compartilhado nem trafega pela rede.
- Eventos não transportam SOAP, anamnese, exames, prescrições ou anexos clínicos.
- Payload usa somente identificadores e dados operacionais mínimos necessários aos efeitos administrativos.
- Regras de papel/ownership são verificadas no Hub mesmo que tenham sido verificadas no cliente.

## Migração dos wrappers existentes

### Etapa 1 — Infraestrutura
Adicionar Event Bus, modelo de transição e testes unitários sem alterar comportamento de UI.

### Etapa 2 — Orquestrador
Fazer as funções globais atuais delegarem ao `appointment-orchestrator`.

### Etapa 3 — Eventos locais
Migrar efeitos de `operations-integration.js` para subscribers de `appointment-effects.js`.

### Etapa 4 — Hub
Fazer `clinic-hub-database.js` devolver contexto suficiente da mutação aplicada e fazer `clinic-network-main.js` publicar/reconciliar o evento no processo canônico.

### Etapa 5 — Remover duplicidade
Desativar os wrappers antigos de status depois que todos os efeitos estiverem cobertos por eventos e testes.

### Etapa 6 — Reconciliação e regressão
Adicionar testes de eventos duplicados, fila offline, reconexão, cancelamento, atendimento concluído e isolamento entre profissionais.

## Arquivos principais previstos
Novos:
- `js/core/domain-event-bus.js`
- `js/core/appointment-workflow.js`
- `js/domains/appointment-orchestrator.js`
- `js/domains/appointment-effects.js`
- `test/domain-event-bus.test.js`
- `test/appointment-workflow.test.js`
- `test/appointment-orchestrator.test.js`
- `test/appointment-effects.test.js`
- `test/clinic-network-event-integration.test.js`

Modificados principalmente:
- `js/core/navigation.js`
- `js/domains/agenda.js`
- `js/domains/operations-integration.js`
- `js/domains/clinic-network-workflow.js`
- `js/core/clinic-hub-database.js`
- `js/core/clinic-network-main.js`
- migrations/schema aplicável

Mudanças em módulos CRM/Financeiro/Estoque/Odonto/WhatsApp devem ser pequenas e limitadas a expor handlers idempotentes quando o comportamento atual não puder ser reutilizado diretamente.

## Compatibilidade
- Electron + JavaScript permanecem.
- Não migrar para React.
- Não mudar paleta ou redesign nesta entrega.
- APIs globais legadas permanecem como adaptadores durante a migração.
- Bancos existentes recebem apenas migração incremental compatível.
- Clinic Hub LAN e pareamento existentes são preservados.
- Backup V3 deve incluir naturalmente a nova tabela compartilhada por estar no `clinic.db`.

## Testes obrigatórios
1. Event Bus publica uma vez para subscribers registrados.
2. Falha de um subscriber não impede os demais.
3. Transição inválida é recusada.
4. Profissional não altera agendamento de outro profissional.
5. Recepção não inicia/escreve prontuário clínico.
6. `appointment.completed` gera os efeitos previstos uma única vez.
7. Repetir `eventId` não duplica financeiro.
8. Repetir `eventId` não duplica estoque.
9. Repetir `eventId` não duplica CRM/WhatsApp/repasse.
10. Mutação LAN duplicada continua idempotente.
11. Mutação offline aplicada após reconexão gera efeitos somente no Hub.
12. Falha de efeito permite reconciliação posterior.
13. `clinical.db` não é acessado pelo Hub durante eventos operacionais.
14. Suite existente permanece verde.
15. Lint e testes de arquitetura continuam verdes.

## Critérios de aceite
1. Toda transição de agenda relevante passa por um único modelo de workflow.
2. Toda transição aceita produz evento de domínio previsível.
3. CRM, Financeiro, Estoque, Odontologia e WhatsApp deixam de depender da interceptação de `mudarStatus` para o fluxo principal.
4. O mesmo `appointment.completed` produz os mesmos efeitos no modo standalone e via Clinic Hub.
5. Eventos e efeitos são idempotentes.
6. Profissional remoto pode continuar atendendo com `clinical.db` local durante indisponibilidade do Hub.
7. Nenhum dado clínico privado é enviado ao Hub.
8. Nenhuma funcionalidade atual de agenda é perdida.
9. Não há duplicação de cobrança, estoque, repasse ou follow-up após reconexão/retry.
10. Testes existentes e novos passam antes da remoção dos wrappers legados.

## Não objetivos
- Microserviços.
- Broker externo (Kafka, RabbitMQ, Redis etc.).
- Cloud/SaaS.
- Sincronização de prontuário entre computadores.
- Redesign visual.
- Reescrita geral dos módulos existentes.
- Persistência de todos os eventos históricos como event sourcing.

Esta entrega usa eventos de domínio para desacoplamento e consistência operacional; não transforma o Plennus Clinic em uma arquitetura de event sourcing completo.
