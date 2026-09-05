const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

test('modern shell keeps legacy page contracts and adds persistent topbar', () => {
  assert.match(html, /id="shell-topbar"/);
  assert.match(html, /id="shell-page-title"/);
  assert.match(html, /id="global-search-input"/);
  for (const page of ['dashboard','agenda','prontuario','pacientes','profissionais','convenios','documentos','caixa','repasses','configuracoes']) {
    assert.match(html, new RegExp(`id="page-${page}"`));
  }
});

test('visual system defines semantic tokens and keyboard focus styles', () => {
  for (const token of ['--surface','--surface-muted','--text-secondary','--radius-lg','--shadow-sm']) {
    assert.match(css, new RegExp(token.replace('--', '--')));
  }
  assert.match(css, /:focus-visible/);
});
