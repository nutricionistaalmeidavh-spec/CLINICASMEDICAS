const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const shell = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'shell.js'), 'utf8');
const search = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'global-search.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'platform.css'), 'utf8');

test('modern shell keeps legacy page contracts and composes persistent topbar at runtime', () => {
  assert.match(shell, /shell-topbar/);
  assert.match(shell, /shell-page-title/);
  assert.match(shell, /global-search-input/);
  assert.match(search, /setupGlobalSearch/);
  for (const page of ['dashboard','agenda','prontuario','pacientes','profissionais','convenios','documentos','caixa','repasses','configuracoes']) {
    assert.match(html, new RegExp(`id="page-${page}"`));
  }
});

test('visual system defines semantic tokens and keyboard focus styles', () => {
  for (const token of ['--surface','--surface-muted','--text-secondary','--radius-lg','--shadow-sm']) assert.match(css, new RegExp(token));
  assert.match(css, /:focus-visible/);
});
