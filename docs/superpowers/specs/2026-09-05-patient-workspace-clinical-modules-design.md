# Patient Workspace + Clinical Modules Design

## Objective
Extend Plennus Clinic with six clinical capabilities while preserving the existing Electron/sql.js architecture and current Agenda/PEP behavior: patient workspace, clinical files/album, consent records, laboratory exams, longitudinal evolution, and clinical pending items.

## Scope
1. Patient workspace centered on the selected patient.
2. Clinical files/album with metadata by patient, category, date and notes.
3. Terms and consents with authorization/revocation status and timestamps.
4. Structured laboratory exams by collection, marker, value, unit and optional reference range.
5. Longitudinal evolution combining existing PEP vital signs with laboratory trends.
6. Clinical pending items: exams awaiting review, missing follow-up after completed consultation, and manual tasks.

## Architecture
Preserve vanilla JS renderer, Electron and sql.js. Add focused domain modules under `js/domains/`, keep shared helpers under `js/core/`, and extend `js/database.js` with additive schema changes only. Existing tables and flows remain compatible.

Proposed renderer domains:
- `js/domains/patient-workspace.js`
- `js/domains/clinical-files.js`
- `js/domains/consents.js`
- `js/domains/labs.js`
- `js/domains/clinical-timeline.js`
- `js/domains/clinical-pending.js`

## Patient Workspace
The patient becomes the navigation context for clinical work. The workspace exposes: Summary, PEP/Encounters, Exams, Evolution, Clinical Files, Referrals/Documents, Consents and Pending Items. Existing PEP functions remain the source of truth for encounters and are invoked rather than duplicated.

## Data Model
Add tables without destructive migration:

### `arquivos_clinicos`
- `id`
- `paciente_id`
- `categoria`
- `nome_arquivo`
- `caminho_arquivo`
- `mime_type`
- `observacao`
- `data_registro`
- `criado_em`

Binary files remain outside SQLite when Electron file APIs are available. The database stores metadata/path only.

### `consentimentos`
- `id`
- `paciente_id`
- `tipo`
- `autorizado`
- `aceito_em`
- `revogado_em`
- `observacao`
- `criado_em`
- `atualizado_em`

### `exames_laboratoriais`
- `id`
- `paciente_id`
- `data_coleta`
- `laboratorio`
- `status_revisao`
- `observacao`
- `criado_em`

### `exames_resultados`
- `id`
- `exame_id`
- `marcador`
- `valor`
- `valor_texto`
- `unidade`
- `referencia_min`
- `referencia_max`
- `referencia_texto`

### `pendencias_clinicas`
- `id`
- `paciente_id`
- `tipo`
- `titulo`
- `descricao`
- `origem_tipo`
- `origem_id`
- `status`
- `vencimento_em`
- `criado_em`
- `resolvido_em`

## Evolution Rules
Longitudinal evolution is read-only aggregation. It reads existing `prontuario_atendimentos` values (weight, BMI, blood pressure, heart rate, temperature) and laboratory results. No automatic diagnosis or medical interpretation is produced. Reference ranges may be shown when explicitly stored.

## Pending Rules
Automatic pending items are derived from persisted facts:
- laboratory exam with `status_revisao = 'pendente'`;
- completed consultation without a future appointment for the same patient;
- manually created open pending item.

Automatic pending calculations must not create duplicate persisted rows on every screen load. Derived pending items may be computed at read time; manual tasks remain persisted.

## Compatibility and Safety
- No destructive database migration.
- No replacement of existing Agenda, PEP, Documents, Cash or Payout flows.
- No React/Supabase/cloud migration in this delivery.
- Existing encrypted database persistence remains unchanged.
- New patient data must be escaped before HTML rendering.
- Existing role/access-control rules remain authoritative.

## Testing
Use TDD for domain logic and schema-facing helpers. Add tests for:
- workspace tab registry and patient-context handling;
- clinical file metadata validation;
- consent status derivation;
- laboratory reference/status helpers;
- longitudinal series aggregation;
- pending-item derivation and duplicate prevention;
- architecture/domain loading contracts.

Run `npm run lint` and `npm test` before completion. Do not claim installer/Windows packaging verification unless `electron-builder` is run successfully.

## Out of Scope
- Cloud sync
- Telemedicine
- Automated diagnostic suggestions
- EHR interoperability standards
- Electronic/digital signature certification
- External laboratory API integration
- Full visual redesign beyond the workspace needed to expose these features
