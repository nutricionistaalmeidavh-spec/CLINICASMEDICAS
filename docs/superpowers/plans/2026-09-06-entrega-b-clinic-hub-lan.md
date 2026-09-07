# Entrega B Clinic Hub LAN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir operação multiestação em LAN com um Clinic Hub compartilhado e bancos clínicos profissionais locais e isolados.

**Architecture:** O processo principal Electron hospeda/consome um protocolo LAN cifrado. O Hub mantém `clinic.db`; clientes profissionais mantêm um espelho compartilhado JSON/SQLite local apenas para compatibilidade do renderer e preservam `clinical.db` local. O RPC aceita somente comandos de domínio restritos, nunca SQL livre.

**Tech Stack:** Electron 44, Node.js 22 built-ins (`http`, `dgram`, `crypto`, `os`), `sql.js`, `safeStorage`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-06-entrega-b-clinic-hub-lan-design.md`

## Global Constraints
- Sem dependências npm novas.
- Sem internet/cloud; somente LAN privada/loopback.
- Nenhum `clinical.db` trafega na rede.
- Nenhum SQL remoto livre.
- Renderer continua sandboxed e sem Node integration.
- `main` não recebe merge/release automaticamente.

---

### Task 1: Protocolo e criptografia LAN

**Files:**
- Create: `test/clinic-hub-protocol.test.js`
- Create: `js/core/clinic-hub-protocol.js`

**Interfaces:**
- Produces: `isPrivateAddress(ip)`, `createPairingSecret()`, `pairingProof(secret, deviceId, nonce)`, `seal(key, deviceId, payload)`, `open(key, deviceId, envelope)`, `isFreshTimestamp(ts, now)`.

- [ ] RED: testes para IP privado, segredo de pareamento, HMAC, round-trip AES-GCM, adulteração e timestamp velho.
- [ ] Executar CI e confirmar falha por módulo ausente.
- [ ] GREEN: implementar somente as primitivas cobertas.
- [ ] Executar suíte e manter tudo verde.

### Task 2: Política RPC sem SQL livre

**Files:**
- Create: `test/clinic-hub-policy.test.js`
- Create: `js/core/clinic-hub-policy.js`

**Interfaces:**
- Produces: `allowedSnapshotTables(role)`, `sanitizeConfigurationRows(rows)`, `validateCommand(role, action, payload)`.

- [ ] RED: provar que `medico` recebe apenas tabelas compartilhadas, chaves sensíveis são removidas e ações clínicas/SQL são recusadas.
- [ ] GREEN: implementar allowlist explícita para snapshot e mutações `agenda.updateStatus`, `agenda.upsert`, `patient.upsertBasic`.
- [ ] Rodar suíte.

### Task 3: Serviço Clinic Hub e persistência de pareamentos

**Files:**
- Create: `test/clinic-hub-main.test.js`
- Create: `js/core/clinic-hub-main.js`
- Modify: `updater-main.js`

**Interfaces:**
- Produces: `installClinicHub({ app, ipcMain, safeStorage, isolationService })` com `startHub`, `stopHub`, `status`, `createPairing`, `discover`, `pair`, `connect`, `rpc`.

- [ ] RED: testar beacon sem PII, rejeição de IP público, pareamento obrigatório e persistência cifrada de device keys.
- [ ] GREEN: implementar HTTP + UDP com Node built-ins, portas 43126/43127 e IPC estreito.
- [ ] Integrar bootstrap após `installLocalDataIsolation`.
- [ ] Rodar suíte.

### Task 4: Sessão remota, snapshot e mutações idempotentes

**Files:**
- Create: `test/clinic-hub-rpc.test.js`
- Modify: `js/core/clinic-hub-main.js`
- Modify: `js/core/local-data-isolation-main.js`

**Interfaces:**
- Hub actions: `session.login`, `session.logout`, `shared.snapshot`, `shared.mutate`.
- `local-data-isolation-main` expõe funções internas seguras para autenticar usuário e operar `clinic.db` sem criar IPC genérico.

- [ ] RED: login incorreto falha; snapshot omite senha/clinical tables; mutationId repetido não duplica gravação; médico não executa ação administrativa/clínica.
- [ ] GREEN: implementar sessões Hub com TTL, snapshot por allowlist e registro `network_mutations` idempotente.
- [ ] Rodar suíte.

### Task 5: Bridge Electron e cliente profissional

**Files:**
- Create: `test/clinic-network-wiring.test.js`
- Modify: `preload.js`
- Modify: `js/core/auth.js`
- Modify: `js/core/database-isolation-router-safe.js`
- Modify: `js/core/navigation.js`
- Modify: `package.json`

**Interfaces:**
- `electronAPI.clinicNetwork`: `status/startHub/stopHub/createPairing/discover/pair/connect/disconnect/sync/pushMutation`.
- `DB.setClinicNetworkSession(session)` e `DB.syncSharedMirror(snapshot)`.

- [ ] RED: wiring test exige bridge estreito e proíbe sockets/SQL expostos ao renderer.
- [ ] GREEN: autenticação tenta Hub quando modo cliente está configurado; profissional mantém `clinical.db` local; shared mirror é atualizado no login/reconexão.
- [ ] Mutação compartilhada local é enfileirada sem bloquear o renderer e sincronizada pelo processo principal.
- [ ] Rodar suíte.

### Task 6: Estado de conexão e fallback seguro

**Files:**
- Create: `js/domains/clinic-network-status.js`
- Create: `test/clinic-network-status.test.js`
- Modify: `js/core/navigation.js`
- Modify: `package.json`

**Interfaces:**
- UI recebe estado sanitizado: `hub`, `connected`, `paired`, `offline`, `pendingMutations`, `lastSyncAt`.

- [ ] RED: estado não contém tokens/chaves/segredos.
- [ ] GREEN: componente discreto informa Conectado/Offline e fila pendente; não bloqueia atendimento clínico local.
- [ ] Rodar lint + testes completos.

### Task 7: Verificação final

- [ ] Executar CI no HEAD final.
- [ ] Confirmar `npm ci`, lint e todos os testes verdes.
- [ ] Comparar branch B contra Entrega A para revisar somente mudanças do escopo.
- [ ] Não fazer merge nem publicar release.
