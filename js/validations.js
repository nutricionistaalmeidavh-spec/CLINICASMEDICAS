(function (root) {
  function isValidDate(value) {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value || '')) return false;
    const [day, month, year] = value.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function isValidTime(value) {
    if (!/^\d{2}:\d{2}$/.test(value || '')) return false;
    const [hour, minute] = value.split(':').map(Number);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
  }

  function calcularIMC(peso, altura) {
    const p = parseFloat(peso);
    let h = parseFloat(altura);
    if (!p || !h || p <= 0 || h <= 0) return null;
    if (h > 3) h = h / 100;
    const imc = p / (h * h);
    return Math.round(imc * 10) / 10;
  }

  function classificarIMC(imc) {
    if (imc == null || isNaN(imc)) return { tag: '', label: '' };
    if (imc < 18.5) return { tag: 'baixo', label: 'Abaixo do peso' };
    if (imc <= 24.9) return { tag: 'normal', label: 'Peso normal' };
    if (imc <= 29.9) return { tag: 'sobrepeso', label: 'Sobrepeso' };
    return { tag: 'obesidade', label: 'Obesidade' };
  }

  function formatarTelefoneWhatsApp(telefone) {
    if (!telefone) return null;
    const digitos = String(telefone).replace(/\D/g, '');
    if (digitos.length < 10) return null;
    if ((digitos.length === 10 || digitos.length === 11) && !digitos.startsWith('55')) {
      return `55${digitos}`;
    }
    return digitos;
  }

  function gerarMensagemWhatsAppConfirmacao({ paciente, clinica, profissional, data, hora }) {
    const prof = profissional ? `Dr(a). ${profissional}` : 'nossa equipe';
    const clinicaNome = clinica || 'Plennus Clinic';
    return `Olá, ${paciente}! Confirmamos sua consulta na clínica ${clinicaNome} com ${prof} agendada para o dia ${data} às ${hora}.\n\nPor favor, confirme sua presença respondendo com SIM. Caso necessite reagendar, nos informe por aqui. Obrigado!`;
  }

  function calcularMinutosDecorrido(horaInicio, horaFim) {
    if (!horaInicio) return 0;
    const pIni = horaInicio.split(':').map(Number);
    if (isNaN(pIni[0]) || isNaN(pIni[1])) return 0;
    const iniMin = pIni[0] * 60 + pIni[1];

    let fimMin;
    if (horaFim) {
      const pFim = horaFim.split(':').map(Number);
      if (isNaN(pFim[0]) || isNaN(pFim[1])) return 0;
      fimMin = pFim[0] * 60 + pFim[1];
    } else {
      const agora = new Date();
      fimMin = agora.getHours() * 60 + agora.getMinutes();
    }
    const diff = fimMin - iniMin;
    return diff > 0 ? diff : 0;
  }

  const api = { 
    isValidDate, 
    isValidTime, 
    calcularIMC, 
    classificarIMC, 
    formatarTelefoneWhatsApp, 
    gerarMensagemWhatsAppConfirmacao, 
    calcularMinutosDecorrido 
  };
  root.PlennusValidation = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
