# Integração de supranumerários — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar dentes supranumerários ao odontograma preservando compatibilidade FDI, isolamento por profissional, plano/orçamento, agenda/financeiro e backup V3.

**Architecture:** A migration V4 adiciona identidade dental própria e referências nullable sem substituir `dente INTEGER`. O renderer usa um módulo de domínio dedicado para persistência/rotulagem e a odontologia existente passa a aceitar alvo FDI ou supranumerário. As tabelas novas são clínicas e ficam no `clinical.db` profissional.

**Tech Stack:** Electron 44.2.0, JavaScript, sql.js, node:test.

**Spec:** `docs/superpowers/specs/2026-09-06-supernumerarios-integration-design.md`

## Global Constraints
- Nenhum SQL clínico via Clinic Hub LAN.
- Nenhum dado supranumerário no snapshot compartilhado.
- `dente INTEGER` permanece compatível para FDI existente.
- Migration aditiva e idempotente.
- Backup V3 mantém o mesmo envelope; novas tabelas viajam dentro do SQLite profissional.
- Implementação somente na branch `feat/supernumerary-integration-2026-09-06` até CI verde.

---

### Task 1: Contratos de modelo e schema
**Files:**
- Create: `test/supernumerary-integration.test.js`
- Create: `js/core/supernumerary-model.js`
- Modify: `js/core/migrations.js`

**Interfaces:**
- Produces `PlennusSupernumeraryModel.makeLabel(referenceTooth,index)`, `validateReferenceTooth`, `nextIndex`.
- Migration V4 cria `odontograma_elementos`, `odontograma_elemento_eventos` e colunas nullable de ligação.

- [ ] Escrever testes que exigem modelo, migration V4, índices únicos e colunas compatíveis.
- [ ] Executar `npm test -- --test-name-pattern=supranumer` e confirmar falha por recurso ausente.
- [ ] Implementar modelo e migration mínima.
- [ ] Executar testes e confirmar verde.

### Task 2: Migration do clinical.db e isolamento
**Files:**
- Modify: `js/core/data-isolation.js`
- Modify: `js/core/database-isolation-router-safe.js`
- Test: `test/supernumerary-integration.test.js`

**Interfaces:**
- Novas tabelas entram em `CLINICAL_TABLES`.
- `activateSession()` aplica `PlennusMigrations.ensurePlatformSchema`/equivalente ao banco profissional antes de disponibilizá-lo.
- Pruning remove elementos/eventos órfãos ou fora dos odontogramas permitidos.

- [ ] Adicionar testes de roteamento/pruning/migration profissional.
- [ ] Confirmar vermelho.
- [ ] Implementar integração mínima.
- [ ] Confirmar verde.

### Task 3: Persistência e API de supranumerários
**Files:**
- Create: `js/domains/supernumerary-database.js`
- Modify: `js/core/navigation.js`
- Test: `test/supernumerary-integration.test.js`

**Interfaces:**
- Produces `PlennusSupernumerary.create`, `list`, `get`, `setStatus`, `addCondition`, `labelForElement`, `targetForElement`.
- Todas as operações usam `DB.query/run`, portanto passam pelo roteador clínico.

- [ ] Testar SN1/SN2, status e histórico.
- [ ] Confirmar vermelho.
- [ ] Implementar API.
- [ ] Confirmar verde.

### Task 4: Odontograma, condições e plano
**Files:**
- Modify: `js/domains/odontology.js`
- Modify: `css/odontology.css`
- Test: `test/supernumerary-integration.test.js`

**Interfaces:**
- Seleção dental aceita `{kind:'fdi', tooth}` ou `{kind:'supernumerary', elementId, referenceTooth, label}`.
- Condições de FDI usam `elemento_dental_id IS NULL`; condições de SN usam `elemento_dental_id=?`.
- Item de plano persiste `dente` de referência + `elemento_dental_id`.

- [ ] Testar isolamento de condição entre 11 e 11-SN1 e persistência no plano.
- [ ] Confirmar vermelho.
- [ ] Implementar UI/fluxo mínimo.
- [ ] Confirmar verde.

### Task 5: Orçamento, agenda, financeiro e backup
**Files:**
- Modify: `js/domains/odontology.js`
- Test: `test/supernumerary-integration.test.js`
- Test: `test/composite-backup-restore.test.js` se necessário para contrato.

**Interfaces:**
- Snapshot de orçamento copia `elemento_dental_id` + `rotulo_dental`.
- Agenda continua ligada ao item do plano; financeiro usa descrição enriquecida, sem schema dental novo.
- Backup V3 preserva SQLite profissional sem alteração de formato.

- [ ] Testar snapshot `11-SN1`, agendamento e descrição de cobrança.
- [ ] Testar que o inventário V3 não filtra novas tabelas.
- [ ] Implementar ajustes mínimos.
- [ ] Confirmar verde.

### Task 6: Verificação e entrega
**Files:**
- Modify: `package.json` apenas para incluir novos JS no `lint`.

- [ ] Executar `npm run lint`.
- [ ] Executar `npm test`.
- [ ] Abrir PR para `main` somente após CI verde.
- [ ] Não mesclar até verificar o head do PR.
