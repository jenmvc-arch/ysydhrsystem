import assert from 'node:assert/strict';
import {
  canManageAppAccess,
  hasGlobalAdminPrivileges,
  isAdminPortalRole,
  isEmployeeSignerRole,
  isEmployeePortalRole,
  isRoleAllowedForLoginPortal,
} from './lib/userRoles';

assert.equal(isAdminPortalRole('Master User'), true);
assert.equal(hasGlobalAdminPrivileges('Master User'), true);
assert.equal(isEmployeePortalRole('Master User'), false);
assert.equal(isAdminPortalRole('Global Administrator'), true);
assert.equal(isEmployeePortalRole('Employee'), true);
assert.equal(isEmployeePortalRole('Candidate'), false);
assert.equal(isEmployeeSignerRole('Candidate'), true);
assert.equal(isRoleAllowedForLoginPortal('Master User', 'admin'), true);
assert.equal(isRoleAllowedForLoginPortal('Employee', 'admin'), false);
assert.equal(isRoleAllowedForLoginPortal('Employee', 'employee'), true);
assert.equal(isRoleAllowedForLoginPortal('Candidate', 'employee'), true);
assert.equal(canManageAppAccess('hr.redpoint'), true);
assert.equal(canManageAppAccess('HR.REDPOINT'), true);
assert.equal(canManageAppAccess('jennylaw.hr'), false);
assert.equal(canManageAppAccess('s.jenkins@acme-global.com'), false);

console.log('User role tests passed.');
