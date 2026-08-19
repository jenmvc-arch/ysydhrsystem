import type {
  EmployeeWorkShiftAssignment,
  PublicHoliday,
  PublicHolidayCategory,
  PublicHolidayGroup,
  WorkShiftData,
  WorkShiftDayType,
  WorkShiftGroup,
  WorkShiftGroupDay,
} from '../types';
import { getGmt8DateString, getGmt8Timestamp } from './dateUtils';
import { isSupabaseConfigured, supabase, supabaseClient } from './supabaseClient';

export const DEFAULT_WORK_SHIFT_GROUP_NAME = 'Malaysia Standard';
export const PUBLIC_HOLIDAY_GROUP_DEFINITIONS: Array<{
  name: string;
  category: PublicHolidayCategory;
  stateCode?: string;
}> = [
  { name: 'Malaysia National', category: 'national' },
  { name: 'Johor State', category: 'state', stateCode: 'JHR' },
  { name: 'Kedah State', category: 'state', stateCode: 'KDH' },
  { name: 'Kelantan State', category: 'state', stateCode: 'KTN' },
  { name: 'Melaka State', category: 'state', stateCode: 'MLK' },
  { name: 'Negeri Sembilan State', category: 'state', stateCode: 'NSN' },
  { name: 'Pahang State', category: 'state', stateCode: 'PHG' },
  { name: 'Penang State', category: 'state', stateCode: 'PNG' },
  { name: 'Perak State', category: 'state', stateCode: 'PRK' },
  { name: 'Perlis State', category: 'state', stateCode: 'PLS' },
  { name: 'Sabah State', category: 'state', stateCode: 'SBH' },
  { name: 'Sarawak State', category: 'state', stateCode: 'SWK' },
  { name: 'Selangor State', category: 'state', stateCode: 'SGR' },
  { name: 'Terengganu State', category: 'state', stateCode: 'TRG' },
  { name: 'Kuala Lumpur Federal Territory', category: 'state', stateCode: 'KUL' },
  { name: 'Labuan Federal Territory', category: 'state', stateCode: 'LBN' },
  { name: 'Putrajaya Federal Territory', category: 'state', stateCode: 'PJY' },
];
export const WORK_SHIFT_WEEKDAYS = [
  { weekday: 1, label: 'Monday' },
  { weekday: 2, label: 'Tuesday' },
  { weekday: 3, label: 'Wednesday' },
  { weekday: 4, label: 'Thursday' },
  { weekday: 5, label: 'Friday' },
  { weekday: 6, label: 'Saturday' },
  { weekday: 7, label: 'Sunday' },
] as const;

const TABLES = {
  groups: 'work_shift_groups',
  days: 'work_shift_group_days',
  assignments: 'employee_work_shift_assignments',
  holidayGroups: 'public_holiday_groups',
  holidays: 'public_holidays',
} as const;

const emptyWorkShiftData = (): WorkShiftData => ({
  groups: [],
  days: [],
  assignments: [],
  holidayGroups: [],
  holidays: [],
});

const localKey = (entityId: string) => `work_shift_engine_${entityId || 'default'}`;
const unavailableTables = new Set<string>();

const makeId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const slug = (value: string) => (
  String(value || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
);

const toSnakeCase = (obj: any): any => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [
    key.replace(/([A-Z])/g, '_$1').toLowerCase(),
    value === undefined ? null : value,
  ]));
};

const toCamelCase = (obj: any): any => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
    value,
  ]));
};

const readLocal = (entityId: string): WorkShiftData | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(localKey(entityId));
    return raw ? normalizeWorkShiftData(JSON.parse(raw)) : null;
  } catch (_error) {
    return null;
  }
};

const writeLocal = (entityId: string, data: WorkShiftData) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(localKey(entityId), JSON.stringify(data));
  }
};

export const isMissingWorkShiftTableError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /schema cache|could not find the table|relation .* does not exist|pgrst205|42p01/i.test(message);
};

const toLocalDateString = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

