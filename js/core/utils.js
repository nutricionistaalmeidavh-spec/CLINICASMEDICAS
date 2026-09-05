(function (root) {
  function formatMoney(v) {
    return 'R$ ' + (v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char]));
  }

  function validarCPF(cpf) {
    cpf = String(cpf || '').replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    let s = 0;
    for (let i = 0; i < 9; i++) s += parseInt(cpf[i], 10) * (10 - i);
    let d = (s * 10) % 11;
    if (d === 10) d = 0;
    if (d !== parseInt(cpf[9], 10)) return false;
    s = 0;
    for (let i = 0; i < 10; i++) s += parseInt(cpf[i], 10) * (11 - i);
    d = (s * 10) % 11;
    if (d === 10) d = 0;
    return d === parseInt(cpf[10], 10);
  }

  function hoje(referenceDate = new Date()) {
    return `${String(referenceDate.getDate()).padStart(2, '0')}/${String(referenceDate.getMonth() + 1).padStart(2, '0')}/${referenceDate.getFullYear()}`;
  }

  function agoraHora(referenceDate = new Date()) {
    return `${String(referenceDate.getHours()).padStart(2, '0')}:${String(referenceDate.getMinutes()).padStart(2, '0')}`;
  }

  function calcularIdade(dataNasc, referenceDate = new Date()) {
    if (!dataNasc) return 'Idade não informada';
    if (dataNasc.includes('/')) {
      const partes = dataNasc.split('/');
      if (partes.length === 3) {
        const d = parseInt(partes[0], 10);
        const m = parseInt(partes[1], 10) - 1;
        const y = parseInt(partes[2], 10);
        const nasc = new Date(y, m, d);
        const diff = referenceDate.getTime() - nasc.getTime();
        const ageDate = new Date(diff);
        const anos = Math.abs(ageDate.getUTCFullYear() - 1970);
        return `${anos} anos (${dataNasc})`;
      }
    }
    return dataNasc;
  }

  function formatarDataParaIso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dia}`;
  }

  function formatarDataParaBr(d) {
    const dia = String(d.getDate()).padStart(2, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    return `${dia}/${m}/${y}`;
  }

  function formatarDataPorExtenso(d, today = new Date()) {
    const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const ehHoje = d.toDateString() === today.toDateString();
    const prefixo = ehHoje ? 'Hoje, ' : '';
    return `${prefixo}${diasSemana[d.getDay()]}, ${d.getDate()} de ${meses[d.getMonth()]}`;
  }

  const api = {
    formatMoney,
    escapeHTML,
    validarCPF,
    hoje,
    agoraHora,
    calcularIdade,
    formatarDataParaIso,
    formatarDataParaBr,
    formatarDataPorExtenso,
  };

  root.PlennusUtils = api;
  Object.assign(root, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
