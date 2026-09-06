const test = require('node:test');
const assert = require('node:assert/strict');
const renderer = require('../js/core/document-renderer');

test('renders A4 clinical document with escaped patient fields and page break support', () => {
  const html = renderer.renderDocument({
    title: '<Resumo>',
    clinic: { nome: 'Clínica', endereco: 'Rua A', cidade: 'Ribeirão Preto', telefone: '1', cnpj: '2', cor: '#123456' },
    patient: { nome: '<Ana>', cpf: '123' },
    professional: { nome: 'Dr. B', crm: 'CRM 1', especialidade: 'Clínica' },
    sections: [renderer.section('Evolução', '<p>Texto</p>'), renderer.pageBreak(), renderer.section('Conduta', '<p>Plano</p>')]
  });
  assert.match(html, /@page\s*\{[^}]*A4/i);
  assert.match(html, /&lt;Ana&gt;/);
  assert.doesNotMatch(html, /<Ana>/);
  assert.match(html, /class="page-break"/);
  assert.match(html, /clinic-name/);
  assert.match(html, /footer-legal/);
});

test('renderer only includes supplied image data URLs', () => {
  const html = renderer.renderDocument({
    title: 'Exame', clinic: {}, patient: {}, professional: {}, sections: [],
    images: [{ name: 'foto', dataUrl: 'data:image/png;base64,AAAA' }, { name: 'bad', dataUrl: 'file:///tmp/x.png' }]
  });
  assert.match(html, /data:image\/png;base64,AAAA/);
  assert.doesNotMatch(html, /file:\/\/\//);
});
