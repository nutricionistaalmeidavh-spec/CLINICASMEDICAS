# Sage Premium Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Sage Premium visual direction for Design System, Shell, Dashboard and Pacientes without changing product behavior.

**Architecture:** Keep `css/style.css` as the legacy baseline and make `css/platform.css` the premium override layer. Keep existing runtime composition in `js/core/shell.js` and `js/domains/dashboard.js`; enhance `js/domains/patients.js` at runtime so the large static `index.html` keeps all existing element IDs and handlers.

**Tech Stack:** Electron renderer, plain HTML/CSS/JavaScript, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-07-sage-premium-pilot-design.md`

## Global Constraints
- Brand palette: `#35483C`, `#526A5A`, `#8FA88F`, `#F6F4EE`, `#FFFFFF`, `#242824`, `#667068`, `#DDDCD4`.
- Do not change database schema, IPC, authentication, professional isolation, Hub LAN or backup contracts.
- Preserve all existing page/form IDs and global function names.
- Keep role-based dashboard visibility intact.

---

### Task 1: Visual contracts
**Files:** Create `test/sage-premium-ui.test.js`.

- [ ] Write failing assertions for Sage tokens, shell profile hooks, dashboard focus hierarchy, patients workspace hooks and legacy patient IDs.
- [ ] Run the test and confirm the current branch fails only on the new contracts.
- [ ] Commit the red test.

### Task 2: Sage Premium design system and shell
**Files:** Modify `css/platform.css`, `js/core/shell.js`.

- [ ] Replace wine/red brand values with semantic Sage tokens while preserving status colors.
- [ ] Restyle sidebar, cards, inputs, tables, buttons, topbar and focus states.
- [ ] Add compact topbar profile markup that reuses existing user display information without changing auth.
- [ ] Run `test/sage-premium-ui.test.js` and `test/shell-ui.test.js`.

### Task 3: Dashboard hierarchy
**Files:** Modify `js/domains/dashboard.js`, `css/platform.css`.

- [ ] Recompose `dashboardLayoutMarkup()` so upcoming appointments and attention items appear before KPIs.
- [ ] Preserve every metric/container ID referenced by `carregarDashboard()`.
- [ ] Keep financial/admin visibility classes unchanged.
- [ ] Run dashboard and Sage UI tests.

### Task 4: Pacientes workspace
**Files:** Modify `js/domains/patients.js`, `css/platform.css`.

- [ ] Add `ensurePatientsUi()` to decorate existing static patient cards without replacing form fields.
- [ ] Add page header, new-patient action, patient count and local search input.
- [ ] Render rows with initials avatar, patient identity block and semantic allergy badge while preserving row selection and PEP action.
- [ ] Add responsive split layout and run Sage UI tests.

### Task 5: Regression and integration
**Files:** No behavior changes expected.

- [ ] Run full `npm run lint`.
- [ ] Run full `npm test`.
- [ ] Open PR only if both are green.
- [ ] Require CI, Runtime Security and Windows build/release checks to pass before merge.