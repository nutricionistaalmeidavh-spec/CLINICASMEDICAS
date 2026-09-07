# Entrega C — Storage clínico e backup composto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolar fisicamente anexos e bancos clínicos por profissional e tornar backup/restore independente do shadow central.

**Architecture:** O processo principal do Electron continua como única camada com filesystem/`safeStorage`. Operações de arquivo passam a exigir o token da sessão profissional. O backup V3 agrega clinic DB, todos os professional DBs e anexos em envelope portátil cifrado e restaurável com staging/rollback.

**Tech Stack:** Electron, Node.js `fs/path/crypto`, `safeStorage`, sql.js, AES-256-GCM/PBKDF2.

**Spec:** `docs/superpowers/specs/2026-09-06-entrega-c-storage-backup-design.md`

## Global Constraints
- Não escrever anexos clínicos novos fora de `data/professionals/<professionalUid>/files/`.
- Nenhuma operação clínica de filesystem sem sessão profissional vinculada à janela.
- Não armazenar chave de criptografia junto ao banco.
- Backups V1/V2 permanecem legíveis.
- Restore V3 valida tudo antes da troca ativa e possui rollback.

---

### Task 1: Storage clínico por profissional
**Files:**
- Modify: `js/core/local-data-isolation-main.js`
- Modify: `js/domains/clinical-files.js`
- Modify: `preload.js`
- Test: `test/professional-clinical-files.test.js`

**Interfaces:**
- Produces: `dataIsolation.selectClinicalFile(token)`, `openClinicalFile(token,path)`, `removeClinicalFile(token,path)`.

- [ ] Write tests proving paths are professional-scoped and foreign paths are rejected.
- [ ] Run tests and verify RED.
- [ ] Implement session-bound file copy/open/remove with atomic file writes.
- [ ] Update renderer to pass `DB.session().token`.
- [ ] Run tests and full suite.

### Task 2: Backup format V3
**Files:**
- Modify: `js/core/backup-format.js`
- Test: `test/backup-format-v3.test.js`

**Interfaces:**
- Produces: `encryptCompositeBackup(payload,password)` and `decryptCompositeBackup(text,password)`.

- [ ] Write tests for round-trip, SHA-256 manifest validation, tampering and V1/V2 compatibility.
- [ ] Verify RED.
- [ ] Implement V3 envelope and validators.
- [ ] Verify GREEN.

### Task 3: Composite data inventory
**Files:**
- Modify: `js/core/local-data-isolation-main.js`
- Test: `test/composite-backup-inventory.test.js`

**Interfaces:**
- Produces internal inventory/export/import functions for clinic DB, professional DBs and files.

- [ ] Write tests for multi-professional inventory and refusal of malformed directories/files.
- [ ] Verify RED.
- [ ] Implement export inventory using `safeStorage` decryption and SHA-256 hashes.
- [ ] Verify GREEN.

### Task 4: Backup/restore Electron orchestration
**Files:**
- Modify: `js/core/desktop-data-hardening.js`
- Modify: `preload.js`
- Modify: `js/domains/backup-restore-coordinator.js`
- Test: `test/composite-backup-restore.test.js`

**Interfaces:**
- `salvar-backup-composto(password)`
- `abrir-backup-composto(password)`
- `confirmar-restauracao-composta(sessionId)`
- `cancelar-restauracao-composta(sessionId)`

- [ ] Write restore staging/rollback tests.
- [ ] Verify RED.
- [ ] Implement V3 save/open/stage/commit/cancel while retaining V1/V2 restore path.
- [ ] Update UI coordinator to prefer V3 composite APIs.
- [ ] Verify GREEN.

### Task 5: Migration and final verification
**Files:**
- Modify tests/wiring as needed only after failing coverage.

- [ ] Add regression test: legacy attachment is not assigned to an unrelated professional.
- [ ] Run `npm run lint` and `npm test` on branch HEAD.
- [ ] Compare branch to `main`; require behind=0 and expected changes only.
