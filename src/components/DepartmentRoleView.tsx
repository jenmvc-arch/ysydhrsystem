/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Briefcase, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Tags,
  AlertCircle,
  HelpCircle
} from 'lucide-react';

import { Employee } from '../types';
import { useFeedback } from '../context/FeedbackContext';

interface DepartmentRoleViewProps {
  onShowNotification: (title: string, message: string, type?: 'success' | 'info' | 'error') => void;
  activeEntityId: string;
  employees?: Employee[];
  onUpdateEmployee?: (id: string, updates: Partial<Employee>) => Promise<void>;
}

export const DEFAULT_DEPARTMENTS = [
  'Product & Engineering',
  'Finance',
  'Human Resources',
  'Sales & Marketing',
  'Strategy',
  'Operations'
];

export const DEFAULT_ROLES = [
  'Software Engineer',
  'Senior Software Engineer',
  'Product Manager',
  'UX Designer',
  'HR Specialist',
  'Finance Manager',
  'Consultant'
];

export default function DepartmentRoleView({ 
  onShowNotification,
  activeEntityId,
  employees,
  onUpdateEmployee
}: DepartmentRoleViewProps) {
  const { confirmAction } = useFeedback();
  const [departments, setDepartments] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);

  // Add state
  const [newDept, setNewDept] = useState('');
  const [newRole, setNewRole] = useState('');

  // Editing state
  const [editingDeptIndex, setEditingDeptIndex] = useState<number | null>(null);
  const [editingDeptValue, setEditingDeptValue] = useState('');

  const [editingRoleIndex, setEditingRoleIndex] = useState<number | null>(null);
  const [editingRoleValue, setEditingRoleValue] = useState('');

  // Load and sync from localStorage scoped by activeEntityId and fallback
  useEffect(() => {
    const savedScopedDepts = activeEntityId ? localStorage.getItem(`company_departments_${activeEntityId}`) : null;
    const savedGenDepts = localStorage.getItem('company_departments');
    if (savedScopedDepts) {
      try { setDepartments(JSON.parse(savedScopedDepts)); } catch(e) { setDepartments(DEFAULT_DEPARTMENTS); }
    } else if (savedGenDepts) {
      try { setDepartments(JSON.parse(savedGenDepts)); } catch(e) { setDepartments(DEFAULT_DEPARTMENTS); }
    } else {
      setDepartments(DEFAULT_DEPARTMENTS);
      localStorage.setItem('company_departments', JSON.stringify(DEFAULT_DEPARTMENTS));
      if (activeEntityId) localStorage.setItem(`company_departments_${activeEntityId}`, JSON.stringify(DEFAULT_DEPARTMENTS));
    }

    const savedScopedRoles = activeEntityId ? localStorage.getItem(`company_roles_${activeEntityId}`) : null;
    const savedGenRoles = localStorage.getItem('company_roles');
    if (savedScopedRoles) {
      try { setRoles(JSON.parse(savedScopedRoles)); } catch(e) { setRoles(DEFAULT_ROLES); }
    } else if (savedGenRoles) {
      try { setRoles(JSON.parse(savedGenRoles)); } catch(e) { setRoles(DEFAULT_ROLES); }
    } else {
      setRoles(DEFAULT_ROLES);
      localStorage.setItem('company_roles', JSON.stringify(DEFAULT_ROLES));
      if (activeEntityId) localStorage.setItem(`company_roles_${activeEntityId}`, JSON.stringify(DEFAULT_ROLES));
    }
  }, [activeEntityId]);

  const saveDepartments = (updated: string[]) => {
    setDepartments(updated);
    localStorage.setItem('company_departments', JSON.stringify(updated));
    if (activeEntityId) {
      localStorage.setItem(`company_departments_${activeEntityId}`, JSON.stringify(updated));
    }
  };

  const saveRoles = (updated: string[]) => {
    setRoles(updated);
    localStorage.setItem('company_roles', JSON.stringify(updated));
    if (activeEntityId) {
      localStorage.setItem(`company_roles_${activeEntityId}`, JSON.stringify(updated));
    }
  };

  // Add Department
  const handleAddDept = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDept = newDept.trim();
    if (!cleanDept) return;

    if (departments.some(d => d.toLowerCase() === cleanDept.toLowerCase())) {
      onShowNotification('Validation Warning', 'Department already exists.', 'error');
      return;
    }

    const updated = [...departments, cleanDept];
    saveDepartments(updated);
    setNewDept('');
    onShowNotification('Department Added', `"${cleanDept}" department registered.`, 'success');
  };

  // Add Role
  const handleAddRole = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRole = newRole.trim();
    if (!cleanRole) return;

    if (roles.some(r => r.toLowerCase() === cleanRole.toLowerCase())) {
      onShowNotification('Validation Warning', 'Role/Designation already exists.', 'error');
      return;
    }

    const updated = [...roles, cleanRole];
    saveRoles(updated);
    setNewRole('');
    onShowNotification('Role Registered', `"${cleanRole}" title registered.`, 'success');
  };

  // Delete Department
  const handleDeleteDept = async (index: number, name: string) => {
    await confirmAction({
      title: 'Delete Department',
      message: `Are you sure you want to remove the "${name}" department?`,
      tone: 'danger',
      confirmLabel: 'Delete Department',
      onConfirm: () => {
        const updated = departments.filter((_, i) => i !== index);
        saveDepartments(updated);
        onShowNotification('Department Deleted', `"${name}" removed.`, 'success');
      },
    });
  };

  // Delete Role
  const handleDeleteRole = async (index: number, name: string) => {
    await confirmAction({
      title: 'Delete Designation',
      message: `Are you sure you want to remove the "${name}" designation?`,
      tone: 'danger',
      confirmLabel: 'Delete Designation',
      onConfirm: () => {
        const updated = roles.filter((_, i) => i !== index);
        saveRoles(updated);
        onShowNotification('Role Deleted', `"${name}" removed.`, 'success');
      },
    });
  };

  // Start Edit Dept
  const startEditDept = (index: number, value: string) => {
    setEditingDeptIndex(index);
    setEditingDeptValue(value);
  };

  // Submit Edit Dept
  const submitEditDept = async (index: number) => {
    const cleanVal = editingDeptValue.trim();
    if (!cleanVal) return;

    if (departments.some((d, i) => i !== index && d.toLowerCase() === cleanVal.toLowerCase())) {
      onShowNotification('Validation Warning', 'Department already exists.', 'error');
      return;
    }

    const oldName = departments[index];
    // Propagate department name change to all affected employees and save to Supabase
    if (employees && onUpdateEmployee && oldName && oldName !== cleanVal) {
      const affected = employees.filter(e => e.department === oldName);
      try {
        await Promise.all(affected.map(e => onUpdateEmployee(e.id, { department: cleanVal })));
      } catch (error) {
        console.error('[Department Rename] Employee synchronization failed:', error);
        onShowNotification('Sync Failed', 'The department was not renamed because Employee Directory could not be updated.', 'error');
        return;
      }

      const updated = [...departments];
      updated[index] = cleanVal;
      saveDepartments(updated);
      setEditingDeptIndex(null);

      if (affected.length > 0) {
        onShowNotification('Employee Directory Updated', `Updated department to "${cleanVal}" for ${affected.length} employee(s).`, 'success');
      } else {
        onShowNotification('Department Renamed', `Changed to "${cleanVal}".`, 'success');
      }
    } else {
      const updated = [...departments];
      updated[index] = cleanVal;
      saveDepartments(updated);
      setEditingDeptIndex(null);
      onShowNotification('Department Renamed', `Changed to "${cleanVal}".`, 'success');
    }
  };

  // Start Edit Role
  const startEditRole = (index: number, value: string) => {
    setEditingRoleIndex(index);
    setEditingRoleValue(value);
  };

  // Submit Edit Role
  const submitEditRole = async (index: number) => {
    const cleanVal = editingRoleValue.trim();
    if (!cleanVal) return;

    if (roles.some((r, i) => i !== index && r.toLowerCase() === cleanVal.toLowerCase())) {
      onShowNotification('Validation Warning', 'Designation already exists.', 'error');
      return;
    }

    const oldName = roles[index];
    // Propagate role name change to all affected employees and save to Supabase
    if (employees && onUpdateEmployee && oldName && oldName !== cleanVal) {
      const affected = employees.filter(e => e.designation === oldName);
      try {
        await Promise.all(affected.map(e => onUpdateEmployee(e.id, { designation: cleanVal })));
      } catch (error) {
        console.error('[Role Rename] Employee synchronization failed:', error);
        onShowNotification('Sync Failed', 'The role was not renamed because Employee Directory could not be updated.', 'error');
        return;
      }

      const updated = [...roles];
      updated[index] = cleanVal;
      saveRoles(updated);
      setEditingRoleIndex(null);

      if (affected.length > 0) {
        onShowNotification('Employee Directory Updated', `Updated designation to "${cleanVal}" for ${affected.length} employee(s).`, 'success');
      } else {
        onShowNotification('Role Renamed', `Changed to "${cleanVal}".`, 'success');
      }
    } else {
      const updated = [...roles];
      updated[index] = cleanVal;
      saveRoles(updated);
      setEditingRoleIndex(null);
      onShowNotification('Role Renamed', `Changed to "${cleanVal}".`, 'success');
    }
  };

  return (
    <div className="space-y-6 text-left animate-in fade-in duration-200">
      
      {/* View Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 border border-neutral-border rounded-lg shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <Tags className="w-5 h-5 text-primary animate-pulse" /> Department & Role Directory
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Configure the legal corporate departments and staff roles active across your subsidiaries.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Department Panel */}
        <div className="bg-white border border-neutral-border rounded-lg shadow-2xs flex flex-col h-[500px]">
          <div className="p-4 border-b border-neutral-border bg-neutral-50 flex items-center gap-2 shrink-0">
            <Building2 className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-xs text-primary uppercase tracking-wider">Corporate Departments</h3>
          </div>

          {/* Add Department Input */}
          <form onSubmit={handleAddDept} className="p-4 border-b border-neutral-border/50 flex gap-2 bg-neutral-50/50 shrink-0">
            <input
              type="text"
              placeholder="e.g. Finance & Accounting"
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              className="flex-1 bg-white border border-neutral-border rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
              required
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-primary text-[#f7f0e0] font-bold rounded text-xs hover:bg-primary-dark transition-all flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </form>

          {/* List Box */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {departments.length === 0 ? (
              <div className="text-center text-xs text-on-surface-variant p-6">No departments defined.</div>
            ) : (
              departments.map((dept, index) => (
                <div 
                  key={index}
                  className="flex justify-between items-center bg-white p-2.5 rounded border border-neutral-border/70 hover:border-primary/45 transition-all text-xs"
                >
                  {editingDeptIndex === index ? (
                    <div className="flex-1 flex gap-2 mr-2">
                      <input
                        type="text"
                        value={editingDeptValue}
                        onChange={(e) => setEditingDeptValue(e.target.value)}
                        className="flex-1 bg-white border border-neutral-border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary outline-none"
                      />
                      <button 
                        onClick={() => submitEditDept(index)}
                        className="p-1 hover:bg-green-100 text-green-700 rounded transition-all cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setEditingDeptIndex(null)}
                        className="p-1 hover:bg-zinc-100 text-zinc-500 rounded transition-all cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-semibold text-on-surface">{dept}</span>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => startEditDept(index, dept)}
                          className="p-1.5 hover:bg-primary/10 text-primary rounded transition-all cursor-pointer"
                          title="Rename Department"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteDept(index, dept)}
                          className="p-1.5 hover:bg-error/10 text-error rounded transition-all cursor-pointer"
                          title="Remove Department"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Role Panel */}
        <div className="bg-white border border-neutral-border rounded-lg shadow-2xs flex flex-col h-[500px]">
          <div className="p-4 border-b border-neutral-border bg-neutral-50 flex items-center gap-2 shrink-0">
            <Briefcase className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-xs text-primary uppercase tracking-wider">Staff Designations / Roles</h3>
          </div>

          {/* Add Role Input */}
          <form onSubmit={handleAddRole} className="p-4 border-b border-neutral-border/50 flex gap-2 bg-neutral-50/50 shrink-0">
            <input
              type="text"
              placeholder="e.g. Lead Programmer"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="flex-1 bg-white border border-neutral-border rounded px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
              required
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-primary text-[#f7f0e0] font-bold rounded text-xs hover:bg-primary-dark transition-all flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </form>

          {/* List Box */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {roles.length === 0 ? (
              <div className="text-center text-xs text-on-surface-variant p-6">No designations defined.</div>
            ) : (
              roles.map((role, index) => (
                <div 
                  key={index}
                  className="flex justify-between items-center bg-white p-2.5 rounded border border-neutral-border/70 hover:border-primary/45 transition-all text-xs"
                >
                  {editingRoleIndex === index ? (
                    <div className="flex-1 flex gap-2 mr-2">
                      <input
                        type="text"
                        value={editingRoleValue}
                        onChange={(e) => setEditingRoleValue(e.target.value)}
                        className="flex-1 bg-white border border-neutral-border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary outline-none"
                      />
                      <button 
                        onClick={() => submitEditRole(index)}
                        className="p-1 hover:bg-green-100 text-green-700 rounded transition-all cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setEditingRoleIndex(null)}
                        className="p-1 hover:bg-zinc-100 text-zinc-500 rounded transition-all cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-semibold text-on-surface">{role}</span>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => startEditRole(index, role)}
                          className="p-1.5 hover:bg-primary/10 text-primary rounded transition-all cursor-pointer"
                          title="Rename Designation"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRole(index, role)}
                          className="p-1.5 hover:bg-error/10 text-error rounded transition-all cursor-pointer"
                          title="Remove Designation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
