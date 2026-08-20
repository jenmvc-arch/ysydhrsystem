import { hasGlobalAdminPrivileges } from './userRoles';

export const PAYROLL_EXPORT_PERMISSION = 'payroll.export';
export const PAYROLL_SENSITIVE_EXPORT_PERMISSION = 'payroll.export_sensitive';

const SENSITIVE_ROLES = new Set([
  'administrator',
  'global administrator',
  'master user',
  'payroll tax approver'
]);

const normalizedRole = (role?: string | null) => String(role || '').trim().toLowerCase();

export const canExportPayroll = (role?: string | null) => Boolean(role);

export const canExportSensitivePayroll = (role?: string | null) => (
  hasGlobalAdminPrivileges(role) || SENSITIVE_ROLES.has(normalizedRole(role))
);
