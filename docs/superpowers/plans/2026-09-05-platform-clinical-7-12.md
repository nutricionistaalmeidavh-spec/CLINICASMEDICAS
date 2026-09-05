# Clinical Platform 7–12 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar busca global, importação de pacientes, auditoria, migrations versionadas com backup, renderer de documentos/PDF e shell visual/dashboard moderno sem quebrar Agenda, PEP, Financeiro, autenticação ou os módulos clínicos 1–6.

**Architecture:** Manter Electron + HTML/CSS/JavaScript + `sql.js` e adicionar cores puros e domínios pequenos carregados pelo `navigation.js`. O banco continua centralizado em `js/database.js`, mas migrations/auditoria ganham APIs próprias; IPCs novos permanecem restritos no `main.js`/`preload.js`. O redesign altera shell e Dashboard sem reescrever os fluxos internos existentes.

**Tech Stack:** Electron 22.3.27, vanilla HTML/CSS/JavaScript, `sql.js` 1.10.x, Node test runner, Chromium `printToPDF`, parser XLSX escolhido apenas se não adicionar vulnerabilidade high/critical ao baseline.

**Spec:** `docs/superpowers/specs/2026-09-06-platform-clinical-7-12-design.md`

## Global Constraints

- Não introduzir React, Supabase, backend/cloud ou troca de banco.
- Preservar Agenda, PEP, Financeiro, autenticação, `data-page`, `data-roles` e handlers existentes.
- Busca não eleva permissões: recepção abre apenas dados administrativos; admin/médico podem abrir contexto clínico autorizado.
- Importação desta entrega é somente de pacientes e nunca sobrescreve duplicados automaticamente.
- `PRAGMA user_version` é a fonte de verdade da versão do schema; `schema_migrations` é diagnóstico humano.
- Backup automático pré-migração deve ser criptografado/copiado no processo principal antes de alterar banco existente, com retenção de 10 arquivos.
- Auditoria não grava senha/hash, binários, base64 de arquivo nem dumps completos.
- Migrations pré-login usam ator `system/migration`.
- O motor PDF continua baseado em HTML + `printToPDF`; não trocar por gerador binário próprio.
- Qualquer nova dependência não pode introduzir vulnerabilidade high/critical além do baseline atual; se introduzir, trocar a solução antes da entrega.
- Produção só após teste falhando observado (RED), depois implementação mínima (GREEN), depois refactor.

---

### Task 1: Global search core, permissions and shell hook

**Files:**
- Create: `js/core/global-search.js`
- Modify: `js/core/access-control.js`
- Modify: `js/core/navigation.js`
- Modify: `js/app.js`
- Modify: `index.html`
- Test: `test/global-search.test.js`
- Test: `test/access-control.test.js`
- Test: `test/architecture.test.js`

**Interfaces:**
- Consumes: `DB.query(sql, params)`, `currentUser`, `navegar(page)`, `PlennusAccessControl`.
- Produces: `PlennusGlobalSearch.normalizeSearchTerm(value)`, `normalizeCpf(value)`, `buildPatientSearchSql(term, limit)`, `destinationForRole(role)`, `setupGlobalSearch()`, `openPatientResult(patientId)`.

- [ ] **Step 1: Write failing pure-function tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const search = require('../js/core/global-search');

test('normalizes CPF and patient search text', () => {
  assert.equal(search.normalizeCpf('123.456.789-09'), '12345678909');
  assert.equal(search.normalizeSearchTerm('  José  Silva '), 'jose silva');
});

test('global search destination respects roles', () => {
  assert.equal(search.destinationForRole('admin'), 'prontuario');
  assert.equal(search.destinationForRole('medico'), 'prontuario');
  assert.equal(search.destinationForRole('recepcao'), 'pacientes');
});

