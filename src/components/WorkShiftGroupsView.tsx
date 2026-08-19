import React, { useMemo, useState } from 'react';
import { CalendarClock, Check, ChevronRight, Clock3, Plus, Save, Trash2, Users, AlertTriangle } from 'lucide-react';
import type {
  Employee,
  EmployeeWorkShiftAssignment,
  WorkShiftData,
  WorkShiftGroup,
  WorkShiftGroupDay,
  WorkShiftDayType,
} from '../types';
import {
  DEFAULT_WORK_SHIFT_GROUP_NAME,
  WORK_SHIFT_WEEKDAYS,
  calculateShiftHours,
  calculateWeeklyHours,
  getDefaultHalfDayEndTime,
  getAssignmentsForEmployee,
  getGroupDays,
  makeWorkShiftId,
  validateWorkShiftGroup,
} from '../lib/workShiftEngine';
import { getGmt8DateString, getGmt8Timestamp } from '../lib/dateUtils';
import { useFeedback } from '../context/FeedbackContext';

interface WorkShiftGroupsViewProps {
  employees: Employee[];
  activeEntityId: string;
  data: WorkShiftData;
  onSave: (data: WorkShiftData) => Promise<void>;
}

const inputClass = 'w-full rounded-xl border border-neutral-border bg-white px-3 py-2 text-xs outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/30';
const labelClass = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant';
const panelClass = 'rounded-2xl border border-neutral-border bg-white p-5 shadow-sm';

const subtractOneDay = (date: string) => {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() - 1);
  return value.toISOString().slice(0, 10);
};

