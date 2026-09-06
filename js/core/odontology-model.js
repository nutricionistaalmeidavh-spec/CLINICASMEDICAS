(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusOdontologyModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SURFACES = ['vestibular', 'lingual', 'palatina', 'mesial', 'distal', 'oclusal', 'incisal'];
  const CONDITION_TYPES = [
    'carie', 'restauracao', 'ausente', 'implante', 'coroa', 'endodontia',
    'extracao_indicada', 'protese', 'fratura', 'mobilidade', 'observacao'
  ];
  const PLAN_STATUSES = ['rascunho', 'proposto', 'aprovado', 'em_tratamento', 'concluido', 'cancelado'];
  const ITEM_STATUSES = ['planejado', 'agendado', 'realizado', 'cancelado'];
  const BUDGET_STATUSES = ['rascunho', 'enviado', 'parcial', 'aprovado', 'recusado', 'cancelado'];
  const BUDGET_ITEM_STATUSES = ['pendente', 'aprovado', 'recusado'];

  function toNumber(value, fallback = 0) {
    const number = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function roundCurrency(value) {
    return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function isValidFdiTooth(value) {
    const tooth = Number(value);
    if (!Number.isInteger(tooth)) return false;
    const quadrant = Math.floor(tooth / 10);
    const position = tooth % 10;
    if ([1, 2, 3, 4].includes(quadrant)) return position >= 1 && position <= 8;
    if ([5, 6, 7, 8].includes(quadrant)) return position >= 1 && position <= 5;
    return false;
  }

  function dentitionForTooth(value) {
    if (!isValidFdiTooth(value)) return null;
    return Number(value) >= 50 ? 'decidua' : 'permanente';
  }

  function normalizeSurface(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    const aliases = {
      v: 'vestibular', vestibular: 'vestibular',
      l: 'lingual', lingual: 'lingual',
      p: 'palatina', palatina: 'palatina', palatal: 'palatina',
      m: 'mesial', mesial: 'mesial',
      d: 'distal', distal: 'distal',
      o: 'oclusal', oclusal: 'oclusal',
      i: 'incisal', incisal: 'incisal'
    };
    const normalized = aliases[raw];
    if (!normalized || !SURFACES.includes(normalized)) throw new Error('Face dental inválida.');
    return normalized;
  }

  function calculateTreatmentItemTotal({ quantity = 1, unitPrice = 0, discount = 0 } = {}) {
    const qty = toNumber(quantity);
    const price = Math.max(0, toNumber(unitPrice));
    const off = Math.max(0, toNumber(discount));
    if (qty <= 0) throw new Error('Quantidade deve ser maior que zero.');
    return roundCurrency(Math.max(0, qty * price - off));
  }

  function deriveBudgetStatus(statuses = []) {
    const normalized = statuses.filter(status => BUDGET_ITEM_STATUSES.includes(status));
    if (!normalized.length) return 'rascunho';
    const approved = normalized.filter(status => status === 'aprovado').length;
    const refused = normalized.filter(status => status === 'recusado').length;
    const pending = normalized.filter(status => status === 'pendente').length;
    if (approved === normalized.length) return 'aprovado';
    if (refused === normalized.length) return 'recusado';
    if (approved > 0 && refused + approved === normalized.length) return 'parcial';
    if (approved > 0) return 'parcial';
    if (pending > 0) return 'enviado';
    return 'rascunho';
  }

  function isTreatmentPlanComplete(statuses = []) {
    if (!statuses.length) return false;
    return statuses.every(status => status === 'realizado' || status === 'cancelado');
  }

  function permanentTeeth() {
    return [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28,48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
  }

  function deciduousTeeth() {
    return [55,54,53,52,51,61,62,63,64,65,85,84,83,82,81,71,72,73,74,75];
  }

  return {
    SURFACES,
    CONDITION_TYPES,
    PLAN_STATUSES,
    ITEM_STATUSES,
    BUDGET_STATUSES,
    BUDGET_ITEM_STATUSES,
    toNumber,
    roundCurrency,
    isValidFdiTooth,
    dentitionForTooth,
    normalizeSurface,
    calculateTreatmentItemTotal,
    deriveBudgetStatus,
    isTreatmentPlanComplete,
    permanentTeeth,
    deciduousTeeth
  };
});
