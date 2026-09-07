# Reusable Certificate and Fiscal Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable certificate-digital and optional fiscal modules to Plennus Clinic, with UTW partner sales and user-owned Focus NFe connectivity.

**Architecture:** Certificate integration stays renderer-only and opens the ArtiSys UTW store through the existing safe external-URL bridge. Fiscal credentials and network calls stay in the Electron main process behind a restricted IPC API; the renderer receives only non-secret status and result data. Plennus-specific DB reads/mounting stay in a domain adapter so the reusable modules can be copied into other Electron/JavaScript systems.

**Tech Stack:** Electron 44, Node.js 22, JavaScript, node:test, Electron safeStorage, native fetch.

**Spec:** `docs/superpowers/specs/2026-09-07-reusable-certificate-fiscal-modules-design.md`

## Global Constraints

- Preserve Electron + JavaScript and the current local-first architecture.
- Do not store provider tokens in renderer state, SQL tables, localStorage, logs, or UI-visible status objects.
- Use hard-coded provider base URLs and whitelisted document types only.
- Preserve all existing clinical/financial flows.
- Do not infer tax codes or rates for the clinic.

---

### Task 1: Fiscal core and Focus client

**Files:**
- Create: `test/fiscal-module.test.js`
- Create: `js/modules/fiscal/fiscal-core.js`
- Create: `js/modules/fiscal/focus-client.js`

**Interfaces:**
- Produces: `validateConnection`, `validateReference`, `buildNationalNfsePayload`, `buildMunicipalNfsePayload`.
- Produces: `createFocusClient({ fetchImpl })` with `testConnection`, `emit`, `query`, `cancel`.

- [ ] Write tests that assert invalid providers/environments/references are rejected, token is never returned by normalized connection metadata, national and municipal payload builders preserve explicit tax fields, and Focus routes cannot be overridden by renderer data.
- [ ] Run `node --test test/fiscal-module.test.js` and confirm failure because the modules do not exist.
- [ ] Implement the minimal pure core and Focus client to satisfy the tests.
- [ ] Run the focused test and confirm pass.

### Task 2: Secure Electron fiscal IPC

**Files:**
- Create: `test/fiscal-ipc.test.js`
- Create: `js/modules/fiscal/fiscal-main.js`
- Modify: `updater-main.js`
- Modify: `preload.js`

**Interfaces:**
- Produces renderer API `window.electronAPI.fiscal.status/saveConnection/removeConnection/testConnection/emit/query/cancel`.
- Token storage: encrypted `fiscal-connection.enc` in Electron `userData`.

- [ ] Write tests for source-level security invariants: no token getter in preload, safeStorage usage, fixed Focus hostnames, bounded payloads, and IPC whitelist.
- [ ] Run focused tests and confirm they fail before production wiring.
- [ ] Register fiscal IPC from the real desktop bootstrap `updater-main.js` and expose only restricted methods in `preload.js`.
- [ ] Run focused tests and syntax checks.

### Task 3: Reusable certificate renderer

**Files:**
- Create: `test/certificate-module.test.js`
- Create: `js/modules/certificate-digital/certificate-digital.js`

**Interfaces:**
- Produces: `window.PlennusCertificateDigital.mount({ container, provider, openExternal, hostName })`.
- Default provider: UTW ArtiSys store, e-CNPJ/e-CPF at R$ 157,00.

- [ ] Write tests for default provider URL/products and ensure no certificate/customer data are embedded into outbound URLs.
- [ ] Run focused test and confirm failure.
- [ ] Implement renderer module and provider configuration.
- [ ] Run focused test and confirm pass.

### Task 4: Reusable fiscal renderer and Plennus adapter

**Files:**
- Create: `test/commercial-services-ui.test.js`
- Create: `js/modules/fiscal/fiscal-ui.js`
- Create: `js/domains/commercial-services.js`
- Modify: `js/app.js`

**Interfaces:**
- Fiscal UI mounts into Settings and Finance supplied containers and accepts a host reference prefix.
- Host adapter reads/writes non-secret fiscal profile config through the existing `configuracoes` table and supplies clinic/patient defaults.

- [ ] Write source/behavior tests for module loading, optional-provider states, UTW mount, fiscal settings mount and finance mount.
- [ ] Run focused test and confirm failure.
- [ ] Implement dynamic script loading from `js/app.js`, reusable UI module and Plennus adapter.
- [ ] Run focused tests and syntax checks.

### Task 5: Regression verification and documentation

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] Add new production files to the existing syntax-check command.
- [ ] Document optional certificate/fiscal modules, user-owned provider billing and security boundary.
- [ ] Run `npm run lint` and `npm test` in CI-capable environment.
- [ ] Review branch diff for accidental secrets, hard-coded clinic tax assumptions, broken existing flows, or arbitrary-network access.
