# Patient Workspace + Clinical Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first six approved clinical capabilities in Plennus Clinic: patient workspace, clinical files, consents, laboratory exams, longitudinal evolution, and clinical pending items.

**Architecture:** Keep the existing vanilla JS renderer, Electron shell and sql.js persistence. Extend `js/database.js` additively, isolate new clinical logic in focused domain modules, reuse the existing PEP as the encounter source of truth, and load the new domains through the current synchronous compatibility loader.

**Tech Stack:** Electron 22.3.27, vanilla JavaScript, sql.js 1.10.3, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-05-patient-workspace-clinical-modules-design.md`

## Global Constraints

- No destructive database migration.
- No replacement of Agenda, PEP, Documents, Cash or Payout flows.
- No React, Supabase or cloud migration in this delivery.
- Keep encrypted local database persistence unchanged.
- Escape patient/clinical values before HTML rendering.
- Keep existing role/access-control rules authoritative.
- No automated diagnosis or interpretation of laboratory data.
- Do not claim Windows installer verification unless `electron-builder` is actually run successfully.

---

### Task 1: Clinical model helpers and additive schema

**Files:**
- Create: `js/core/clinical-model.js`
- Modify: `js/database.js`
- Modify: `js/core/navigation.js`
- Modify: `package.json`
- Test: `test/clinical-model.test.js`
- Test: `test/architecture.test.js`

**Interfaces:**
- Produces `PlennusClinicalModel.consentStatus(row)`, `labResultStatus(result)`, `buildVitalSeries(encounters)`, `derivePendingItems(input)`, `validateClinicalFileMetadata(input)`.
- Adds tables `arquivos_clinicos`, `consentimentos`, `exames_laboratoriais`, `exames_resultados`, `pendencias_clinicas`.

- [ ] **Step 1: Write failing helper and architecture tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/core/clinical-model.js');

test('consentStatus distinguishes active, revoked and absent consent', () => {
  assert.equal(model.consentStatus({ autorizado: 1, revogado_em: null }), 'autorizado');
  assert.equal(model.consentStatus({ autorizado: 1, revogado_em: '2026-09-05' }), 'revogado');
  assert.equal(model.consentStatus(null), 'nao_autorizado');
});

test('labResultStatus only classifies numeric values when numeric limits exist', () => {
  assert.equal(model.labResultStatus({ valor: 2, referencia_min: 3, referencia_max: 5 }), 'baixo');
  assert.equal(model.labResultStatus({ valor: 4, referencia_min: 3, referencia_max: 5 }), 'normal');
  assert.equal(model.labResultStatus({ valor: 7, referencia_min: 3, referencia_max: 5 }), 'alto');
  assert.equal(model.labResultStatus({ valor_texto: 'Negativo' }), 'sem_classificacao');
});
```

Extend `test/architecture.test.js` so the new six domains plus `js/core/clinical-model.js` are registered and present.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`
Expected: FAIL because `js/core/clinical-model.js` and new domain registrations do not exist.

- [ ] **Step 3: Implement minimal helpers and additive tables**

Add browser/CommonJS exports using the same pattern as existing core modules. In `createTables()` add `CREATE TABLE IF NOT EXISTS` statements for the five new tables from the approved spec, each with `FOREIGN KEY`-compatible IDs but without destructive rewrites of existing tables.

Implement derived logic so `derivePendingItems({ labs, encounters, futureAppointments, manualItems })` returns stable synthetic keys such as `lab:<id>` and `followup:<encounterId>` rather than inserting derived rows into SQLite.

- [ ] **Step 4: Register core/domain loading and lint coverage**

Add `js/core/clinical-model.js` to `index.html` after existing core utilities. Add these paths to `DOMAIN_SCRIPTS` and lint:

```text
js/domains/patient-workspace.js
js/domains/clinical-files.js
js/domains/consents.js
js/domains/labs.js
js/domains/clinical-timeline.js
js/domains/clinical-pending.js
```

- [ ] **Step 5: Run verification**

Run: `npm run lint && npm test`
Expected: all pre-existing tests plus new helper/architecture tests pass.

- [ ] **Step 6: Commit**

```bash
git add js/core/clinical-model.js js/database.js js/core/navigation.js index.html package.json test/clinical-model.test.js test/architecture.test.js
git commit -m "feat: add clinical data model and domain contracts"
```

---

### Task 2: Patient workspace shell

**Files:**
- Create: `js/domains/patient-workspace.js`
- Modify: `js/domains/pep.js`
- Modify: `index.html`
- Test: `test/patient-workspace.test.js`

**Interfaces:**
- Consumes existing `selectedPepPacienteId`, `selecionarPacientePep(id)`, `carregarTimelinePep(id)`.
- Produces `PlennusPatientWorkspace.TABS`, `openPatientWorkspace(patientId, tab)`, `refreshPatientWorkspace(patientId)`.

- [ ] **Step 1: Write failing workspace registry tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const workspace = require('../js/domains/patient-workspace.js');

test('workspace exposes the approved patient-centered tabs', () => {
  assert.deepEqual(workspace.TABS.map(x => x.id), [
    'resumo','pep','exames','evolucao','arquivos','documentos','consentimentos','pendencias'
  ]);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test test/patient-workspace.test.js`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement workspace shell**

