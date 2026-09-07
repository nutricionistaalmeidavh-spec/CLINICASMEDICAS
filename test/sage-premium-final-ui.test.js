const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const shell = read('js/core/shell.js');
const inventory = read('js/domains/inventory.js');
const crm = read('js/domains/crm.js');
const whatsapp = read('js/domains/whatsapp-automation.js');
const settings = read('js/domains/settings.js');
const imports = read('js/domains/imports.js');
const audit = read('js/domains/audit-view.js');
const html = read('index.html');
const finalCssPath = path.join(root, 'css', 'sage-premium-final.css');

test('shell loads and applies the final Sage Premium visual layer', () => {
  assert.match(shell, /sage-premium-final\.css/);
  assert.match(shell, /applyFinalPremiumClasses/);
  for (const className of [
    'inventory-premium-page', 'crm-premium-page', 'whatsapp-premium-page',
    'settings-premium-page', 'import-premium-page', 'audit-premium-page'
  ]) assert.match(shell, new RegExp(className));
  assert.ok(fs.existsSync(finalCssPath), 'final Sage Premium stylesheet must exist');
});

test('inventory visual redesign preserves stock and procedure-consumption contracts', () => {
  for (const id of [
    'page-estoque','estoque-kpis','est-item-nome','est-item-codigo','est-item-unidade','est-item-fabricante',
    'est-item-inicial','est-item-minimo','est-item-lote','est-item-validade','est-item-salvar',
    'est-mov-item','est-mov-tipo','est-mov-quantidade','est-mov-lote','est-mov-validade','est-mov-motivo','est-mov-salvar',
    'est-map-procedimento','est-map-item','est-map-quantidade','est-map-salvar','est-map-tabela','est-mov-tabela','est-item-tabela'
  ]) assert.match(inventory, new RegExp(`id=\\"${id}\\"`));
  for (const fn of ['cadastrarItem','registrarMovimento','salvarConsumoProcedimento','consumeForAppointment']) {
    assert.match(inventory, new RegExp(`function ${fn}\\(`));
  }
});

test('CRM and WhatsApp visual redesign preserve operational queue contracts', () => {
  for (const id of [
    'page-crm','crm-kpis','crm-busca','crm-filtro-etapa','crm-pacientes-tabela','crm-int-paciente','crm-int-tipo',
    'crm-int-descricao','crm-int-resultado','crm-int-proxima','crm-int-etapa','crm-int-salvar','crm-historico',
    'crm-op-paciente','crm-op-tipo','crm-op-titulo','crm-op-valor','crm-op-etapa','crm-op-proxima','crm-op-observacao','crm-op-salvar','crm-op-tabela'
  ]) assert.match(crm, new RegExp(`id=\\"${id}\\"`));
  for (const id of ['page-whatsapp','wpp-sync','wpp-kpis','wpp-filtro-status','wpp-filtro-tipo','wpp-tabela']) {
    assert.match(whatsapp, new RegExp(`id=\\"${id}\\"`));
  }
  for (const fn of ['registrarInteracao','registrarOportunidade']) assert.match(crm, new RegExp(`function ${fn}\\(`));
  for (const fn of ['syncAllScheduledMessages','openMessage','markSent','cancelMessage']) assert.match(whatsapp, new RegExp(`function ${fn}\\(`));
});

test('settings redesign preserves identity users security backup and updater ids', () => {
  for (const id of [
    'page-configuracoes','cfg-nome','cfg-cnpj','cfg-endereco','cfg-cidade','cfg-telefone',
    'card-usuarios-gestao','usr-nome','usr-login','usr-senha','usr-nivel','tabela-usuarios',
    'cfg-senha-atual','cfg-senha-nova'
  ]) assert.match(html, new RegExp(`id="${id}"`));
  for (const id of ['desktop-updater-settings','updater-status-text','updater-current-version','updater-check-btn','updater-download-btn','updater-install-btn']) {
    assert.match(settings, new RegExp(`id=\\"${id}\\"`));
  }
  for (const fn of ['salvarConfig','salvarNovoUsuario','alterarSenha','fazerBackup','restaurarBackup']) {
    const source = `${settings}\n${html}`;
    assert.match(source, new RegExp(`${fn}\\(`));
  }
});

test('import and audit redesign preserve admin-only workflow contracts', () => {
  for (const id of ['page-importar','import-select-file','import-cancel','import-file-name','import-preview-card','import-summary','import-preview-body','import-confirm','import-cancel-bottom']) {
    assert.match(imports, new RegExp(`id=\\"${id}\\"`));
  }
  for (const id of ['page-auditoria','audit-refresh','audit-entity','audit-action','audit-table-body']) {
    assert.match(audit, new RegExp(`id=\\"${id}\\"`));
  }
  assert.match(imports, /canImportPatients/);
  assert.match(audit, /canViewAudit/);
});

test('final stylesheet defines premium workspaces and responsive states for all six modules', () => {
  assert.ok(fs.existsSync(finalCssPath), 'final Sage Premium stylesheet must exist');
  if (!fs.existsSync(finalCssPath)) return;
  const css = read('css/sage-premium-final.css');
  for (const marker of [
    'Final modules premium workspace',
    '.inventory-premium-page', '.crm-premium-page', '.whatsapp-premium-page',
    '.settings-premium-page', '.import-premium-page', '.audit-premium-page',
    '.inventory-premium-grid', '.crm-premium-journey', '.whatsapp-premium-queue',
    '.settings-premium-grid', '.import-premium-dropzone', '.audit-premium-ledger', '@media'
  ]) assert.ok(css.includes(marker), `missing final premium marker: ${marker}`);
});
