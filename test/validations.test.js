const test = require('node:test');
const assert = require('node:assert/strict');
const { 
  isValidDate, 
  isValidTime, 
  calcularIMC, 
  classificarIMC, 
  formatarTelefoneWhatsApp, 
  gerarMensagemWhatsAppConfirmacao, 
  calcularMinutosDecorrido 
} = require('../js/validations.js');

test('accepts real Brazilian calendar dates', () => {
  assert.equal(isValidDate('29/02/2024'), true);
  assert.equal(isValidDate('31/12/2026'), true);
});

test('rejects impossible dates and invalid times', () => {
  assert.equal(isValidDate('29/02/2025'), false);
  assert.equal(isValidDate('32/01/2026'), false);
  assert.equal(isValidTime('23:59'), true);
  assert.equal(isValidTime('24:00'), false);
});

test('calculates and classifies clinical BMI correctly', () => {
  // 70kg e 1.75m -> IMC ~ 22.9
  assert.equal(calcularIMC(70, 1.75), 22.9);
  assert.equal(classificarIMC(22.9).tag, 'normal');

  // suporta altura em cm (175)
  assert.equal(calcularIMC(70, 175), 22.9);

  // 95kg e 1.75m -> IMC ~ 31.0 (Obesidade)
  assert.equal(calcularIMC(95, 1.75), 31.0);
  assert.equal(classificarIMC(31.0).tag, 'obesidade');

  // 50kg e 1.75m -> IMC ~ 16.3 (Abaixo do peso)
  assert.equal(calcularIMC(50, 1.75), 16.3);
  assert.equal(classificarIMC(16.3).tag, 'baixo');

  // valores inválidos
  assert.equal(calcularIMC(0, 1.75), null);
  assert.equal(calcularIMC(-70, 1.75), null);
});

test('formats Brazilian phone numbers for WhatsApp API correctly', () => {
  // 11 dígitos (com DDD)
  assert.equal(formatarTelefoneWhatsApp('(11) 98765-4321'), '5511987654321');
  // 10 dígitos (fixo com DDD)
  assert.equal(formatarTelefoneWhatsApp('11 3344-5566'), '551133445566');
  // já com DDI 55
  assert.equal(formatarTelefoneWhatsApp('+55 (11) 98765-4321'), '5511987654321');
  // telefone inválido ou incompleto
  assert.equal(formatarTelefoneWhatsApp('98765-4321'), null);
  assert.equal(formatarTelefoneWhatsApp(''), null);
  assert.equal(formatarTelefoneWhatsApp(null), null);
});

test('generates polite clinical appointment confirmation text for WhatsApp', () => {
  const msg = gerarMensagemWhatsAppConfirmacao({
    paciente: 'Maria Silva',
    clinica: 'Plennus Clinic',
    profissional: 'Dr. Roberto Mendes',
    data: '05/09/2026',
    hora: '14:30'
  });

  assert.ok(msg.includes('Maria Silva'));
  assert.ok(msg.includes('Plennus Clinic'));
  assert.ok(msg.includes('Dr(a). Dr. Roberto Mendes'));
  assert.ok(msg.includes('05/09/2026'));
  assert.ok(msg.includes('14:30'));
  assert.ok(msg.includes('SIM'));
});

test('calculates elapsed wait time in minutes between appointment timestamps', () => {
  assert.equal(calcularMinutosDecorrido('14:00', '14:25'), 25);
  assert.equal(calcularMinutosDecorrido('10:30', '11:15'), 45);
  assert.equal(calcularMinutosDecorrido('15:00', '14:00'), 0);
  assert.equal(calcularMinutosDecorrido('', '14:00'), 0);
});
