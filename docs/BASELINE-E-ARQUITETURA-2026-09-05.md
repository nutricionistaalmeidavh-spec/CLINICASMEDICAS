# Baseline funcional e arquitetura — Fases 1 e 2

**Data:** 5 de setembro de 2026  
**Repositório:** `nutricionistaalmeidavh-spec/CLINICASMEDICAS`  
**Baseline da main analisada:** árvore `fef80ec2a3a6723ca1f826e5356647405b07b996`  
**Objetivo:** preparar o sistema para o redesign sem perder fluxos, dados ou permissões existentes.

## Fase 1 — Baseline funcional congelada

### Stack e execução

- Electron `22.3.27`.
- Renderer em HTML/CSS/JavaScript sem framework.
- `sql.js` como banco SQLite local.
- Persistência do banco criptografada via `safeStorage` no Electron; fallback para `localStorage` fora do Electron.
- Empacotamento Windows por `electron-builder`/NSIS.

### Shell e páginas

| Página | Perfis visíveis no menu | Inicialização ao navegar |
| --- | --- | --- |
| Dashboard | admin, médico, recepção | indicadores de pacientes, profissionais, consultas e caixa |
| Agenda | admin, médico, recepção | selects, data, grade, agenda diária e sala de espera |
| Prontuário (PEP) | admin, médico | pacientes/profissionais, SOAP e histórico |
| Pacientes | admin, médico, recepção | cadastro, edição, inativação e acesso ao PEP |
| Profissionais | admin | cadastro e percentual de repasse |
| Convênios | admin, recepção | convênios e procedimentos |
| Documentos & PDF | admin, médico | templates, paciente/profissional, impressão/PDF/TXT |
| Caixa | admin, recepção | entradas, saídas e saldo |
| Repasses | admin | cálculo, registro e pagamento |
| Configurações | admin, médico, recepção | identidade, usuários, senha, backup/restauração |

### Agenda e fluxo assistencial

A Agenda contém quatro visualizações que devem ser preservadas durante o redesign:

1. Grade diária por horários.
2. Sala de espera em três estados: agendados, aguardando e atendimento/finalizados.
3. Lista completa.
4. Grade de horários dos profissionais.

Fluxo principal:

`Agendamento -> confirmação/chegada -> sala de espera -> atendimento -> PEP -> finalização`.

Também existe confirmação por WhatsApp, filtro por profissional e prevenção de conflito de horário por profissional/data/hora.

### PEP

O prontuário já contempla:

- seleção de paciente e profissional responsável;
- resumo do paciente;
- alergias;
- comorbidades e medicamentos contínuos;
- tipo de atendimento;
- SOAP;
- pressão arterial, frequência cardíaca, temperatura, peso, altura e IMC;
- CID-10 e hipótese diagnóstica;
- plano/conduta;
- prescrição;
- linha do tempo de atendimentos;
- impressão de receita e resumo clínico.

### Persistência e tabelas

Tabelas identificadas:

- `usuarios`
- `pacientes`
- `profissionais`
- `convenios`
- `procedimentos`
- `agenda`
- `grade_horarios`
- `caixa`
- `repasses`
- `prontuario_atendimentos`
- `documentos_emitidos`
- `documentos_templates`
- `configuracoes`

A Fase 2 não altera schema, migrações nem formato do banco.

### Interfaces Electron que não podem ser quebradas

O preload/main process fornece recursos para:

- carregar e salvar banco criptografado;
- backup e restauração;
- salvar documento em arquivo;
- gerar PDF;
- imprimir documento;
- abrir URL externa/WhatsApp;
- hash de senha exposto ao renderer.

### Pontos de acoplamento encontrados

`js/app.js` concentra aproximadamente todo o comportamento do renderer: autenticação, RBAC, navegação, utilitários, pacientes, profissionais, agenda, PEP, documentos, caixa, repasses e configurações. Isso torna uma alteração visual ampla arriscada porque funções sem relação direta compartilham o mesmo arquivo e o mesmo escopo global.

## Fase 2 — Primeira separação arquitetural segura

### Regra da refatoração

Nesta fase não há redesign, mudança de banco, mudança de regra clínica nem alteração deliberada dos fluxos. O objetivo é criar fronteiras para que as próximas alterações possam ocorrer por domínio.

### Módulos extraídos

| Arquivo | Responsabilidade |
| --- | --- |
| `js/core/utils.js` | dinheiro, escape HTML, CPF, datas e idade |
| `js/core/access-control.js` | regras de visibilidade por perfil e página inicial por papel |
| `js/core/clinic.js` | transformação das configurações da clínica para o contrato usado por documentos |
| `js/core/auth.js` | login/logout e aplicação das permissões de menu |
| `js/core/navigation.js` | navegação, carregadores de página e abas |

### Estratégia de compatibilidade

Os módulos `core` são carregados **depois** de `js/app.js`. Assim:

- o estado legado atual (`currentUser`, paciente do PEP, repasse selecionado e data da agenda) continua intacto;
- handlers e funções já usados pelo HTML mantêm os mesmos nomes globais;
- os módulos extraídos passam a ser a implementação ativa das funções transversais;
- nenhum atributo `onclick`, `onchange`, ID de elemento ou contrato do banco precisa ser alterado agora.

Esse desenho reduz o risco desta primeira etapa. O monólito permanece temporariamente como camada de compatibilidade até os domínios serem retirados dele em etapas menores e testadas.

### Sequência recomendada para a próxima refatoração

Sem misturar com o redesign visual, a continuação deve extrair em lotes independentes:

1. `patients` e `professionals`;
2. `agenda` e sala de espera;
3. `pep` e documentos clínicos;
4. `financial` (caixa/repasses);
5. `settings/users`;
6. por último, reduzir `app.js` a bootstrap/compatibilidade e removê-lo quando não houver mais dependências.

## Testes adicionados

A Fase 2 adiciona testes para:

- utilitários extraídos;
- regras de acesso e landing page por perfil;
- transformação da configuração institucional;
- ordem de carregamento dos módulos no renderer.

Os testes existentes de data/hora, IMC, WhatsApp e tempo de espera permanecem no mesmo comando `npm test`.

## Fora do escopo destas fases

- redesign de sidebar, PEP ou outras telas;
- troca de Electron;
- troca de `sql.js`;
- backend/cloud;
- alteração da regra de autenticação;
- alteração dos perfis existentes;
- mudança do banco ou migração de dados;
- remoção de funcionalidades existentes.

## Critério para iniciar o redesign

O redesign pode começar sobre esta base quando `npm run lint` e `npm test` estiverem verdes na branch e o diff permanecer sem mudanças de schema ou regras funcionais. Cada página poderá então ser modernizada isoladamente, mantendo IDs/contratos ou migrando-os com testes específicos.
