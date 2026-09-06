# Plataforma clínica — itens 7 a 12

**Data:** 5 de setembro de 2026  
**Base:** `main` em `ae7eb6dabbe760e98ffb0529bc0f13cb8bc44d69`  
**Branch:** `feat/platform-clinical-7-12`

Esta entrega estende a arquitetura modular da Plennus Clinic sem substituir Electron, `sql.js`, a persistência local criptografada, Agenda, PEP, Financeiro ou autenticação.

## 7 — Busca global

O shell passa a ter busca persistente de pacientes por nome, CPF e telefone, com `Ctrl+K`, Escape e resultado limitado. O destino respeita RBAC: `admin`/`medico` podem abrir o contexto clínico já autorizado; `recepcao` abre o cadastro administrativo e não recebe acesso ao PEP.

Arquivos principais:
- `js/core/global-search.js`
- `js/core/access-control.js`
- `js/core/shell.js`

## 8 — Importação de pacientes

Foi criado fluxo administrativo para CSV/XLSX com seleção local restrita, prévia antes de qualquer gravação, aliases de colunas, validação e detecção de duplicidade por CPF e, em segundo lugar, nome + data de nascimento. Registros existentes não são sobrescritos automaticamente.

O suporte XLSX usa parser local limitado e sem nova dependência npm (`js/core/xlsx-node.js`). Isso evita ampliar a superfície de dependências legadas. O histórico de execução é persistido em `import_history`.

Arquivos principais:
- `js/core/import-model.js`
- `js/core/xlsx-node.js`
- `js/domains/imports.js`

## 9 — Auditoria

A tabela `audit_log` registra alterações relevantes em pacientes, PEP, exames, consentimentos, arquivos clínicos, pendências, documentos e importações. O logger remove chaves sensíveis e não persiste senha/hash, binários, base64 ou dumps do banco.

A instrumentação ocorre na camada `DB.run` depois que a migration cria a estrutura de auditoria. Migrations são registradas como ator `system/migration`. Uma tela administrativa permite consultar os eventos mais recentes por ação e entidade.

Arquivos principais:
- `js/core/audit.js`
- `js/domains/audit-view.js`

## 10 — Migrations versionadas e backup

`PRAGMA user_version` passa a ser a fonte autoritativa da versão do schema. `schema_migrations` mantém registro humano das migrations aplicadas. A primeira migration cria as estruturas transversais dos itens 8–10.

O processo principal cria cópia do banco criptografado em `userData/backups` antes de entregar um banco existente ao renderer, garantindo ponto de restauração anterior às migrations legadas e novas. Os backups automáticos usam o formato `pre-migration-v<origem>-<timestamp>.db.enc` e retenção de 10 arquivos por instalação.

Arquivos principais:
- `js/core/migrations.js`
- `main.js`
- `preload.js`

## 11 — Documentos e PDF

O pipeline existente de HTML + Chromium `printToPDF` foi preservado. Um renderer comum passa a compor cabeçalho, dados do paciente, seções, quebras de página, assinatura, rodapé e imagens clínicas opcionais.

Imagens para documento só podem ser lidas pelo IPC específico `ler-imagem-clinica-para-documento`, limitado a PNG/JPG/JPEG/WEBP, caminho absoluto existente e até 8 MB por arquivo. Não existe endpoint genérico de leitura do filesystem.

Arquivos principais:
- `js/core/document-renderer.js`
- `js/domains/platform-documents.js`
- `main.js`
- `preload.js`

## 12 — Shell visual e dashboard operacional

O redesign é incremental: páginas e handlers existentes permanecem, enquanto o shell adiciona uma topbar persistente, busca global, contexto da página, sidebar refinada, tokens de superfície/texto/radius/sombra e foco de teclado.

O Dashboard passa a mostrar pacientes ativos, consultas do dia, pessoas na sala de espera, pendências clínicas, exames aguardando revisão, próximos atendimentos e saldo apenas para perfis previamente autorizados (`admin` e `recepcao`). Não há inferência ou interpretação clínica automática.

Arquivos principais:
- `css/platform.css`
- `js/core/shell.js`
- `js/domains/dashboard.js`

## Novas estruturas de banco

- `schema_migrations`
- `audit_log`
- `import_history`

As tabelas dos módulos clínicos 1–6 permanecem preservadas.

## Novos IPCs restritos

- `criar-backup-pre-migracao`
- `selecionar-arquivo-importacao`
- `ler-imagem-clinica-para-documento`

Os IPCs existentes de banco criptografado, documentos, impressão, URLs externas e arquivos clínicos permanecem disponíveis.

## Compatibilidade e segurança

- Sem React, Supabase, backend/cloud ou troca de banco.
- Sem nova dependência npm nesta entrega.
- `package-lock.json` permanece sem alteração de dependências.
- Busca e novas páginas respeitam os perfis existentes.
- Importação é somente de pacientes.
- Auditoria não é apresentada como certificação/compliance regulatório completo.
- O suporte XLSX não executa fórmulas; apenas extrai os valores armazenados na primeira worksheet, com limite de 5.000 linhas e 12 MB por arquivo.
- O instalador Windows não faz parte da validação desta entrega, salvo execução explícita posterior do build em runner compatível.

## Verificação

A suíte inclui contratos para busca, importação, parser XLSX, auditoria, migrations, IPCs restritos, renderer de documentos, dashboard e shell, além de toda a regressão dos módulos anteriores.

O CI continua executando:
1. `npm ci`;
2. `npm run lint`;
3. `npm test`.

As vulnerabilidades reportadas pelo `npm ci` pertencem ao stack legado já presente na baseline; como nenhuma dependência foi adicionada, esta entrega não aumenta a contagem de dependências vulneráveis.
