(function (root) {
  const DEFAULT_ROLES = ['admin', 'medico', 'recepcao'];
  const ROLE_META = {
    admin: { label: 'Administrador', className: 'badge-admin' },
    medico: { label: 'Médico / Profissional', className: 'badge-medico' },
    recepcao: { label: 'Recepção', className: 'badge-recepcao' },
  };

  function parseAllowedRoles(rolesAttr) {
    if (!rolesAttr) return [...DEFAULT_ROLES];
    return String(rolesAttr).split(',').map(role => role.trim()).filter(Boolean);
  }

  function canViewMenuItem(role, rolesAttr) {
    return parseAllowedRoles(rolesAttr).includes(role);
  }

  function getLandingPage(role) {
    return role === 'medico' || role === 'recepcao' ? 'agenda' : 'dashboard';
  }

  function getRoleMeta(role) {
    return ROLE_META[role] || { label: role || 'Administrador', className: 'badge-admin' };
  }

  function canAccessPatientClinicalWorkspace(role) {
    return role === 'admin' || role === 'medico';
  }

  function canImportPatients(role) {
    return role === 'admin';
  }

  function canViewAudit(role) {
    return role === 'admin';
  }

  function canViewFinancialDashboard(role) {
    return role === 'admin' || role === 'recepcao';
  }

  const api = {
    DEFAULT_ROLES,
    ROLE_META,
    parseAllowedRoles,
    canViewMenuItem,
    getLandingPage,
    getRoleMeta,
    canAccessPatientClinicalWorkspace,
    canImportPatients,
    canViewAudit,
    canViewFinancialDashboard,
  };

  root.PlennusAccessControl = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