export const calculateShiftHours = (
  startTime: string,
  endTime: string,
  dayType: WorkShiftDayType,
  isWorkDay = true
) => {
  if (!isWorkDay || dayType === 'rest') return 0;
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) return 0;
  const start = startHour * 60 + startMinute;
  const rawEnd = endHour * 60 + endMinute;
  if (rawEnd === start) return 0;
  let end = rawEnd;
  if (end < start) end += 24 * 60;
  const grossHours = (end - start) / 60;
  const netHours = dayType === 'full_day' ? grossHours - 1 : grossHours;
  return Number(Math.max(0, netHours).toFixed(2));
};

export const getDefaultHalfDayEndTime = (startTime: string) => {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  if ([startHour, startMinute].some(Number.isNaN)) return startTime;
  const totalMinutes = (startHour * 60) + startMinute + (4 * 60);
  const normalizedMinutes = totalMinutes % (24 * 60);
  return `${String(Math.floor(normalizedMinutes / 60)).padStart(2, '0')}:${String(normalizedMinutes % 60).padStart(2, '0')}`;
};

export const hasValidWorkingDay = (day: Pick<WorkShiftGroupDay, 'startTime' | 'endTime' | 'dayType' | 'isWorkDay'>) => (
  !day.isWorkDay ||
  day.dayType === 'rest' ||
  calculateShiftHours(day.startTime, day.endTime, day.dayType, day.isWorkDay) > 0
);

export const validateWorkShiftGroup = (groupId: string, data: WorkShiftData) => {
  const days = getGroupDays(groupId, data);
  const errors: string[] = [];
  if (!days.some((day) => day.isWorkDay && day.dayType !== 'rest')) {
    errors.push('A Work & Shift Group must contain at least one Work day.');
  }
  days.forEach((day) => {
    if (!hasValidWorkingDay(day)) {
      const label = WORK_SHIFT_WEEKDAYS.find((item) => item.weekday === day.weekday)?.label || `Day ${day.weekday}`;
      errors.push(`${label} has identical or invalid working times.`);
    }
  });
  return errors;
};

const makeDay = (
  entityId: string,
  groupId: string,
  weekday: number,
  startTime: string,
  endTime: string,
  dayType: WorkShiftDayType,
  isWorkDay: boolean,
  now: string
): WorkShiftGroupDay => ({
  id: makeId('shift-day'),
  entityId,
  groupId,
  weekday,
  startTime,
  endTime,
  dayType,
  isWorkDay,
  actualHours: calculateShiftHours(startTime, endTime, dayType, isWorkDay),
  createdAt: now,
  updatedAt: now,
});

export const buildDefaultWorkShiftData = (entityId: string): WorkShiftData => {
  const now = getGmt8Timestamp();
  const groupId = `shift-${entityId || 'default'}-malaysia-standard`;
  const group: WorkShiftGroup = {
    id: groupId,
    entityId,
    name: DEFAULT_WORK_SHIFT_GROUP_NAME,
    description: 'Monday to Friday standard office schedule.',
    enabled: true,
    weeklyHours: 40,
    weeklyHoursWarning: false,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  };
  const days = WORK_SHIFT_WEEKDAYS.map(({ weekday }) => {
    const day = weekday <= 5
      ? makeDay(entityId, groupId, weekday, '09:00', '18:00', 'full_day', true, now)
      : makeDay(entityId, groupId, weekday, '09:00', '18:00', 'rest', false, now);
    return { ...day, id: `${groupId}-day-${weekday}` };
  });
  const holidayGroups: PublicHolidayGroup[] = PUBLIC_HOLIDAY_GROUP_DEFINITIONS.map((definition) => ({
    id: `holiday-group-${entityId || 'default'}-${slug(definition.name)}`,
    entityId,
    name: definition.name,
    category: definition.category,
    stateCode: definition.stateCode,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }));
  return {
    groups: [group],
    days,
    assignments: [],
    holidayGroups,
    holidays: [],
  };
};

export const normalizeWorkShiftData = (value: unknown): WorkShiftData => {
  if (!value || typeof value !== 'object') return emptyWorkShiftData();
  const source = value as Partial<WorkShiftData>;
  return {
    groups: Array.isArray(source.groups) ? source.groups : [],
    days: Array.isArray(source.days) ? source.days : [],
    assignments: Array.isArray(source.assignments) ? source.assignments : [],
    holidayGroups: Array.isArray(source.holidayGroups) ? source.holidayGroups : [],
    holidays: Array.isArray(source.holidays) ? source.holidays : [],
  };
};

