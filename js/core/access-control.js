(function (root) {
  const DEFAULT_ROLES = ['admin', 'medico', 'recepcao'];
  const ROLE_META = {
    admin: { label: 'Administrador', className: 'badge-admin' },
    medico: { label: 'Médico / Profissional', className: 'badge-medico' },
    recepcao: { label: 'Recepção', className: 'badge-recepcao' },
  };

  const CAPABILITIES = Object.freeze({
    SCHEDULE_READ: 'schedule.read',
    SCHEDULE_WRITE: 'schedule.write',
    PATIENT_REGISTER: 'patient.register',
    PATIENT_DIRECTORY_READ: 'patient.directory.read',
    BILLING_READ: 'billing.read',
    BILLING_WRITE: 'billing.write',
    CLINICAL_READ: 'clinical.read',
    CLINICAL_WRITE: 'clinical.write',
    PRESCRIPTION_WRITE: 'prescription.write',
    USERS_MANAGE: 'users.manage',
    CLINIC_MANAGE: 'clinic.manage',
    BACKUP_MANAGE: 'backup.manage',
    PAYOUTS_MANAGE: 'payouts.manage',
    AUDIT_READ: 'audit.read',
    IMPORT_PATIENTS: 'patients.import'
  });

  const ROLE_CAPABILITIES = {
    admin: new Set([
      CAPABILITIES.SCHEDULE_READ,
      CAPABILITIES.SCHEDULE_WRITE,
      CAPABILITIES.PATIENT_REGISTER,
      CAPABILITIES.PATIENT_DIRECTORY_READ,
      CAPABILITIES.BILLING_READ,
      CAPABILITIES.BILLING_WRITE,
      CAPABILITIES.USERS_MANAGE,
      CAPABILITIES.CLINIC_MANAGE,
      CAPABILITIES.BACKUP_MANAGE,
      CAPABILITIES.PAYOUTS_MANAGE,
      CAPABILITIES.AUDIT_READ,
      CAPABILITIES.IMPORT_PATIENTS
    ]),
    medico: new Set([
      CAPABILITIES.SCHEDULE_READ,
      CAPABILITIES.SCHEDULE_WRITE,
      CAPABILITIES.PATIENT_REGISTER,
      CAPABILITIES.PATIENT_DIRECTORY_READ,
      CAPABILITIES.CLINICAL_READ,
      CAPABILITIES.CLINICAL_WRITE,
      CAPABILITIES.PRESCRIPTION_WRITE
    ]),
    recepcao: new Set([
      CAPABILITIES.SCHEDULE_READ,
      CAPABILITIES.SCHEDULE_WRITE,
      CAPABILITIES.PATIENT_REGISTER,
      CAPABILITIES.PATIENT_DIRECTORY_READ,
      CAPABILITIES.BILLING_READ,
      CAPABILITIES.BILLING_WRITE
    ])
  };

  const PAGE_ROLES = {
    dashboard: ['admin', 'medico', 'recepcao'],
    agenda: ['admin', 'medico', 'recepcao'],
    prontuario: ['medico'],
    pacientes: ['admin', 'medico', 'recepcao'],
    profissionais: ['admin'],
    convenios: ['admin', 'recepcao'],
    documentos: ['medico'],
    odontologia: ['medico'],
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

  function hasCapability(role, capability) {
    return Boolean(ROLE_CAPABILITIES[role]?.has(capability));
  }

  function canAccessPatientClinicalWorkspace(role) {
    return hasCapability(role, CAPABILITIES.CLINICAL_READ);
  }

  function canEditClinicalData(role) {
    return hasCapability(role, CAPABILITIES.CLINICAL_WRITE);
  }

  function canImportPatients(role) {
    return hasCapability(role, CAPABILITIES.IMPORT_PATIENTS);
  }

  function canViewAudit(role) {
    return hasCapability(role, CAPABILITIES.AUDIT_READ);
  }

  function canViewFinancialDashboard(role) {
    return hasCapability(role, CAPABILITIES.BILLING_READ);
  }

  function canManageClinicSettings(role) {
    return hasCapability(role, CAPABILITIES.CLINIC_MANAGE);
  }

  function canManageUsers(role) {
    return hasCapability(role, CAPABILITIES.USERS_MANAGE);
  }

  function canManageBackups(role) {
    return hasCapability(role, CAPABILITIES.BACKUP_MANAGE);
  }

  function canManagePayouts(role) {
    return hasCapability(role, CAPABILITIES.PAYOUTS_MANAGE);
  }

  const api = {
    DEFAULT_ROLES,
    ROLE_META,
    CAPABILITIES,
    ROLE_CAPABILITIES,
    PAGE_ROLES,
    parseAllowedRoles,
    canViewMenuItem,
    canNavigateToPage,
    getLandingPage,
    getRoleMeta,
    hasCapability,
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