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

  const api = {
    DEFAULT_ROLES,
    ROLE_META,
    parseAllowedRoles,
    canViewMenuItem,
    getLandingPage,
    getRoleMeta,
  };

  root.PlennusAccessControl = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