export const mergeWithDefaultWorkShiftData = (entityId: string, value: unknown): WorkShiftData => {
  const defaults = buildDefaultWorkShiftData(entityId);
  const incoming = normalizeWorkShiftData(value);
  const merge = <T extends { id: string }>(base: T[], additions: T[]) => {
    const map = new Map(base.map((item) => [item.id, item]));
    additions.forEach((item) => map.set(item.id, item));
    return [...map.values()];
  };
  return {
    groups: merge(defaults.groups, incoming.groups),
    days: merge(defaults.days, incoming.days),
    assignments: incoming.assignments,
    holidayGroups: merge(defaults.holidayGroups, incoming.holidayGroups),
    holidays: incoming.holidays,
  };
};

export const getGroupDays = (groupId: string, data: WorkShiftData) => (
  WORK_SHIFT_WEEKDAYS.map(({ weekday }) => (
    data.days.find((day) => day.groupId === groupId && day.weekday === weekday) ||
    makeDay('', groupId, weekday, '09:00', '18:00', 'rest', false, getGmt8Timestamp())
  ))
);

export const calculateWeeklyHours = (groupId: string, data: WorkShiftData) => (
  Number(getGroupDays(groupId, data).reduce((sum, day) => sum + day.actualHours, 0).toFixed(2))
);

export const getDefaultWorkShiftGroup = (data: WorkShiftData) => (
  data.groups.find((group) => group.isDefault) || data.groups.find((group) => group.enabled)
);

export const getActiveWorkShiftAssignment = (
  employeeId: string,
  data: WorkShiftData,
  asOfDate = getGmt8DateString()
) => data.assignments
  .filter((assignment) => (
    assignment.employeeId === employeeId &&
    assignment.active &&
    assignment.effectiveDate <= asOfDate &&
    (!assignment.endDate || assignment.endDate >= asOfDate)
  ))
  .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate))[0];

export const getActiveWorkShiftGroup = (
  employeeId: string,
  data: WorkShiftData,
  asOfDate = getGmt8DateString()
) => {
  const assignment = getActiveWorkShiftAssignment(employeeId, data, asOfDate);
  return data.groups.find((group) => group.id === assignment?.groupId && group.enabled)
    || getDefaultWorkShiftGroup(data);
};

export const getWorkShiftDayForDate = (
  employeeId: string,
  dateString: string,
  data: WorkShiftData
) => {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  const weekday = date.getDay() === 0 ? 7 : date.getDay();
  const group = getActiveWorkShiftGroup(employeeId, data, dateString);
  return group ? getGroupDays(group.id, data).find((day) => day.weekday === weekday) : undefined;
};

export const getHolidayDatesForGroups = (
  groupIds: string[],
  data: WorkShiftData,
  year?: number
) => {
  const enabledGroups = new Set(
    data.holidayGroups
      .filter((group) => group.enabled && groupIds.includes(group.id))
      .map((group) => group.id)
  );
  const dates = new Set<string>();
  data.holidays.forEach((holiday) => {
    if (!holiday.enabled || !enabledGroups.has(holiday.groupId)) return;
    if (year !== undefined && holiday.year !== year) return;
    dates.add(holiday.holidayDate);
    if (holiday.observedDate) dates.add(holiday.observedDate);
  });
  return dates;
};

export const calculateWorkingDaysForEmployee = (
  employeeId: string,
  startDate: string,
  endDate: string,
  data: WorkShiftData,
  holidayGroupIds: string[] = []
) => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  const holidayDates = getHolidayDatesForGroups(holidayGroupIds, data);
  let total = 0;
  const current = new Date(start);
  while (current <= end) {
    const dateString = toLocalDateString(current);
    const day = getWorkShiftDayForDate(employeeId, dateString, data);
    if (day?.isWorkDay && day.dayType !== 'rest' && !holidayDates.has(dateString)) total += 1;
    current.setDate(current.getDate() + 1);
  }
  return total;
};

