(function (root) {
  const original = root.carregarDashboard;
  if (typeof original !== 'function') return;

  function currentRole() {
    return typeof currentUser !== 'undefined' ? currentUser?.nivel || null : null;
  }

  function setHiddenBySelector(selector, hidden) {
    document.querySelectorAll(selector).forEach(element => { element.hidden = hidden; });
  }

  function applyClinicalDashboardBoundary() {
    if (typeof document === 'undefined') return;
    const role = currentRole();
    const canSeeClinical = root.PlennusAccessControl?.canAccessPatientClinicalWorkspace?.(role) === true;

    ['stat-pendencias', 'stat-exames-pendentes'].forEach(id => {
      const card = document.getElementById(id)?.closest('.dashboard-kpi');
      if (card) card.hidden = !canSeeClinical;
    });

    const clinicalPanel = document.getElementById('dashboard-clinico')?.closest('.dashboard-panel');
    if (clinicalPanel) clinicalPanel.hidden = !canSeeClinical;
    const budgetPanel = document.getElementById('dashboard-orcamentos')?.closest('.dashboard-panel');
    if (budgetPanel) budgetPanel.hidden = !canSeeClinical;

    setHiddenBySelector('.dashboard-kpi-action[onclick*="odontologia"]', !canSeeClinical);
  }

  function carregarDashboardIsolado(...args) {
    const result = original.apply(this, args);
    applyClinicalDashboardBoundary();
    return result;
  }

  root.carregarDashboard = carregarDashboardIsolado;
  if (root.PlennusDashboard) root.PlennusDashboard.carregarDashboard = carregarDashboardIsolado;
  root.PlennusDashboardRoleIsolation = { applyClinicalDashboardBoundary };
})(typeof window !== 'undefined' ? window : globalThis);