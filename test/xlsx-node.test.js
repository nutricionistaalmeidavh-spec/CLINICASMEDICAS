const test = require('node:test');
const assert = require('node:assert/strict');
const xlsx = require('../js/core/xlsx-node');

test('xlsx helper decodes shared strings and spreadsheet columns', () => {
  assert.equal(xlsx.columnIndex('A1'), 0);
  assert.equal(xlsx.columnIndex('Z9'), 25);
  assert.equal(xlsx.columnIndex('AA2'), 26);
  assert.deepEqual(xlsx.parseSharedStrings('<sst><si><t>Nome</t></si><si><r><t>Ana</t></r><r><t> Souza</t></r></si></sst>'), ['Nome', 'Ana Souza']);
});

test('xlsx worksheet parser converts the first row to object headers', () => {
  const xml = '<worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="inlineStr"><is><t>Nome</t></is></c><c r="B1" t="inlineStr"><is><t>CPF</t></is></c></row>' +
    '<row r="2"><c r="A2" t="inlineStr"><is><t>Ana Souza</t></is></c><c r="B2" t="inlineStr"><is><t>123</t></is></c></row>' +
    '</sheetData></worksheet>';
  const rows = xlsx.parseWorksheet(xml, []);
  assert.deepEqual(xlsx.rowsToObjects(rows), [{ Nome: 'Ana Souza', CPF: '123' }]);
});