export const calculateScheduledLeaveUnits = (
  employeeId: string,
  startDate: string,
  endDate: string,
  data: WorkShiftData,
  holidayGroupIds: string[] = [],
  basis: 'calendar_day' | 'working_day' | 'fixed_daily_rate' = 'calendar_day'
) => {
  if (basis === 'calendar_day' || basis === 'fixed_daily_rate') {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  }
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  const holidayDates = getHolidayDatesForGroups(holidayGroupIds, data);
  let total = 0;
  const current = new Date(start);
  while (current <= end) {
    const dateString = toLocalDateString(current);
    const day = getWorkShiftDayForDate(employeeId, dateString, data);
    if (day?.isWorkDay && day.dayType !== 'rest' && !holidayDates.has(dateString)) {
      total += day.dayType === 'half_day' ? 0.5 : 1;
    }
    current.setDate(current.getDate() + 1);
  }
  return Number(total.toFixed(2));
};

export const getAssignmentsForEmployee = (employeeId: string, data: WorkShiftData) => (
  data.assignments
    .filter((assignment) => assignment.employeeId === employeeId)
    .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate))
);

async function selectByEntity<T>(table: string, entityId: string): Promise<T[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from(table).select('*').eq('entity_id', entityId);
  if (error) throw error;
  return (data || []).map(toCamelCase) as T[];
}

export const workShiftService = {
  async load(entityId: string) {
    const fallback = mergeWithDefaultWorkShiftData(entityId, readLocal(entityId));
    if (!isSupabaseConfigured || !supabase) {
      writeLocal(entityId, fallback);
      return fallback;
    }
    try {
      const [groups, days, assignments, holidayGroups, holidays] = await Promise.all([
        selectByEntity<WorkShiftGroup>(TABLES.groups, entityId),
        selectByEntity<WorkShiftGroupDay>(TABLES.days, entityId),
        selectByEntity<EmployeeWorkShiftAssignment>(TABLES.assignments, entityId),
        selectByEntity<PublicHolidayGroup>(TABLES.holidayGroups, entityId),
        selectByEntity<PublicHoliday>(TABLES.holidays, entityId),
      ]);
      const loaded = mergeWithDefaultWorkShiftData(entityId, {
        groups,
        days,
        assignments,
        holidayGroups,
        holidays,
      });
      const defaults = buildDefaultWorkShiftData(entityId);
      const missingGroups = defaults.groups.filter((record) => !groups.some((item) => item.id === record.id));
      const missingDays = defaults.days.filter((record) => !days.some((item) => item.id === record.id));
      const missingHolidayGroups = defaults.holidayGroups.filter((record) => !holidayGroups.some((item) => item.id === record.id));
      await Promise.all([
        ...missingGroups.map((record) => supabaseClient.upsert(TABLES.groups, record)),
        ...missingDays.map((record) => supabaseClient.upsert(TABLES.days, record)),
        ...missingHolidayGroups.map((record) => supabaseClient.upsert(TABLES.holidayGroups, record)),
      ]);
      writeLocal(entityId, loaded);
      return loaded;
    } catch (error) {
      console.warn('[Work Shift Service] Falling back to local data:', error);
      writeLocal(entityId, fallback);
      return fallback;
    }
  },
  async saveState(entityId: string, data: WorkShiftData) {
    writeLocal(entityId, data);
  },
  async upsert(tableKey: keyof typeof TABLES, record: { id: string }) {
    const table = TABLES[tableKey];
    if (!isSupabaseConfigured || unavailableTables.has(table)) return record;
    try {
      return await supabaseClient.upsert(table, record);
    } catch (error) {
      if (!isMissingWorkShiftTableError(error)) throw error;
      unavailableTables.add(table);
      console.warn(`[Work Shift Service] ${table} is unavailable; using local persistence until the migration is applied.`);
      return record;
    }
  },
  async delete(tableKey: keyof typeof TABLES, id: string) {
    if (!isSupabaseConfigured) return;
    const table = TABLES[tableKey];
    if (unavailableTables.has(table)) return;
    try {
      await supabaseClient.delete(table, id);
    } catch (error) {
      if (!isMissingWorkShiftTableError(error)) throw error;
      unavailableTables.add(table);
      console.warn(`[Work Shift Service] ${table} is unavailable; skipping remote delete until the migration is applied.`);
    }
  },
};

export const makeWorkShiftId = makeId;