export default function WorkShiftGroupsView({
  employees,
  activeEntityId,
  data,
  onSave,
}: WorkShiftGroupsViewProps) {
  const { confirmAction, showError, showSuccess, showWarning } = useFeedback();
  const [selectedGroupId, setSelectedGroupId] = useState(data.groups[0]?.id || '');
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });
  const [assignmentMode, setAssignmentMode] = useState<'single' | 'bulk'>('single');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(employees[0]?.id ? [employees[0].id] : []);
  const [assignmentGroupId, setAssignmentGroupId] = useState(data.groups[0]?.id || '');
  const [effectiveDate, setEffectiveDate] = useState(getGmt8DateString());
  const [endDate, setEndDate] = useState('');

  const selectedGroup = data.groups.find((group) => group.id === selectedGroupId) || data.groups[0];
  const selectedDays = selectedGroup ? getGroupDays(selectedGroup.id, data) : [];
  const weeklyHours = selectedGroup ? calculateWeeklyHours(selectedGroup.id, data) : 0;
  const currentAssignments = useMemo(
    () => data.assignments.filter((assignment) => assignment.active),
    [data.assignments]
  );

  const replaceData = async (next: WorkShiftData, successMessage: string) => {
    try {
      await onSave(next);
      showSuccess('Work & Shift Groups Saved', successMessage);
    } catch (error: any) {
      showError('Work & Shift Groups Save Failed', error.message || 'The schedule could not be saved.');
    }
  };

  const updateSelectedGroup = (patch: Partial<WorkShiftGroup>) => {
    if (!selectedGroup) return;
    if (patch.name !== undefined && !patch.name.trim()) {
      showWarning('Group Name Required', 'A Work & Shift Group must have a name.');
      return;
    }
    const nextGroups = data.groups.map((group) => group.id === selectedGroup.id
      ? { ...group, ...patch, updatedAt: getGmt8Timestamp() }
      : group);
    void replaceData({ ...data, groups: nextGroups }, 'Group details updated.');
  };

  const updateDay = (weekday: number, patch: Partial<WorkShiftGroupDay>) => {
    if (!selectedGroup) return;
    const existing = data.days.find((day) => day.groupId === selectedGroup.id && day.weekday === weekday);
    if (!existing) return;
    const nextStartTime = patch.startTime ?? existing.startTime;
    const nextEndTime = patch.endTime ?? (
      existing.dayType === 'half_day' && patch.startTime
        ? getDefaultHalfDayEndTime(patch.startTime)
        : existing.endTime
    );
    const nextDay = {
      ...existing,
      ...patch,
      startTime: nextStartTime,
      endTime: nextEndTime,
      actualHours: calculateShiftHours(
        nextStartTime,
        nextEndTime,
        patch.dayType ?? existing.dayType,
        patch.isWorkDay ?? existing.isWorkDay
      ),
      updatedAt: getGmt8Timestamp(),
    };
    const next = data.days.map((day) => day.id === existing.id ? nextDay : day);
    const nextData = { ...data, days: next };
    const validationErrors = validateWorkShiftGroup(selectedGroup.id, nextData);
    if (validationErrors.length > 0) {
      showWarning('Invalid Schedule', validationErrors[0]);
      return;
    }
    const hours = calculateWeeklyHours(selectedGroup.id, nextData);
    const nextGroups = data.groups.map((group) => group.id === selectedGroup.id
      ? { ...group, weeklyHours: hours, weeklyHoursWarning: hours > 45, updatedAt: getGmt8Timestamp() }
      : group);
    void replaceData({ ...nextData, groups: nextGroups }, 'Seven-day schedule updated.');
  };

  const handleDayTypeChange = (day: WorkShiftGroupDay, dayType: WorkShiftDayType) => {
    if (dayType === 'half_day') {
      updateDay(day.weekday, {
        dayType,
        isWorkDay: true,
        endTime: getDefaultHalfDayEndTime(day.startTime),
      });
      return;
    }
    updateDay(day.weekday, { dayType, isWorkDay: dayType !== 'rest' });
  };

  const handleAddGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newGroup.name.trim();
    if (!name) {
      showWarning('Group Name Required', 'Enter a name before adding a Work & Shift Group.');
      return;
    }
    if (data.groups.some((group) => group.name.trim().toLowerCase() === name.toLowerCase())) {
      showWarning('Duplicate Group Name', 'A Work & Shift Group with this name already exists.');
      return;
    }
    const now = getGmt8Timestamp();
    const group: WorkShiftGroup = {
      id: makeWorkShiftId('shift-group'),
      entityId: activeEntityId,
      name,
      description: newGroup.description.trim(),
      enabled: true,
      weeklyHours: 0,
      weeklyHoursWarning: false,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    const days = WORK_SHIFT_WEEKDAYS.map(({ weekday }) => ({
      id: makeWorkShiftId('shift-day'),
      entityId: activeEntityId,
      groupId: group.id,
      weekday,
      startTime: weekday <= 5 ? '09:00' : '09:00',
      endTime: weekday <= 5 ? '18:00' : '18:00',
      dayType: weekday <= 5 ? 'full_day' as const : 'rest' as const,
      isWorkDay: weekday <= 5,
      actualHours: weekday <= 5 ? 8 : 0,
      createdAt: now,
      updatedAt: now,
    }));
    group.weeklyHours = days.reduce((sum, day) => sum + day.actualHours, 0);
    await replaceData({ ...data, groups: [group, ...data.groups], days: [...days, ...data.days] }, `${name} was added.`);
    setSelectedGroupId(group.id);
    setNewGroup({ name: '', description: '' });
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup || selectedGroup.isDefault || selectedGroup.name === DEFAULT_WORK_SHIFT_GROUP_NAME) {
      showWarning('Default Group Protected', 'The Malaysia Standard group cannot be deleted.');
      return;
    }
    const confirmed = await confirmAction({
      title: 'Delete Work & Shift Group',
      message: `Delete ${selectedGroup.name}? Existing historical assignments will remain in the audit history.`,
      tone: 'danger',
      confirmLabel: 'Delete Group',
    });
    if (!confirmed) return;
    const next = {
      ...data,
      groups: data.groups.filter((group) => group.id !== selectedGroup.id),
      days: data.days.filter((day) => day.groupId !== selectedGroup.id),
      assignments: data.assignments.map((assignment) => assignment.groupId === selectedGroup.id
        ? { ...assignment, active: false, endDate: assignment.endDate || getGmt8DateString() }
        : assignment),
    };
    await replaceData(next, `${selectedGroup.name} was deleted.`);
    setSelectedGroupId(next.groups[0]?.id || '');
  };

  const handleAssign = async (event: React.FormEvent) => {
    event.preventDefault();
    const employeeIds = assignmentMode === 'single' ? selectedEmployeeIds.slice(0, 1) : selectedEmployeeIds;
    if (employeeIds.length === 0 || !assignmentGroupId || !effectiveDate) {
      showWarning('Assignment Incomplete', 'Select at least one employee, a group, and an effective date.');
      return;
    }
    if (endDate && endDate < effectiveDate) {
      showWarning('Invalid Assignment Dates', 'End date cannot be earlier than the effective date.');
      return;
    }
    const newEndDate = endDate || '9999-12-31';
    const conflicts = employeeIds.flatMap((employeeId) => (
      data.assignments.filter((assignment) => (
        assignment.employeeId === employeeId &&
        assignment.active &&
        assignment.effectiveDate <= newEndDate &&
        (!assignment.endDate || assignment.endDate >= effectiveDate)
      ))
    ));
    if (conflicts.length > 0) {
      const confirmed = await confirmAction({
        title: assignmentMode === 'bulk' ? 'Replace Bulk Schedules' : 'Replace Active Schedule',
        message: `${conflicts.length} active schedule assignment(s) will be ended before the new assignment starts. Continue?`,
        tone: 'warning',
        confirmLabel: 'Replace Schedule',
      });
      if (!confirmed) return;
    }
    const now = getGmt8Timestamp();
    const nextAssignments = data.assignments.map((assignment) => {
      const overlaps = employeeIds.includes(assignment.employeeId) &&
        assignment.active &&
        assignment.effectiveDate <= newEndDate &&
        (!assignment.endDate || assignment.endDate >= effectiveDate);
      if (!overlaps) return assignment;
      const endedBeforeNewAssignment = assignment.effectiveDate < effectiveDate;
      return {
        ...assignment,
        active: false,
        endDate: endedBeforeNewAssignment
          ? subtractOneDay(effectiveDate)
          : assignment.endDate,
        updatedAt: now,
      };
    });
    const additions: EmployeeWorkShiftAssignment[] = employeeIds.map((employeeId) => ({
      id: makeWorkShiftId('shift-assignment'),
      entityId: activeEntityId,
      employeeId,
      groupId: assignmentGroupId,
      effectiveDate,
      endDate: endDate || undefined,
      active: true,
      assignedAt: now,
      createdAt: now,
      updatedAt: now,
    }));
    await replaceData({ ...data, assignments: [...additions, ...nextAssignments] }, `${employeeIds.length} employee assignment(s) saved.`);
  };

  const toggleEmployee = (employeeId: string) => {
    setSelectedEmployeeIds((current) => current.includes(employeeId)
      ? current.filter((id) => id !== employeeId)
      : [...current, employeeId]);
  };

  const handleSaveSelectedGroup = async () => {
    if (!selectedGroup) return;
    const validationErrors = validateWorkShiftGroup(selectedGroup.id, data);
    if (validationErrors.length > 0) {
      showWarning('Invalid Schedule', validationErrors[0]);
      return;
    }
    await replaceData(data, `${selectedGroup.name} was saved.`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-left animate-in fade-in duration-200">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary">Core Operations</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-on-background">Work & Shift Groups</h1>
          <p className="mt-1 max-w-3xl text-sm text-on-surface-variant">Configure working days, shifts, rest days, weekly hours, and employee assignments.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-neutral-border bg-white px-3 py-2 text-xs font-bold">
          <CalendarClock className="h-4 w-4 text-primary" />
          {data.groups.filter((group) => group.enabled).length} active group(s)
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric label="Active Groups" value={data.groups.filter((group) => group.enabled).length} icon={<CalendarClock className="h-4 w-4" />} />
        <Metric label="Assigned Employees" value={new Set(currentAssignments.map((assignment) => assignment.employeeId)).size} icon={<Users className="h-4 w-4" />} />
        <Metric label="Over 45 Hours" value={data.groups.filter((group) => group.weeklyHoursWarning).length} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <section className={panelClass}>
        <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
          <Plus className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold">Create Work & Shift Group</h2>
        </div>
        <form onSubmit={handleAddGroup} className="mt-4 grid gap-3 md:grid-cols-[1fr_1.5fr_auto] md:items-end">
          <label><span className={labelClass}>Group Name</span><input value={newGroup.name} onChange={(event) => setNewGroup({ ...newGroup, name: event.target.value })} className={inputClass} placeholder="e.g. Retail Shift A" /></label>
          <label><span className={labelClass}>Description</span><input value={newGroup.description} onChange={(event) => setNewGroup({ ...newGroup, description: event.target.value })} className={inputClass} placeholder="Schedule purpose or team" /></label>
          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white"><Plus className="h-4 w-4" /> Add Group</button>
        </form>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className={panelClass}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">Group List</h2>
            <span className="text-[10px] font-bold text-on-surface-variant">{data.groups.length}</span>
          </div>
          <div className="space-y-2">
            {data.groups.map((group) => (
              <button key={group.id} type="button" onClick={() => setSelectedGroupId(group.id)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${selectedGroup?.id === group.id ? 'border-primary bg-primary/5' : 'border-neutral-border hover:border-primary/40'}`}>
                <span className="min-w-0"><span className="block truncate text-xs font-bold">{group.name}</span><span className="mt-1 block text-[10px] text-on-surface-variant">{group.weeklyHours} hours/week · {group.enabled ? 'Enabled' : 'Disabled'}</span></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-on-surface-variant" />
              </button>
            ))}
          </div>
        </div>

        <div className={panelClass}>
          {selectedGroup ? (
            <>
              <div className="flex flex-col gap-4 border-b border-neutral-100 pb-4 md:flex-row md:items-end md:justify-between">
                <div className="grid flex-1 gap-3 md:grid-cols-2">
                  <label><span className={labelClass}>Group Name</span><input value={selectedGroup.name} disabled={selectedGroup.isDefault} onChange={(event) => void updateSelectedGroup({ name: event.target.value })} className={inputClass} /></label>
                  <label><span className={labelClass}>Description</span><input value={selectedGroup.description || ''} onChange={(event) => void updateSelectedGroup({ description: event.target.value })} className={inputClass} /></label>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 rounded-xl border border-neutral-border px-3 py-2 text-xs font-bold"><input type="checkbox" checked={selectedGroup.enabled} onChange={(event) => void updateSelectedGroup({ enabled: event.target.checked })} /> Enabled</label>
                  <button type="button" onClick={() => void handleSaveSelectedGroup()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white"><Save className="h-4 w-4" /> Save Group</button>
                  {!selectedGroup.isDefault && <button type="button" onClick={() => void handleDeleteGroup()} className="rounded-xl border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Delete group"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded-xl bg-primary/10 px-3 py-2 font-bold text-primary">Weekly total: {weeklyHours} hours</span>
                {weeklyHours > 45 && <span className="flex items-center gap-1 rounded-xl bg-amber-50 px-3 py-2 font-bold text-amber-700"><AlertTriangle className="h-4 w-4" /> Above 45 hours warning</span>}
              </div>
              <div className="mt-5 overflow-x-auto rounded-xl border border-neutral-border">
                <table className="w-full min-w-[920px] text-left text-xs">
                  <thead className="bg-neutral-50 text-[10px] uppercase tracking-[0.18em] text-on-surface-variant"><tr><th className="p-3">Working Day</th><th className="p-3">Start</th><th className="p-3">End</th><th className="p-3">Day Setting</th><th className="p-3">Work</th><th className="p-3">Rest</th><th className="p-3">Actual Hours</th></tr></thead>
                  <tbody className="divide-y divide-neutral-border">
                    {selectedDays.map((day) => (
                      <tr key={day.id}>
                        <td className="p-3 font-bold">{WORK_SHIFT_WEEKDAYS.find((item) => item.weekday === day.weekday)?.label}</td>
                        <td className="p-3"><input type="time" value={day.startTime} onChange={(event) => updateDay(day.weekday, { startTime: event.target.value })} className={`${inputClass} w-32`} /></td>
                        <td className="p-3"><input type="time" value={day.endTime} onChange={(event) => updateDay(day.weekday, { endTime: event.target.value })} className={`${inputClass} w-32`} /></td>
                        <td className="p-3"><select value={day.dayType} onChange={(event) => handleDayTypeChange(day, event.target.value as WorkShiftDayType)} className={`${inputClass} w-36`}><option value="full_day">Full Day</option><option value="half_day">Half-day</option><option value="rest">Rest</option></select></td>
                        <td className="p-3 text-center"><input aria-label={`${day.weekday} work day`} type="checkbox" checked={day.isWorkDay} onChange={(event) => updateDay(day.weekday, { isWorkDay: event.target.checked, dayType: event.target.checked ? (day.dayType === 'rest' ? 'full_day' : day.dayType) : 'rest' })} /></td>
                        <td className="p-3 text-center"><input aria-label={`${day.weekday} rest day`} type="checkbox" checked={!day.isWorkDay || day.dayType === 'rest'} onChange={(event) => updateDay(day.weekday, { isWorkDay: !event.target.checked, dayType: event.target.checked ? 'rest' : 'full_day' })} /></td>
                        <td className="p-3 font-mono font-bold">{day.dayType === 'half_day' ? 'Half-day' : day.actualHours.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-on-surface-variant"><Clock3 className="h-4 w-4 text-primary" /> Full Day subtracts a one-hour break. Overnight shifts are supported.</div>
            </>
          ) : <p className="text-sm text-on-surface-variant">Create a group to begin.</p>}
        </div>
      </section>

      <section className={panelClass}>
        <div className="flex flex-col gap-3 border-b border-neutral-100 pb-4 md:flex-row md:items-end md:justify-between">
          <div><h2 className="text-base font-bold">Assign Work & Shift Group</h2><p className="mt-1 text-xs text-on-surface-variant">Each employee has one effective active schedule. Future-dated assignments are allowed.</p></div>
          <div className="flex rounded-xl border border-neutral-border p-1"><button type="button" onClick={() => setAssignmentMode('single')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${assignmentMode === 'single' ? 'bg-primary text-white' : 'text-on-surface-variant'}`}>Single</button><button type="button" onClick={() => setAssignmentMode('bulk')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${assignmentMode === 'bulk' ? 'bg-primary text-white' : 'text-on-surface-variant'}`}>Bulk</button></div>
        </div>
        <form onSubmit={handleAssign} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_auto] xl:items-end">
          <label><span className={labelClass}>Employee{assignmentMode === 'bulk' ? 's' : ''}</span>{assignmentMode === 'single' ? <select value={selectedEmployeeIds[0] || ''} onChange={(event) => setSelectedEmployeeIds([event.target.value])} className={inputClass}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.department}</option>)}</select> : <div className="max-h-32 overflow-y-auto rounded-xl border border-neutral-border p-2">{employees.map((employee) => <label key={employee.id} className="flex items-center gap-2 px-2 py-1.5 text-xs"><input type="checkbox" checked={selectedEmployeeIds.includes(employee.id)} onChange={() => toggleEmployee(employee.id)} />{employee.name}</label>)}</div>}</label>
          <label><span className={labelClass}>Work & Shift Group</span><select value={assignmentGroupId} onChange={(event) => setAssignmentGroupId(event.target.value)} className={inputClass}>{data.groups.filter((group) => group.enabled).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          <label><span className={labelClass}>Effective Date</span><input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className={inputClass} /></label>
          <label><span className={labelClass}>End Date Optional</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className={inputClass} /></label>
          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white"><Save className="h-4 w-4" /> Assign Group</button>
        </form>
        <div className="mt-5 overflow-x-auto rounded-xl border border-neutral-border">
          <table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-neutral-50 text-[10px] uppercase tracking-[0.18em] text-on-surface-variant"><tr><th className="p-3">Employee</th><th className="p-3">Department</th><th className="p-3">Designation</th><th className="p-3">Group</th><th className="p-3">Effective</th><th className="p-3">End</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-neutral-border">{data.assignments.map((assignment) => { const employee = employees.find((item) => item.id === assignment.employeeId); const group = data.groups.find((item) => item.id === assignment.groupId); return <tr key={assignment.id}><td className="p-3 font-bold">{employee?.name || assignment.employeeId}</td><td className="p-3">{employee?.department || 'N/A'}</td><td className="p-3">{employee?.designation || 'N/A'}</td><td className="p-3 font-bold text-primary">{group?.name || assignment.groupId}</td><td className="p-3 font-mono">{assignment.effectiveDate}</td><td className="p-3 font-mono">{assignment.endDate || 'Open ended'}</td><td className="p-3">{assignment.active ? 'Current / Future' : 'History'}</td></tr>; })}</tbody></table>
        </div>
      </section>

      <section className={panelClass}>
        <h2 className="text-base font-bold">Assignment History</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{employees.map((employee) => { const assignments = getAssignmentsForEmployee(employee.id, data); return <div key={employee.id} className="rounded-xl border border-neutral-border p-3"><p className="text-xs font-bold">{employee.name}</p><p className="mt-1 text-[10px] text-on-surface-variant">{assignments.length} schedule record(s)</p><div className="mt-2 space-y-1">{assignments.slice(0, 3).map((assignment) => <p key={assignment.id} className="text-[10px] text-on-surface-variant">{data.groups.find((group) => group.id === assignment.groupId)?.name || 'Group'} · {assignment.effectiveDate} · {assignment.active ? 'Active' : 'History'}</p>)}</div></div>; })}</div>
      </section>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className={panelClass}><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">{label}</p><span className="text-primary">{icon}</span></div><p className="mt-3 text-2xl font-bold">{value}</p></div>;
}