Create a workspace container under the existing PEP patient card. The shell must render tab buttons and empty content targets without duplicating PEP form logic. `pep` tab reveals the existing encounter form/timeline; other tabs call their owning domain renderer.

- [ ] **Step 4: Integrate patient selection**

At the end of `selecionarPacientePep(id)`, call `refreshPatientWorkspace(pid)` after the existing patient header and timeline are loaded. When no patient is selected, hide the workspace.

- [ ] **Step 5: Run verification and commit**

Run: `npm run lint && npm test`

```bash
git add js/domains/patient-workspace.js js/domains/pep.js index.html test/patient-workspace.test.js
git commit -m "feat: add patient clinical workspace"
```

---

### Task 3: Clinical files and album metadata

**Files:**
- Create: `js/domains/clinical-files.js`
- Test: `test/clinical-files.test.js`

**Interfaces:**
- Consumes `DB.query`, `DB.run`, `escapeHTML`, `PlennusClinicalModel.validateClinicalFileMetadata`.
- Produces `renderClinicalFiles(patientId, container)`, `saveClinicalFileMetadata(patientId, input)`, `listClinicalFiles(patientId)`.

- [ ] **Step 1: Write failing validation tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/core/clinical-model.js');

test('clinical file metadata requires patient, category and file name', () => {
  assert.deepEqual(model.validateClinicalFileMetadata({ paciente_id: 1, categoria: 'Imagem', nome_arquivo: 'foto.jpg' }), []);
  assert.ok(model.validateClinicalFileMetadata({ paciente_id: 1, categoria: '', nome_arquivo: '' }).length >= 2);
});
```

- [ ] **Step 2: Run RED, then implement metadata CRUD**

Store only metadata/path in SQLite. If no Electron file picker/storage API exists, expose a metadata-only registration flow instead of embedding binary data in the database.

- [ ] **Step 3: Render files grouped by date/category**

Use escaped file name/category/observation text. Include a clear empty state and remove/open actions only when the corresponding file path is available.

- [ ] **Step 4: Run verification and commit**

Run: `npm run lint && npm test`

```bash
git add js/domains/clinical-files.js test/clinical-files.test.js
git commit -m "feat: add patient clinical files"
```

---

### Task 4: Terms and consents

**Files:**
- Create: `js/domains/consents.js`
- Test: `test/consents.test.js`

**Interfaces:**
- Consumes `DB.query`, `DB.run`, `PlennusClinicalModel.consentStatus`.
- Produces `renderConsents(patientId, container)`, `saveConsent(patientId, type, authorized, note)`, `revokeConsent(id)`.

- [ ] **Step 1: Write failing consent behavior tests**

```js
test('revoked consent is never displayed as active', () => {
  assert.equal(model.consentStatus({ autorizado: 1, aceito_em: '2026-09-01', revogado_em: '2026-09-05' }), 'revogado');
});
```

- [ ] **Step 2: Run RED, then implement CRUD/status derivation**

Use explicit types such as `tratamento_dados`, `whatsapp`, `imagem_clinica`, `teleatendimento` and `outro`. Revocation updates `revogado_em`; it does not delete the row.

- [ ] **Step 3: Render status and history**

Display Authorized / Revoked / Not authorized based solely on stored consent facts. Escape observation text.

- [ ] **Step 4: Run verification and commit**

Run: `npm run lint && npm test`

```bash
git add js/domains/consents.js test/consents.test.js
git commit -m "feat: add patient consent records"
```

---

### Task 5: Laboratory exams and longitudinal evolution

**Files:**
- Create: `js/domains/labs.js`
- Create: `js/domains/clinical-timeline.js`
- Test: `test/labs.test.js`
- Test: `test/clinical-timeline.test.js`

**Interfaces:**
- Produces `renderLabs(patientId, container)`, `saveLabExam(patientId, exam, results)`, `markLabReviewed(id)`.
- Produces `buildClinicalEvolution(patientId)`, `renderClinicalEvolution(patientId, container)`.

- [ ] **Step 1: Write failing lab and series tests**

```js
test('buildVitalSeries orders measurements chronologically and omits absent values', () => {
  const series = model.buildVitalSeries([
    { data_hora: '2026-09-05 10:00', peso: 80, imc: 25 },
    { data_hora: '2026-09-01 10:00', peso: 81, imc: null }
  ]);
  assert.deepEqual(series.peso.map(x => x.value), [81, 80]);
  assert.deepEqual(series.imc.map(x => x.value), [25]);
});
```

- [ ] **Step 2: Run RED, then implement exam/result persistence**

Persist one exam header plus zero or more result rows. Numeric low/normal/high status is presentation-only and calculated only when numeric reference limits exist. Text results remain unclassified.

- [ ] **Step 3: Implement evolution aggregation**

Query existing `prontuario_atendimentos` for weight, BMI, blood pressure, heart rate and temperature, plus laboratory results. Return chronological data without diagnostic interpretation.

- [ ] **Step 4: Render lab and evolution tabs**

Show collection date, laboratory, review status, result list and explicit reference values when present. Evolution should render a readable chronological table/list first; charts are not required in this delivery.

- [ ] **Step 5: Run verification and commit**

Run: `npm run lint && npm test`

```bash
git add js/domains/labs.js js/domains/clinical-timeline.js test/labs.test.js test/clinical-timeline.test.js
git commit -m "feat: add laboratory exams and clinical evolution"
```

---

### Task 6: Clinical pending items

**Files:**
- Create: `js/domains/clinical-pending.js`
- Test: `test/clinical-pending.test.js`

**Interfaces:**
- Consumes `PlennusClinicalModel.derivePendingItems` and existing Agenda/PEP tables.
- Produces `renderClinicalPending(patientId, container)`, `saveManualPending(patientId, input)`, `resolveManualPending(id)`.

- [ ] **Step 1: Write failing derivation tests**

```js
test('derived pending items do not duplicate manual rows or repeated reads', () => {
  const input = {
    labs: [{ id: 7, status_revisao: 'pendente', data_coleta: '2026-09-05' }],
    encounters: [{ id: 3, finalizado: 1, data_hora: '2026-09-04 09:00' }],
    futureAppointments: [],
    manualItems: []
  };
  const first = model.derivePendingItems(input);
  const second = model.derivePendingItems(input);
  assert.deepEqual(first.map(x => x.key), second.map(x => x.key));
  assert.equal(new Set(first.map(x => x.key)).size, first.length);
});
```

- [ ] **Step 2: Run RED, then implement derived/manual pending logic**

Derived items are calculated at read time for pending lab review and completed encounter without future appointment. Only manual pending items are inserted into `pendencias_clinicas`.

- [ ] **Step 3: Render pending tab**

Group items by derived/manual and open/resolved. Provide Resolve only for persisted manual items and direct navigation to Exams/Agenda where appropriate.

- [ ] **Step 4: Run verification and commit**

Run: `npm run lint && npm test`

```bash
git add js/domains/clinical-pending.js test/clinical-pending.test.js
git commit -m "feat: add clinical pending items"
```

---

### Task 7: Integration regression gate

**Files:**
- Modify: `test/architecture.test.js` only if final registrations differ from the expected contract.
- Modify: `docs/BASELINE-E-ARQUITETURA-2026-09-05.md`

**Interfaces:**
- Validates all new modules load without returning business logic to `js/app.js`.

- [ ] **Step 1: Run complete static and automated verification**

Run:

```bash
npm run lint
npm test
```

Expected: both commands exit 0; existing Agenda/PEP/core tests remain green alongside the new clinical tests.

- [ ] **Step 2: Update architecture documentation**

Document the five additive tables, six new domain modules, patient-workspace navigation, and the fact that derived pending items are not persisted repeatedly.

- [ ] **Step 3: Inspect branch diff**

Confirm no deliberate changes to Cash, Payouts, authentication, encrypted DB persistence or existing document generation.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/BASELINE-E-ARQUITETURA-2026-09-05.md test/architecture.test.js
git commit -m "docs: record patient workspace clinical architecture"
```

- [ ] **Step 5: Final CI gate**

Push branch and require GitHub Actions to complete successfully on the final head SHA before describing the implementation as verified.
