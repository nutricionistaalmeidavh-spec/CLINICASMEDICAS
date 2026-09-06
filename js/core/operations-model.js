(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusOperationsModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const PAYMENT_METHODS = [
    'dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'convenio', 'outro'
  ];

  const CRM_STAGES = ['novo', 'agendado', 'acompanhamento', 'retorno', 'inativo'];
  const OPPORTUNITY_STAGES = ['aberta', 'proposta', 'aguardando', 'ganha', 'perdida'];
  const WHATSAPP_TYPES = ['confirmacao', 'lembrete', 'retorno', 'orcamento', 'cobranca'];

  function toFiniteNumber(value, fallback = 0) {
    const number = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function roundCurrency(value) {
    return Math.round((toFiniteNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function calculatePayout(amount, percent) {
    const gross = Math.max(0, toFiniteNumber(amount));
    const rate = Math.min(100, Math.max(0, toFiniteNumber(percent)));
    return roundCurrency(gross * (rate / 100));
  }

  function computeStockMovement({ type, current, quantity }) {
    const before = Math.max(0, toFiniteNumber(current));
    const q = toFiniteNumber(quantity);
    if (!['entrada', 'saida', 'ajuste'].includes(type)) throw new Error('Tipo de movimentação inválido.');
    if (type !== 'ajuste' && q <= 0) throw new Error('Quantidade deve ser maior que zero.');
    if (type === 'ajuste' && q < 0) throw new Error('Estoque ajustado não pode ser negativo.');

    let delta = 0;
    let after = before;
    if (type === 'entrada') {
      delta = q;
      after = before + q;
    } else if (type === 'saida') {
      delta = -q;
      after = before - q;
    } else {
      after = q;
      delta = q - before;
    }

    if (after < -1e-9) throw new Error('Estoque insuficiente para esta saída.');
    after = Math.max(0, Math.round(after * 1000000) / 1000000);
    delta = Math.round(delta * 1000000) / 1000000;
    return { before, after, delta, quantity: q };
  }

  function brDateToIso(value) {
    const match = String(value || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return '';
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  function isoDateToBr(value) {
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  function appointmentDateTimeIso(dateBr, time) {
    const date = brDateToIso(dateBr);
    const clock = String(time || '').trim();
    if (!date || !/^\d{2}:\d{2}$/.test(clock)) return '';
    return `${date}T${clock}:00`;
  }

  function localIsoDate(date = new Date()) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function addDaysIso(isoDate, days) {
    const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function daysBetweenIso(olderIso, newerIso) {
    const older = new Date(`${olderIso}T00:00:00Z`);
    const newer = new Date(`${newerIso}T00:00:00Z`);
    if (Number.isNaN(older.getTime()) || Number.isNaN(newer.getTime())) return null;
    return Math.floor((newer.getTime() - older.getTime()) / 86400000);
  }

  function isDue(dueIso, todayIso = localIsoDate()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dueIso || ''))) return false;
    return dueIso <= todayIso;
  }

  function classifyFinancialStatus(entry = {}, todayIso = localIsoDate()) {
    if (entry.status === 'pago') return 'pago';
    if (entry.status === 'cancelado') return 'cancelado';
    if (entry.vencimento_em && entry.vencimento_em < todayIso) return 'atrasado';
    return 'pendente';
  }

  function isPatientInactive(lastAttendanceIso, todayIso = localIsoDate(), thresholdDays = 180) {
    if (!lastAttendanceIso) return true;
    const days = daysBetweenIso(lastAttendanceIso, todayIso);
    return days !== null && days >= thresholdDays;
  }

  function buildWhatsappMessage(type, context = {}) {
    const patient = context.paciente || context.patient || 'paciente';
    const clinic = context.clinica || context.clinic || 'a clínica';
    const professional = context.profissional || context.professional || '';
    const date = context.data || context.date || '';
    const time = context.hora || context.time || '';
    const amount = context.valor || context.amount || '';
    const title = context.titulo || context.title || 'tratamento';

    if (type === 'confirmacao') {
      return `Olá, ${patient}. Aqui é da ${clinic}. Confirmamos sua consulta${professional ? ` com ${professional}` : ''}${date ? ` em ${date}` : ''}${time ? ` às ${time}` : ''}. Se precisar remarcar, responda a esta mensagem.`;
    }
    if (type === 'lembrete') {
      return `Olá, ${patient}. Lembrete da ${clinic}: sua consulta${professional ? ` com ${professional}` : ''}${date ? ` é em ${date}` : ''}${time ? ` às ${time}` : ''}. Se não puder comparecer, avise a recepção.`;
    }
    if (type === 'retorno') {
      return `Olá, ${patient}. A ${clinic} está entrando em contato sobre seu acompanhamento. Podemos organizar seu retorno?`;
    }
    if (type === 'orcamento') {
      return `Olá, ${patient}. A ${clinic} está acompanhando ${title}. Ficamos à disposição para tirar dúvidas e dar continuidade quando for conveniente para você.`;
    }
    if (type === 'cobranca') {
      return `Olá, ${patient}. A ${clinic} identificou uma pendência financeira${amount ? ` no valor de ${amount}` : ''}. Se o pagamento já foi realizado, desconsidere e envie o comprovante para conferência.`;
    }
    throw new Error('Tipo de mensagem WhatsApp inválido.');
  }

  function whatsappDedupeKey(type, originType, originId) {
    if (!WHATSAPP_TYPES.includes(type)) throw new Error('Tipo de mensagem WhatsApp inválido.');
    if (!originType || originId == null) throw new Error('Origem da mensagem é obrigatória.');
    return `${type}:${originType}:${originId}`;
  }

  function whatsappScheduledDedupeKey(type, originType, originId, scheduleKey) {
    const base = whatsappDedupeKey(type, originType, originId);
    const schedule = String(scheduleKey || '').trim();
    if (!schedule) throw new Error('Agenda da mensagem recorrente é obrigatória.');
    return `${base}:${schedule}`;
  }

  return {
    PAYMENT_METHODS,
    CRM_STAGES,
    OPPORTUNITY_STAGES,
    WHATSAPP_TYPES,
    toFiniteNumber,
    roundCurrency,
    calculatePayout,
    computeStockMovement,
    brDateToIso,
    isoDateToBr,
    appointmentDateTimeIso,
    localIsoDate,
    addDaysIso,
    daysBetweenIso,
    isDue,
    classifyFinancialStatus,
    isPatientInactive,
    buildWhatsappMessage,
    whatsappDedupeKey,
    whatsappScheduledDedupeKey
  };
});
