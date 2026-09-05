const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatMoney,
  escapeHTML,
  validarCPF,
  calcularIdade,
  formatarDataParaIso,
  formatarDataParaBr,
  formatarDataPorExtenso,
} = require('../js/core/utils.js');

test('formats money and escapes HTML without changing the public output contract', () => {
  assert.equal(formatMoney(1234.5), 'R$ 1.234,50');
  assert.equal(formatMoney(0), 'R$ 0,00');
  assert.equal(escapeHTML(`<script>alert('x')</script>`), '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;');
});

test('validates CPF using the same rules as the legacy application', () => {
  assert.equal(validarCPF('529.982.247-25'), true);
  assert.equal(validarCPF('111.111.111-11'), false);
  assert.equal(validarCPF('123'), false);
});

test('formats agenda dates consistently', () => {
  const date = new Date(2026, 8, 5, 14, 30);
  assert.equal(formatarDataParaIso(date), '2026-09-05');
  assert.equal(formatarDataParaBr(date), '05/09/2026');
  assert.equal(formatarDataPorExtenso(date, date), 'Hoje, Sábado, 5 de Setembro');
});

test('calculates patient age preserving the current display format', () => {
  const reference = new Date(2026, 8, 5);
  assert.equal(calcularIdade('05/09/1996', reference), '30 anos (05/09/1996)');
  assert.equal(calcularIdade('', reference), 'Idade não informada');
});
