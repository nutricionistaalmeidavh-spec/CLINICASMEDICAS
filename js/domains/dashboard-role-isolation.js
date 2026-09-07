(function (root) {
  const original = root.carregarDashboard;
  if (typeof original !== 'function') return;

  function currentRole() {
    return typeof currentUser !== 'undefined' ? currentUser?.nivel || null : null;
  }

  function setHiddenBySelector(selector, hidden) {
    document.querySelectorAll(selector).forEach(element => { element.hidden = hidden; });
  }

  function ensureReturnsPriority(role) {
    const stack = document.querySelector('.dashboard-attention-stack');
    if (!stack) return;
    const canSeeReturns = root.PlennusAccessControl?.canNavigateToPage?.(role, 'crm') === true;
    let item = document.getElementById('dashboard-retornos-prioridade');
    if (!item) {
      item = document.createElement('button');
      item.id = 'dashboard-retornos-prioridade';
      item.className = 'dashboard-attention-item';
      item.type = 'button';
      item.setAttribute('onclick', "navegar('crm')");
      item.innerHTML = `
        <span class="dashboard-attention-icon" aria-hidden="true">↻</span>
        <span class="dashboard-attention-copy"><strong>Retornos pendentes</strong><small>Pacientes que precisam de acompanhamento</small></span>
        <span class="dashboard-attention-value" id="stat-retornos-prioridade">0</span>`;
      const pendingItem = document.getElementById('stat-pendencias')?.closest('.dashboard-attention-item');
      if (pendingItem) pendingItem.insertAdjacentElement('afterend', item);
      else stack.appendChild(item);
    }
    item.hidden = !canSeeReturns;
    const source = document.getElementById('stat-retornos');
    const target = document.getElementById('stat-retornos-prioridade');
    if (target) target.textContent = source?.textContent || '0';
  }

  function applyClinicalDashboardBoundary() {
    if (typeof document === 'undefined') return;
    const role = currentRole();
    const canSeeClinical = root.PlennusAccessControl?.canAccessPatientClinicalWorkspace?.(role) === true;

    ['stat-pendencias', 'stat-exames-pendentes'].forEach(id => {
      const card = document.getElementById(id)?.closest('.dashboard-kpi, .dashboard-attention-item');
      if (card) card.hidden = !canSeeClinical;
    });

    const clinicalPanel = document.getElementById('dashboard-clinico')?.closest('.dashboard-panel');
    if (clinicalPanel) clinicalPanel.hidden = !canSeeClinical;
    const budgetPanel = document.getElementById('dashboard-orcamentos')?.closest('.dashboard-panel');
    if (budgetPanel) budgetPanel.hidden = !canSeeClinical;

    setHiddenBySelector('.dashboard-kpi-action[onclick*="odontologia"]', !canSeeClinical);
    ensureReturnsPriority(role);
  }

  function carregarDashboardIsolado(...args) {
    const result = original.apply(this, args);
    applyClinicalDashboardBoundary();
    return result;
  }

  root.carregarDashboard = carregarDashboardIsolado;
  if (root.PlennusDashboard) root.PlennusDashboard.carregarDashboard = carregarDashboardIsolado;
  root.PlennusDashboardRoleIsolation = { applyClinicalDashboardBoundary, ensureReturnsPriority };
})(typeof window !== 'undefined' ? window : globalThis);
