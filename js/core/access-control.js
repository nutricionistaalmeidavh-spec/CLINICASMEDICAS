(function (root) {
  const DEFAULT_ROLES = ['admin', 'medico', 'recepcao'];
  const ROLE_META = {
    admin: { label: 'Administrador', className: 'badge-admin' },
    medico: { label: 'Médico / Profissional', className: 'badge-medico' },
    recepcao: { label: 'Recepção', className: 'badge-recepcao' },
  };

  const PAGE_ROLES = {
    dashboard: ['admin', 'medico', 'recepcao'],
    agenda: ['admin', 'medico', 'recepcao'],
    prontuario: ['admin', 'medico'],
    pacientes: ['admin', 'medico', 'recepcao'],
    profissionais: ['admin'],
    convenios: ['admin', 'recepcao'],
    documentos: ['admin', 'medico'],
    odontologia: ['admin', 'medico', 'recepcao'],
    financeiro: ['admin', 'recepcao'],
    estoque: ['admin', 'recepcao'],
    crm: ['admin', 'recepcao'],
    whatsapp: ['admin', 'recepcao'],
    caixa: ['admin', 'recepcao'],
    repasses: ['admin'],
    configuracoes: ['admin', 'medico', 'recepcao'],
    importar: ['admin'],
    auditoria: ['admin'],
  };

  function parseAllowedRoles(rolesAttr) {
    if (!rolesAttr) return [...DEFAULT_ROLES];
    return String(rolesAttr).split(',').map(role => role.trim()).filter(Boolean);
  }

  function canViewMenuItem(role, rolesAttr) {
    return parseAllowedRoles(rolesAttr).includes(role);
  }

  function canNavigateToPage(role, page) {
    const allowed = PAGE_ROLES[page];
    return Array.isArray(allowed) && allowed.includes(role);
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

  function canEditClinicalData(role) {
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

  function canManageClinicSettings(role) {
    return role === 'admin';
  }

  function canManageUsers(role) {
    return role === 'admin';
  }

  function canManageBackups(role) {
    return role === 'admin';
  }

  function canManagePayouts(role) {
    return role === 'admin';
  }

  const api = {
    DEFAULT_ROLES,
    ROLE_META,
    PAGE_ROLES,
    parseAllowedRoles,
    canViewMenuItem,
    canNavigateToPage,
    getLandingPage,
    getRoleMeta,
    canAccessPatientClinicalWorkspace,
    canEditClinicalData,
    canImportPatients,
    canViewAudit,
    canViewFinancialDashboard,
    canManageClinicSettings,
    canManageUsers,
    canManageBackups,
    canManagePayouts,
  };

  root.PlennusAccessControl = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