test('patient search is parameterized and limited', () => {
  const built = search.buildPatientSearchSql('maria', 8);
  assert.match(built.sql, /WHERE ativo=1/);
  assert.match(built.sql, /LIMIT \?/);
  assert.equal(built.params.at(-1), 8);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test test/global-search.test.js`

Expected: FAIL because `js/core/global-search.js` does not exist.

- [ ] **Step 3: Implement pure search core and role capability**

Implement normalization without locale-sensitive surprises, parameterized SQL matching `LOWER(nome)`, normalized CPF via `REPLACE`, and phone fallback. Extend access control with `canAccessPatientClinicalWorkspace(role)` and `canImportPatients(role)`.

- [ ] **Step 4: Run GREEN for pure tests and access-control tests**

Run: `node --test test/global-search.test.js test/access-control.test.js`

Expected: PASS.

- [ ] **Step 5: Add shell markup and keyboard behavior**

Add persistent topbar inside `.main-content`, input `#global-search-input`, results container `#global-search-results`, page context `#shell-page-title`, and `Ctrl+K` / `Escape` behavior. `openPatientResult()` sets the existing patient/PEP context then navigates according to role, without granting hidden menu permissions.

- [ ] **Step 6: Add architecture assertions**

Verify `global-search.js` is in `CORE_SCRIPTS`, is linted, topbar IDs exist, and `setupGlobalSearch()` is called after DB initialization.

- [ ] **Step 7: Run regression suite**

Run: `npm run lint && npm test`

Expected: all tests PASS.

- [ ] **Step 8: Commit**

Commit message: `feat: add permission-aware global patient search`

---

### Task 2: Versioned migrations and automatic pre-migration backup

**Files:**
- Create: `js/core/migrations.js`
- Modify: `js/database.js`
- Modify: `main.js`
- Modify: `preload.js`
- Modify: `js/core/navigation.js`
- Test: `test/migrations.test.js`
- Test: `test/migration-backup-ipc.test.js`
- Test: `test/architecture.test.js`

**Interfaces:**
- Consumes: `DB` internal `db.run/db.exec`, Electron `app.getPath('userData')`, encrypted DB path.
- Produces: `PlennusMigrations.CURRENT_SCHEMA_VERSION`, `getPendingMigrations(currentVersion)`, `runMigrations({ db, beforeMigrate, audit })`; preload `criarBackupPreMigracao(meta)`.

- [ ] **Step 1: Write migration model RED tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const migrations = require('../js/core/migrations');

test('migration registry is monotonic and current version is last migration', () => {
  const versions = migrations.MIGRATIONS.map(m => m.version);
  assert.deepEqual(versions, [...versions].sort((a,b) => a-b));
  assert.equal(migrations.CURRENT_SCHEMA_VERSION, versions.at(-1));
});

test('pending migrations only include versions above current', () => {
  assert.ok(migrations.getPendingMigrations(0).length > 0);
  assert.deepEqual(migrations.getPendingMigrations(migrations.CURRENT_SCHEMA_VERSION), []);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test test/migrations.test.js`

Expected: FAIL because migration core is absent.

- [ ] **Step 3: Implement registry**

Migration v1 normalizes the existing schema (all current tables/columns including modules 1–6) and creates `schema_migrations`, `audit_log`, and `import_history`. Each migration runs inside explicit SQL transaction where supported, writes `schema_migrations`, then sets `PRAGMA user_version=<version>` only after successful statements.

- [ ] **Step 4: Add pre-migration backup IPC with RED test first**

Test main/preload source contracts for `criar-backup-pre-migracao`, path under `userData/backups`, `.db.enc`, and retention 10. Then implement `createPreMigrationBackup()` in `main.js` and expose only that action through preload.

- [ ] **Step 5: Integrate `initDatabase()`**

For saved DB: read `PRAGMA user_version`; if pending migrations exist, request backup before mutation, abort migration if backup fails, then run migrations using actor `system/migration`. For new DB: create structure and set current version without pretending an old backup exists.

- [ ] **Step 6: Verify idempotence**

Run migration tests twice against in-memory `sql.js`; assert second execution has zero pending migrations and does not duplicate `schema_migrations` rows.

- [ ] **Step 7: Run suite**

Run: `npm run lint && npm test`

Expected: PASS.

- [ ] **Step 8: Commit**

Commit message: `feat: version schema migrations with automatic backup`

---

### Task 3: Audit log core and clinical write instrumentation

**Files:**
- Create: `js/core/audit.js`
- Modify: `js/core/navigation.js`
- Modify: `js/domains/patients.js`
- Modify: `js/domains/pep.js`
- Modify: `js/domains/labs.js`
- Modify: `js/domains/consents.js`
- Modify: `js/domains/clinical-files.js`
- Modify: `js/domains/clinical-pending.js`
- Modify: `js/domains/documents.js`
- Test: `test/audit.test.js`
- Test: `test/architecture.test.js`

**Interfaces:**
- Consumes: `DB.run`, global `currentUser` when logged in.
- Produces: `PlennusAudit.sanitizePayload(value)`, `actorFromUser(user)`, `log(event, options)`, `systemMigrationEvent(version, name)`.

- [ ] **Step 1: Write audit RED tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const audit = require('../js/core/audit');

test('audit sanitizer removes secrets and binary payloads', () => {
  const clean = audit.sanitizePayload({ nome: 'Ana', senha: 'x', hash: 'y', base64: 'AAAA', campo: 1 });
  assert.equal(clean.nome, 'Ana');
  assert.equal(clean.campo, 1);
  assert.equal('senha' in clean, false);
  assert.equal('hash' in clean, false);
  assert.equal('base64' in clean, false);
});

test('migration audit actor is system/migration', () => {
  assert.deepEqual(audit.actorFromUser(null, 'migration'), { id: null, nome: 'system', nivel: 'migration' });
});
```

- [ ] **Step 2: Run RED**

Run: `node --test test/audit.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement audit core**

Insert into `audit_log` with parameterized SQL, compact JSON, bounded payload size, and no secret keys. Normal clinical writes log after DB mutation succeeds. Migration/import callers use strict mode so failure rejects the operation completion.

- [ ] **Step 4: Instrument patient and PEP writes**

Log create/update patient and finalized encounter with entity IDs and only changed field names/summary values required for traceability.

- [ ] **Step 5: Instrument modules 1–6 and documents**

Log exam create/review, consent create/revoke, clinical file metadata creation, manual pending create/resolve, and document emission/export registration.

- [ ] **Step 6: Run focused and full tests**

Run: `node --test test/audit.test.js test/clinical-*.test.js test/labs.test.js test/consents.test.js && npm run lint && npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: add local clinical audit trail`

---

### Task 4: Patient CSV/XLSX import model and UI

**Files:**
- Create: `js/core/import-model.js`
- Create: `js/domains/imports.js`
- Modify: `main.js`
- Modify: `preload.js`
- Modify: `js/core/navigation.js`
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `package.json` and `package-lock.json` only if a parser dependency is required
- Test: `test/import-model.test.js`
- Test: `test/import-ipc.test.js`
- Test: `test/architecture.test.js`

**Interfaces:**
- Consumes: `PlennusAccessControl.canImportPatients`, `PlennusAudit.log`, `DB.query/run`.
- Produces: `PlennusImportModel.normalizeHeader`, `mapPatientRow`, `validatePatientRow`, `detectDuplicate`, `buildImportPreview`; `PlennusImports.selectFile()`, `renderPreview()`, `confirmImport()`.

- [ ] **Step 1: Write RED tests for aliases/validation/duplicates**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/core/import-model');

test('maps Portuguese patient headers', () => {
  assert.equal(model.normalizeHeader('Nome Completo'), 'nome');
  assert.equal(model.normalizeHeader('E-mail'), 'email');
  assert.equal(model.normalizeHeader('Data Nascimento'), 'data_nascimento');
});

test('duplicate detection prioritizes CPF then name+birthday', () => {
  const existing = [{ id: 1, nome: 'Ana Souza', cpf: '12345678909', data_nascimento: '01/01/1990' }];
  assert.equal(model.detectDuplicate({ nome:'Outra', cpf:'123.456.789-09' }, existing).reason, 'cpf');
  assert.equal(model.detectDuplicate({ nome:'Ana Souza', data_nascimento:'01/01/1990' }, existing).reason, 'nome_nascimento');
});
```

- [ ] **Step 2: Run RED**

Run: `node --test test/import-model.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement pure import model**

Support aliases from spec, trim strings, normalize CPF, validate required name and date format, classify row as `valid`, `duplicate`, or `invalid`, and never mutate the database in preview generation.

- [ ] **Step 4: Choose parser safely**

Prefer parsing CSV without dependency. For `.xlsx`, add a maintained parser only after checking `npm audit --json`; reject the dependency if it adds any high/critical finding beyond baseline. If no acceptable parser can be added, keep `.xlsx` selection behind explicit unsupported-state messaging rather than adding a vulnerable package.

- [ ] **Step 5: Add restricted file selection/read IPC**

`selecionar-arquivo-importacao` accepts only `.csv/.xlsx`, enforces size limit, returns text for CSV or bounded bytes for parser consumption. No generic filesystem read endpoint.

- [ ] **Step 6: Add admin-only import page**

Add menu/page `importar` with `data-roles="admin"`, file picker, summary counters, preview table, and Confirm/Cancel. Preview does zero writes. `confirmImport()` inserts only `valid` rows, creates `import_history`, and writes strict audit event.

- [ ] **Step 7: Run full verification**

Run: `npm ci && npm audit --json > /tmp/audit.json || true`, compare severity counts to baseline, then `npm run lint && npm test`.

Expected: no new high/critical beyond baseline; tests PASS.

- [ ] **Step 8: Commit**

Commit message: `feat: add safe patient import preview workflow`

---

### Task 5: Reusable document renderer and image-safe PDF composition

**Files:**
- Create: `js/core/document-renderer.js`
- Modify: `js/core/navigation.js`
- Modify: `js/domains/documents.js`
- Modify: `js/domains/pep.js`
- Modify: `main.js`
- Modify: `preload.js`
- Test: `test/document-renderer.test.js`
- Test: `test/document-image-ipc.test.js`

**Interfaces:**
- Consumes: `obterDadosClinica()`, `escapeHTML`, current patient/professional records, existing `gerarPdf` IPC.
- Produces: `PlennusDocumentRenderer.renderDocument({ title, clinic, patient, professional, sections, images, footer })`, `section(title, html, options)`, `pageBreak()`, preload `lerImagemClinicaParaDocumento(path)`.

- [ ] **Step 1: Write renderer RED tests**

Assert escaping of title/patient fields, `@page` A4 rules, stable header/footer, explicit `.page-break`, and image source acceptance only from supplied Data URLs.

- [ ] **Step 2: Run RED**

Run: `node --test test/document-renderer.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement renderer**

Create pure HTML composition with print CSS, reusable sections, `break-inside: avoid` for clinical blocks, page-break helper, footer, and bounded image gallery blocks.

- [ ] **Step 4: Add safe image IPC after RED source-contract test**

Only allow `.png/.jpg/.jpeg/.webp`, absolute existing paths already meeting clinical-file rules, maximum 8 MB each, and return Data URL. No PDF/doc/text reading through this IPC.

- [ ] **Step 5: Migrate existing document functions gradually**

Keep public functions/buttons (`gerarPdfReceitaPep`, `gerarPdfAtendimentoPep`, `exportarDocumentoPdf`, timeline print actions) but make them delegate to the common renderer. Preserve output meaning and existing save dialog.

- [ ] **Step 6: Run regression tests**

Run: `node --test test/document-renderer.test.js test/document-image-ipc.test.js && npm run lint && npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: unify multipage clinical document rendering`

---

### Task 6: Modern shell visual system and navigation context

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `js/core/navigation.js`
- Modify: `js/core/auth.js`
- Test: `test/shell-ui.test.js`
- Test: `test/architecture.test.js`

**Interfaces:**
- Consumes: existing `.menu-item[data-page][data-roles]`, topbar from Task 1, `navegar(page)`.
- Produces: shell DOM contract (`#shell-topbar`, `#shell-page-title`, `#global-search-input`), semantic page-title mapping, focus-visible styling.

- [ ] **Step 1: Write shell RED tests**

Read `index.html`/CSS as source and assert shell topbar exists, sidebar still contains every legacy `data-page`, CSS includes focus-visible rule and surface/text/radius/shadow tokens, and no legacy page IDs are removed.

- [ ] **Step 2: Run RED**

Run: `node --test test/shell-ui.test.js`

Expected: FAIL on missing modern shell contracts.

- [ ] **Step 3: Refactor CSS tokens and shell**

Add neutral surface hierarchy, compact sidebar, clearer active state, topbar, constrained content width/gutters, professional typography and spacing. Keep `--primary` as institution-controlled accent and preserve existing form/table/page selectors.

- [ ] **Step 4: Update navigation page context**

Add `PAGE_TITLES` map and update `#shell-page-title` on `navegar()`. Keep hidden/visible menu logic authoritative in auth/access-control.

- [ ] **Step 5: Verify legacy markup contracts**

Run architecture and shell tests plus `npm run lint`.

- [ ] **Step 6: Commit**

Commit message: `feat: modernize clinic desktop shell`

---

### Task 7: Operational dashboard with role-aware KPIs and empty states

**Files:**
- Modify: `index.html`
- Modify: `js/domains/dashboard.js`
- Modify: `css/style.css`
- Test: `test/dashboard.test.js`

**Interfaces:**
- Consumes: `DB.query`, `currentUser.nivel`, `PlennusAccessControl`.
- Produces: `PlennusDashboard.buildDashboardMetrics(data, role)`, role-aware rendering into fixed dashboard IDs.

- [ ] **Step 1: Write dashboard RED tests**

Test pure metric mapping: active patients, today appointments, waiting patients, open clinical pending items, labs awaiting review, remaining appointments. Assert finance balance appears only for roles already authorized by spec (`admin`, `recepcao`) and not `medico`.

- [ ] **Step 2: Run RED**

Run: `node --test test/dashboard.test.js`

Expected: FAIL until dashboard exports pure helper.

- [ ] **Step 3: Implement metric helper and queries**

Use bounded parameterized queries, with current date in the app’s existing format. Keep counts strictly informational; no diagnostic inference.

- [ ] **Step 4: Replace welcome-only dashboard**

Render KPI cards, today/next appointments list, waiting room panel, clinical pending/lab review panel, and quick actions appropriate to role. Each list has explicit empty-state copy.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test test/dashboard.test.js && npm run lint && npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: make dashboard operational and role aware`

---

### Task 8: Final integration, security regression and CI evidence

**Files:**
- Modify: `package.json` lint list
- Modify: `docs/BASELINE-E-ARQUITETURA-2026-09-05.md`
- Modify: `docs/superpowers/plans/2026-09-05-platform-clinical-7-12.md` only to mark executed checkboxes if desired
- Test: all `test/*.test.js`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: branch ready for PR, no main merge.

- [ ] **Step 1: Extend lint command**

Include every new core/domain JS file in `npm run lint`.

- [ ] **Step 2: Verify architecture contracts**

Run: `node --test test/architecture.test.js test/shell-ui.test.js test/migration-backup-ipc.test.js test/import-ipc.test.js test/document-image-ipc.test.js`

Expected: PASS.

- [ ] **Step 3: Fresh dependency install and audit comparison**

Run: `npm ci` then `npm audit --json` and record counts. If any new high/critical came from this branch, remove/replace the dependency before proceeding.

- [ ] **Step 4: Fresh full verification**

Run: `npm run lint && npm test`

Expected: exit code 0; 0 failing tests.

- [ ] **Step 5: Update architecture documentation**

Document search, import, audit, migrations, document renderer, shell/dashboard, new tables/IPCs and explicit out-of-scope items. Do not claim Windows installer validation unless `npm run build` is actually executed successfully on a compatible runner.

- [ ] **Step 6: Commit**

Commit message: `docs: record clinical platform 7-12 architecture`

- [ ] **Step 7: Open PR against `main`**

PR title: `feat: completar plataforma clínica até shell visual`

PR body must include scope 7–12, verification evidence, dependency audit note, migration/backup risk notes and explicit statement that merge requires user authorization.
