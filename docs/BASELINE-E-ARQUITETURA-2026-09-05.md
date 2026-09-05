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

Tabelas preservadas sem alteração de schema na baseline:

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
- SQL/schema da baseline;
- perfis e permissões;
- formato do banco;
- layout visual.

## Extensão clínica — Patient Workspace e módulos 1–6

A branch `feat/patient-workspace-clinical-modules` estende a arquitetura modular sem substituir Agenda, PEP, Documentos, Caixa ou Repasses.

### Core clínico

| Arquivo | Responsabilidade |
| --- | --- |
| `js/core/clinical-model.js` | estados de consentimento, classificação apenas referencial de resultados numéricos, ordenação clínica, séries longitudinais, validação de metadados e pendências derivadas |

### Novos domínios

| Arquivo | Responsabilidade |
| --- | --- |
| `js/domains/patient-workspace.js` | workspace do paciente e abas clínicas |
| `js/domains/clinical-files.js` | metadados e acesso a arquivos/álbum clínico |
| `js/domains/consents.js` | termos, autorizações, recusas e revogações com histórico |
| `js/domains/labs.js` | exames laboratoriais estruturados e revisão |
| `js/domains/clinical-timeline.js` | evolução longitudinal de sinais vitais e exames |
| `js/domains/clinical-pending.js` | pendências manuais e pendências automáticas derivadas |

O Patient Workspace organiza o paciente em: `Resumo`, `Atendimentos / PEP`, `Exames`, `Evolução`, `Arquivos clínicos`, `Encaminhamentos / Documentos`, `Termos e consentimentos` e `Pendências`. A aba PEP reutiliza integralmente o formulário e a timeline existentes.

### Schema aditivo

Foram acrescentadas, via `CREATE TABLE IF NOT EXISTS`, as tabelas:

- `arquivos_clinicos`;
- `consentimentos`;
- `exames_laboratoriais`;
- `exames_resultados`;
- `pendencias_clinicas`.

A migração é aditiva. As tabelas anteriores e o formato de persistência criptografada permanecem preservados.

Arquivos clínicos continuam fora do SQLite: o banco armazena apenas nome, categoria, caminho, tipo MIME, observação e datas. O preload expõe seleção e abertura controlada de arquivos; o processo principal aceita somente extensões de documentos/imagens previstas pelo módulo.

### Pendências

Pendências de revisão de exame e de retorno sem agendamento são calculadas durante a leitura e recebem chaves estáveis (`lab:<id>` e `followup:<id>`). Elas não são inseridas repetidamente no banco. Somente pendências manuais são persistidas em `pendencias_clinicas`.

### Evolução longitudinal

A evolução reutiliza sinais vitais já persistidos em `prontuario_atendimentos` e resultados de `exames_resultados`. O sistema não gera hipótese diagnóstica nem interpretação médica automática; quando há limites numéricos explícitos, apresenta apenas a posição do valor em relação ao intervalo registrado.

## Testes e CI

O workflow de CI executa em push/PR:

1. `npm ci`;
2. `npm run lint` com `node --check` em core e domínios;
3. `npm test`.

A suíte cobre utilitários extraídos, regras de acesso, configuração institucional, invariantes da arquitetura modular e os contratos dos seis novos módulos clínicos.

## Fora do escopo desta extensão

- redesign visual completo;
- upgrade do Electron;
- backend/cloud;
- troca do `sql.js`;
- alteração da autenticação;
- telemedicina;
- interoperabilidade EHR;
- assinatura digital certificada;
- integração externa com laboratórios;
- diagnóstico ou recomendação clínica automatizada.

## Próximo passo seguro

Após lint e testes verdes na branch de feature, a revisão pode comparar a extensão clínica com `chore/fases-1-2-arquitetura` antes de qualquer integração. O redesign visual pode então avançar sobre o Patient Workspace sem mover regras clínicas de volta para `js/app.js`.
