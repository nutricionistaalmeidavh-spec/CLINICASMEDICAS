(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusGlobalSearch = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function normalizeSearchTerm(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  function normalizeCpf(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function destinationForRole(role) {
    return role === 'admin' || role === 'medico' ? 'prontuario' : 'pacientes';
  }

  function buildPatientSearchSql(term, limit = 8) {
    const text = normalizeSearchTerm(term);
    const digits = normalizeCpf(term);
    const like = `%${text}%`;
    const phoneLike = `%${digits}%`;
    return {
      sql: `SELECT id,nome,cpf,celular,telefone FROM pacientes
            WHERE ativo=1 AND (
              LOWER(nome) LIKE ? OR
              REPLACE(REPLACE(REPLACE(cpf,'.',''),'-',''),' ','') LIKE ? OR
              REPLACE(REPLACE(REPLACE(REPLACE(celular,'(',''),')',''),'-',''),' ','') LIKE ? OR
              REPLACE(REPLACE(REPLACE(REPLACE(telefone,'(',''),')',''),'-',''),' ','') LIKE ?
            ) ORDER BY nome LIMIT ?`,
      params: [like, `%${digits || text}%`, phoneLike, phoneLike, Math.max(1, Math.min(Number(limit) || 8, 20))]
    };
  }

  function searchPatients(term, limit = 8) {
    if (typeof DB === 'undefined' || !DB?.query) return [];
    const normalized = normalizeSearchTerm(term);
    if (normalized.length < 2 && normalizeCpf(term).length < 3) return [];
    const built = buildPatientSearchSql(term, limit);
    return DB.query(built.sql, built.params);
  }

  function renderResults(rows) {
    const container = document.getElementById('global-search-results');
    if (!container) return;
    if (!rows.length) {
      container.innerHTML = '<div class="global-search-empty">Nenhum paciente encontrado</div>';
      container.hidden = false;
      return;
    }
    container.innerHTML = rows.map(row => `
      <button type="button" class="global-search-result" data-patient-id="${Number(row.id)}">
        <span class="global-search-name">${typeof escapeHTML === 'function' ? escapeHTML(row.nome || '') : String(row.nome || '')}</span>
        <span class="global-search-meta">${typeof escapeHTML === 'function' ? escapeHTML(row.cpf || row.celular || row.telefone || 'Sem documento/contato') : String(row.cpf || row.celular || row.telefone || '')}</span>
      </button>`).join('');
    container.hidden = false;
    container.querySelectorAll('[data-patient-id]').forEach(button => {
      button.addEventListener('click', () => openPatientResult(Number(button.dataset.patientId)));
    });
  }

  function openPatientResult(patientId) {
    if (!patientId) return;
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;
    const destination = destinationForRole(role);
    const container = document.getElementById('global-search-results');
    if (container) container.hidden = true;
    if (destination === 'prontuario') {
      const select = document.getElementById('pep-paciente');
      if (select) select.value = String(patientId);
      if (typeof navegar === 'function') navegar('prontuario');
      if (typeof selecionarPacientePep === 'function') selecionarPacientePep();
      return;
    }
    if (typeof navegar === 'function') navegar('pacientes');
    if (typeof selecionarPaciente === 'function') selecionarPaciente(patientId);
  }

  function setupGlobalSearch() {
    const input = document.getElementById('global-search-input');
    const container = document.getElementById('global-search-results');
    if (!input || !container || input.dataset.bound === '1') return;
    input.dataset.bound = '1';
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => renderResults(searchPatients(input.value)), 160);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        input.value = '';
        container.hidden = true;
        input.blur();
      }
    });
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.focus();
        input.select();
      } else if (event.key === 'Escape' && document.activeElement !== input) {
        container.hidden = true;
      }
    });
  }

  return {
    normalizeSearchTerm,
    normalizeCpf,
    destinationForRole,
    buildPatientSearchSql,
    searchPatients,
    renderResults,
    openPatientResult,
    setupGlobalSearch
  };
});
