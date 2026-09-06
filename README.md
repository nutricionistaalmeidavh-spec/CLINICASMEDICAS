# Plennus Clinic

Sistema desktop de gestão para clínicas médicas e odontológicas, construído com **Electron + JavaScript + sql.js**.

A aplicação foi estruturada para concentrar a jornada operacional da clínica em uma única interface:

`Paciente → Agenda → Atendimento → Prontuário/Odontologia → Financeiro → Retorno`

## Estado atual

- Desktop Windows x64
- Electron 44.2.0
- Persistência clínica local com SQLite via `sql.js`
- Banco do desktop salvo em `userData` como `plennus-clinic.db.enc`
- Criptografia do banco com `safeStorage` do Electron/sistema operacional
- Migrações versionadas e incrementais
- Backup e restauração validados
- Atualização automática via GitHub Releases
- CI, testes e build Windows automatizados no GitHub Actions

> O núcleo clínico funciona localmente. Recursos que dependem de serviços externos, como atualização do aplicativo e abertura do WhatsApp, exigem conexão com a internet.

## Módulos

### Dashboard executivo

- indicadores operacionais e gerenciais
- receita recebida no mês
- ticket médio
- recebíveis vencidos
- pacientes e consultas
- sala de espera
- retornos pendentes
- tratamentos odontológicos ativos
- orçamentos odontológicos pendentes
- estoque crítico
- repasses pendentes
- pendências clínicas e exames
- visibilidade dos indicadores conforme o perfil do usuário

### Agenda

- agenda multiprofissional
- grade de horários
- bloqueio de conflitos
- status do atendimento
- fila/sala de espera
- vínculo com paciente, profissional, procedimento e convênio
- integração com CRM, financeiro, estoque e odontologia
- geração de mensagens operacionais para WhatsApp

### Pacientes e prontuário

- cadastro de pacientes
- validação de CPF
- workspace central do paciente
- prontuário eletrônico
- evolução em SOAP
- sinais vitais e IMC
- CID/diagnóstico
- prescrição
- histórico longitudinal
- arquivos clínicos
- consentimentos
- exames laboratoriais estruturados
- pendências clínicas
- busca global
- importação de pacientes por CSV/XLSX

### Odontologia

- odontograma permanente e decíduo no padrão FDI
- condições por dente e face
- histórico odontológico
- plano de tratamento
- procedimentos por dente/face
- orçamento odontológico
- versionamento de orçamento
- aprovação total ou parcial
- controle de execução do tratamento
- integração com Agenda
- integração com Financeiro
- integração com Estoque
- integração com CRM e WhatsApp
- cobrança baseada no valor efetivamente aprovado

### Financeiro

- contas a pagar e receber
- categorias financeiras
- competência e vencimento
- formas de pagamento
- baixas e cancelamentos
- identificação de títulos vencidos
- caixa
- integração de recebimentos com caixa
- repasse profissional automático
- histórico por competência
- vínculo com paciente, profissional e procedimento

### Estoque clínico

- cadastro de materiais e insumos
- código, unidade e fabricante
- estoque mínimo
- lote e validade
- entrada, saída e ajuste
- prevenção de estoque negativo
- alerta de estoque crítico
- vínculo de consumo por procedimento
- baixa automática após procedimento realizado quando configurada

### CRM de pacientes

- estágios da jornada do paciente
- pacientes novos, agendados, em acompanhamento, retorno e inativos
- histórico de interações
- próxima ação e próximo contato
- oportunidades de tratamento/orçamento
- acompanhamento de retornos
- integração com agenda e WhatsApp

### WhatsApp operacional

- fila de confirmação de consulta
- lembrete de consulta
- retorno/follow-up
- acompanhamento de orçamento
- cobrança
- deduplicação de mensagens por origem/data
- abertura do WhatsApp para revisão e envio pelo usuário

> O Plennus Clinic não confirma entrega automática de mensagens sem um provedor externo de WhatsApp configurado. A fila é gerada automaticamente, mas o envio permanece assistido pelo usuário.

### Documentos

- modelos de documentos
- documentos vinculados ao paciente/profissional
- receituários e atestados
- geração de PDF A4
- impressão
- anexos e imagens clínicas permitidas

### Administração e segurança

- usuários e perfis de acesso
- matriz centralizada de permissões
- bloqueio de navegação direta para módulos não autorizados
- auditoria de alterações relevantes
- proteção contra desativação do último administrador
- Electron com `contextIsolation`, `sandbox` e `webSecurity`
- Node.js desabilitado no renderer
- bloqueio de popups e navegação arbitrária
- permissões do Chromium negadas por padrão

## Acesso inicial

A instalação pode possuir a credencial inicial de bootstrap:

- **Usuário:** `admin`
- **Senha inicial:** `123`

A senha `123` **não pode permanecer em uso**. No primeiro acesso com essa senha, o sistema exige a definição imediata de uma nova senha com pelo menos 10 caracteres antes de liberar a aplicação.

## Persistência e backup

No desktop Electron, o banco não depende de `localStorage` para persistência principal.

O banco SQLite serializado pelo `sql.js` é criptografado pelo Electron usando `safeStorage` e salvo no diretório `userData` do sistema operacional.

### Backup portátil

O sistema suporta backup `.plennusbkp` com:

- AES-256-GCM
- derivação de chave por PBKDF2
- senha definida pelo usuário
- validação estrutural do SQLite
- `PRAGMA integrity_check`
- detecção de arquivo adulterado/senha incorreta
- snapshot automático antes de restauração
- snapshots de segurança antes de migrações
- compatibilidade de importação com backup legado `.db`

## Atualização automática

O desktop usa `electron-updater` com GitHub Releases.

Fluxo:

`main → GitHub Actions → testes → build Windows → GitHub Release → electron-updater`

O workflow gera e valida:

- `Plennus-Clinic-Setup-<versão>.exe`
- `Plennus-Clinic-Setup-<versão>.exe.blockmap`
- `latest.yml`

No aplicativo:

- a verificação ocorre automaticamente após a inicialização do Windows empacotado
- a nova versão é apresentada ao usuário
- o download é iniciado por ação do usuário
- o progresso é exibido
- a instalação ocorre após confirmação para reiniciar
- pré-releases são ignoradas

## Desenvolvimento

Requisitos recomendados:

- Node.js 22
- npm
- Windows para validar o instalador NSIS

Instalação:

```bash
npm install
```

Executar em desenvolvimento:

```bash
npm start
```

Validar sintaxe:

```bash
npm run lint
```

Executar testes:

```bash
npm test
```

Gerar instalador Windows x64 localmente:

```bash
npm run build
```

O instalador é gerado em `dist/`.

## Arquitetura resumida

```text
Electron main process
├── segurança de janela
├── persistência criptografada
├── backup/restore
├── arquivos/documentos
└── updater

Preload
└── APIs IPC restritas

Renderer
├── core
│   ├── autenticação e permissões
│   ├── migrações
│   ├── auditoria
│   ├── modelos clínicos/operacionais
│   └── navegação/shell
│
└── domains
    ├── dashboard
    ├── pacientes
    ├── profissionais
    ├── agenda
    ├── prontuário
    ├── documentos
    ├── financeiro
    ├── estoque
    ├── CRM
    ├── WhatsApp
    └── odontologia
```

## Observações de produto

- NFS-e não faz parte do escopo atual.
- Assinatura eletrônica externa não faz parte do escopo atual.
- O desktop mantém arquitetura local-first e não depende de Cloudflare para atualizações.
- Atualizações do desktop são distribuídas por GitHub Releases.
