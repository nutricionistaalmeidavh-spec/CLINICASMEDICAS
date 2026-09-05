# Baseline funcional e arquitetura — Fases 1 e 2

**Data:** 5 de setembro de 2026  
**Repositório:** `nutricionistaalmeidavh-spec/CLINICASMEDICAS`  
**Baseline da main analisada:** `fef80ec2a3a6723ca1f826e5356647405b07b996`  
**Objetivo:** preparar o sistema para o redesign sem perder fluxos, dados ou permissões existentes.

## Fase 1 — Baseline funcional congelada

### Stack

- Electron `22.3.27`.
- Renderer em HTML/CSS/JavaScript sem framework.
- `sql.js` como SQLite local.
- Persistência criptografada via `safeStorage` no Electron; fallback para `localStorage` fora do Electron.
- Empacotamento Windows com `electron-builder`/NSIS.

### Páginas e perfis

| Página | Perfis | Fluxos preservados |
| --- | --- | --- |
| Dashboard | admin, médico, recepção | indicadores de pacientes, profissionais, consultas e caixa |
| Agenda | admin, médico, recepção | agenda diária, fila, lista, grade e WhatsApp |
| Prontuário (PEP) | admin, médico | SOAP, sinais vitais, CID, conduta, prescrição e histórico |
| Pacientes | admin, médico, recepção | cadastro, edição, inativação e acesso ao PEP |
| Profissionais | admin | cadastro e percentual de repasse |
| Convênios | admin, recepção | convênios e procedimentos |
| Documentos & PDF | admin, médico | templates, impressão, PDF e TXT |
| Caixa | admin, recepção | entradas, saídas e saldo |
| Repasses | admin | cálculo, registro e pagamento |
| Configurações | admin, médico, recepção | identidade, usuários, senha, backup/restauração |

### Fluxo assistencial principal

`Agendamento -> confirmação/chegada -> sala de espera -> atendimento -> PEP -> finalização`

A Agenda mantém quatro visualizações: grade diária, sala de espera, lista completa e grade de horários. Também permanecem filtro por profissional, confirmação via WhatsApp e bloqueio de conflito de horário.

### PEP

O prontuário mantém seleção de paciente/profissional, resumo clínico, alergias, comorbidades, medicamentos contínuos, SOAP, pressão arterial, frequência cardíaca, temperatura, peso, altura, IMC, CID-10, hipótese diagnóstica, plano/conduta, prescrição, timeline e impressão/PDF.

### Persistência

Tabelas preservadas sem alteração de schema:

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

### Interfaces Electron preservadas

- carregar/salvar banco criptografado;
- backup/restauração;
- salvar documento;
- gerar PDF;
- imprimir;
- abrir URL externa/WhatsApp;
- hash de senha no preload.

## Fase 2 — Renderer modularizado

O `js/app.js`, antes responsável por praticamente todo o renderer, foi reduzido ao bootstrap e ao estado global transitório necessário para compatibilidade.

### Core transversal

| Arquivo | Responsabilidade |
| --- | --- |
| `js/core/utils.js` | dinheiro, HTML escape, CPF, datas e idade |
| `js/core/access-control.js` | RBAC de menu, labels e landing page por perfil |
| `js/core/clinic.js` | configuração/identidade institucional |
| `js/core/auth.js` | login, logout e aplicação de permissões |
| `js/core/navigation.js` | navegação, abas, page loaders e carregamento transitório dos domínios |

### Domínios

| Arquivo | Responsabilidade |
| --- | --- |
| `js/domains/dashboard.js` | indicadores do dashboard |
| `js/domains/patients.js` | pacientes |
| `js/domains/professionals.js` | profissionais |
| `js/domains/agenda.js` | agenda, grade, sala de espera e WhatsApp |
| `js/domains/pep.js` | prontuário e evolução clínica |
| `js/domains/documents.js` | documentos, PDFs, convênios e procedimentos |
| `js/domains/finance.js` | caixa e repasses |
| `js/domains/settings.js` | identidade, usuários, senha e backup |

### Compatibilidade

Para não alterar o HTML inteiro nem os contratos dos handlers nesta fase, os nomes globais usados por `onclick`/`onchange` foram preservados. `navigation.js`, já carregado pelo renderer, registra e carrega os arquivos de domínio sincronamente durante o parsing. É uma ponte transitória: no redesign, os handlers inline podem ser eliminados e os domínios carregados diretamente pelo shell.

Não houve mudança deliberada de:

- IDs dos elementos;
- regras clínicas;
- SQL/schema;
- perfis e permissões;
- formato do banco;
- IPC/preload;
- layout visual.

## Testes e CI

Foi criado workflow de CI para executar em push/PR:

1. `npm ci`;
2. `npm run lint` com `node --check` em core e domínios;
3. `npm test`.

A suíte cobre, além dos testes anteriores, utilitários extraídos, regras de acesso, configuração institucional e invariantes da arquitetura modular.

## Fora do escopo

- redesign visual;
- upgrade do Electron;
- backend/cloud;
- troca do `sql.js`;
- alteração da autenticação;
- migração de banco;
- novas funcionalidades clínicas.

## Próximo passo seguro

Com lint e testes verdes, o redesign pode avançar página por página. A nova separação permite alterar Dashboard, Agenda, Pacientes, PEP e demais módulos isoladamente, reduzindo o risco de regressão cruzada.
