import assert from 'node:assert/strict';
import {
  buildDefaultWorkShiftData,
  calculateScheduledLeaveUnits,
  calculateShiftHours,
  calculateWeeklyHours,
  getDefaultHalfDayEndTime,
  getActiveWorkShiftGroup,
  getWorkShiftDayForDate,
  isMissingWorkShiftTableError,
  mergeWithDefaultWorkShiftData,
  validateWorkShiftGroup,
} from './lib/workShiftEngine';

const data = buildDefaultWorkShiftData('entity-test');

assert.equal(calculateShiftHours('09:00', '18:00', 'full_day', true), 8);
assert.equal(calculateShiftHours('09:00', '13:00', 'half_day', true), 4);
assert.equal(calculateShiftHours('22:00', '06:00', 'full_day', true), 7);
assert.equal(calculateShiftHours('09:00', '09:00', 'full_day', true), 0);
assert.equal(calculateShiftHours('09:00', '18:00', 'rest', false), 0);
assert.equal(getDefaultHalfDayEndTime('22:30'), '02:30');
assert.equal(isMissingWorkShiftTableError(new Error("Could not find the table 'public.work_shift_groups' in the schema cache")), true);
assert.equal(isMissingWorkShiftTableError(new Error('permission denied for table employees')), false);
assert.equal(calculateWeeklyHours(data.groups[0].id, data), 40);
assert.deepEqual(validateWorkShiftGroup(data.groups[0].id, data), []);
assert.equal(getActiveWorkShiftGroup('employee-1', data)?.name, 'Malaysia Standard');
assert.equal(getWorkShiftDayForDate('employee-1', '2026-08-17', data)?.isWorkDay, true);
assert.equal(getWorkShiftDayForDate('employee-1', '2026-08-16', data)?.isWorkDay, false);

const holidayGroupId = data.holidayGroups[0].id;
const dataWithHoliday = {
  ...data,
  holidays: [{
    id: 'holiday-1',
    entityId: 'entity-test',
    groupId: holidayGroupId,
    name: 'Test Holiday',
    holidayDate: '2026-08-18',
    year: 2026,
    enabled: true,
  }],
};
assert.equal(
  calculateScheduledLeaveUnits('employee-1', '2026-08-17', '2026-08-21', dataWithHoliday, [holidayGroupId], 'working_day'),
  4
);
assert.equal(
  calculateScheduledLeaveUnits('employee-1', '2026-08-17', '2026-08-21', data, [], 'calendar_day'),
  5
);

const merged = mergeWithDefaultWorkShiftData('entity-test', { groups: [], days: [], assignments: [], holidayGroups: [], holidays: [] });
assert.equal(merged.groups.length, 1);
assert.equal(merged.days.length, 7);
assert.equal(merged.holidayGroups.length, 17);

console.log('Work shift engine tests passed.');
