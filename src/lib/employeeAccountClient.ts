import { Employee } from '../types';
import {
  AccountDeliveryChannel,
  AccountDeliveryResult,
  AccountActionResult,
  EmployeeAccountEvent,
  EmployeeAccountAction,
  EmployeeAccountStatus,
  EmployeeAccountSummary,
} from './employeeAccountTypes';

const PREVIEW_STORAGE_KEY = 'preview_employee_account_actions';
const PREVIEW_TOKEN_TTL_MINUTES = 60;

interface PreviewAccountRecord extends EmployeeAccountSummary {
  events: Array<{
    id: string;
    action: EmployeeAccountAction;
    channel?: AccountDeliveryChannel;
    createdAt: string;
    deliveries: AccountDeliveryResult[];
  }>;
}

const isPreviewMode = () => (
  typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('accountPreview') === '1'
);

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isAccountSchemaUnavailable = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /employee_accounts|employee_account_events|schema cache|could not find the table/i.test(message);
};

const buildDefaultSummary = (employee: Employee): EmployeeAccountSummary => ({
  employeeId: employee.id,
  employeeEmail: normalizeEmail(employee.email),
  username: normalizeEmail(employee.email),
  accountStatus: 'not_created',
  mustChangePassword: false,
});

const readPreviewRecords = (): Record<string, PreviewAccountRecord> => {
  if (typeof window === 'undefined') return {};
  try {
    const saved = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
    return saved ? JSON.parse(saved) as Record<string, PreviewAccountRecord> : {};
  } catch {
    return {};
  }
};

const writePreviewRecords = (records: Record<string, PreviewAccountRecord>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(records));
};

const getPreviewRecord = (employee: Employee): PreviewAccountRecord => {
  const records = readPreviewRecords();
  const email = normalizeEmail(employee.email);
  return records[email] || {
    employeeId: employee.id,
    employeeEmail: email,
    username: email,
    accountStatus: 'not_created',
    mustChangePassword: false,
    events: [],
  };
};

const createPreviewLink = (employee: Employee, action: 'invite' | 'recovery') => {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const path = action === 'invite' ? '/set-password' : '/reset-password';
  return `${baseUrl}${path}?token=preview-${token}&email=${encodeURIComponent(employee.email)}`;
};

const buildPreviewDelivery = (
  employee: Employee,
  channel: Exclude<AccountDeliveryChannel, 'both'>,
  action: 'invite' | 'recovery'
): AccountDeliveryResult => {
  const link = createPreviewLink(employee, action);
  const message = [
    `YSYD HRMS account for ${employee.name}`,
    `Username: ${employee.email}`,
    `Open this one-time ${action === 'invite' ? 'setup' : 'password reset'} link: ${link}`,
  ].join('\n');

  if (channel === 'email') {
    return {
      channel,
      provider: 'Local preview',
      status: 'handoff',
      recipient: employee.email,
      handoffUrl: `mailto:${encodeURIComponent(employee.email)}?subject=${encodeURIComponent('YSYD HRMS account access')}&body=${encodeURIComponent(message)}`,
    };
  }

  const phone = (employee.contactNumber || '').replace(/[^\d+]/g, '');
  return {
    channel,
    provider: 'Local preview',
    status: phone ? 'handoff' : 'skipped',
    recipient: phone || undefined,
    handoffUrl: phone
      ? `https://wa.me/${phone.replace(/^\+/, '')}?text=${encodeURIComponent(message)}`
      : undefined,
    error: phone ? undefined : 'Employee contact number is missing.',
  };
};

const previewAction = (
  employee: Employee,
  action: EmployeeAccountAction,
  channel: AccountDeliveryChannel = 'email'
): AccountActionResult => {
  const records = readPreviewRecords();
  const previous = getPreviewRecord(employee);
  const now = new Date().toISOString();
  const isReset = action === 'reset_password';
  const effectiveChannel = channel || 'email';
  const channels: Array<Exclude<AccountDeliveryChannel, 'both'>> =
    effectiveChannel === 'both' ? ['email', 'whatsapp'] : [effectiveChannel];
  const deliveries = channels.map((item) => buildPreviewDelivery(employee, item, isReset ? 'recovery' : 'invite'));
  const hasDelivery = deliveries.some((delivery) => delivery.status === 'handoff');
  const nextStatus: EmployeeAccountStatus = isReset
    ? 'must_change_password'
    : 'invited';
  const next: PreviewAccountRecord = {
    ...previous,
    employeeId: employee.id,
    employeeEmail: normalizeEmail(employee.email),
    username: normalizeEmail(employee.email),
    accountStatus: nextStatus,
    mustChangePassword: true,
    lastInvitedAt: action === 'provision' || action === 'share' ? now : previous.lastInvitedAt,
    lastPasswordResetAt: isReset ? now : previous.lastPasswordResetAt,
    lastDeliveryChannel: effectiveChannel,
    lastDeliveryStatus: hasDelivery ? 'handoff' : 'failed',
    events: [
      ...previous.events,
      {
        id: `preview-account-event-${Date.now()}`,
        action,
        channel: effectiveChannel,
        createdAt: now,
        deliveries,
      },
    ],
  };
  records[normalizeEmail(employee.email)] = next;
  writePreviewRecords(records);

  return {
    ok: hasDelivery,
    action,
    employeeId: employee.id,
    account: {
      employeeId: next.employeeId,
      employeeEmail: next.employeeEmail,
      username: next.username,
      accountStatus: next.accountStatus,
      mustChangePassword: next.mustChangePassword,
      lastInvitedAt: next.lastInvitedAt,
      lastPasswordResetAt: next.lastPasswordResetAt,
      lastDeliveryChannel: next.lastDeliveryChannel,
      lastDeliveryStatus: next.lastDeliveryStatus,
    },
    deliveries,
    message: hasDelivery
      ? 'Local preview handoff links were generated.'
      : 'No delivery handoff could be generated.',
  };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Account action failed with status ${response.status}.`);
  }
  return payload as T;
}

export const getEmployeeAccountSummaries = async (
  employees: Employee[]
): Promise<EmployeeAccountSummary[]> => {
  if (isPreviewMode()) {
    return employees.map((employee) => {
      const record = getPreviewRecord(employee);
      return {
        employeeId: record.employeeId,
        employeeEmail: record.employeeEmail,
        username: record.username,
        accountStatus: record.accountStatus,
        mustChangePassword: record.mustChangePassword,
        authUserId: record.authUserId,
        lastInvitedAt: record.lastInvitedAt,
        lastPasswordResetAt: record.lastPasswordResetAt,
        lastDeliveryChannel: record.lastDeliveryChannel,
        lastDeliveryStatus: record.lastDeliveryStatus,
      };
    });
  }

  const response = await request<{ accounts: EmployeeAccountSummary[] }>(
    `/api/admin/employee-accounts?employeeIds=${encodeURIComponent(employees.map((employee) => employee.id).join(','))}`
  ).catch((error) => {
    if (isAccountSchemaUnavailable(error)) {
      console.warn('[Employee Account Status] Account tables are not migrated yet. Showing default local statuses.');
      return { accounts: employees.map(buildDefaultSummary) };
    }
    throw error;
  });
  return response.accounts;
};

export const getEmployeeAccountEvents = async (
  employee: Employee
): Promise<EmployeeAccountEvent[]> => {
  if (isPreviewMode()) {
    return getPreviewRecord(employee).events.map((event) => ({
      id: event.id,
      employeeId: employee.id,
      employeeEmail: normalizeEmail(employee.email),
      actorUsername: 'hr.redpoint',
      action: event.action,
      channel: event.channel,
      provider: event.deliveries.map((delivery) => delivery.provider).join(', ') || undefined,
      result: event.deliveries.some((delivery) => delivery.status === 'handoff')
        ? 'handoff'
        : 'failed',
      createdAt: event.createdAt,
    }));
  }

  const response = await request<{ events: EmployeeAccountEvent[] }>(
    `/api/admin/employee-accounts/events?employeeId=${encodeURIComponent(employee.id)}`
  ).catch((error) => {
    if (isAccountSchemaUnavailable(error)) {
      console.warn('[Employee Account History] Account tables are not migrated yet. Showing empty delivery history.');
      return { events: [] };
    }
    throw error;
  });
  return response.events;
};

export const runEmployeeAccountAction = async (
  employee: Employee,
  action: EmployeeAccountAction,
  channel: AccountDeliveryChannel = 'email'
): Promise<AccountActionResult> => {
  if (isPreviewMode()) {
    return previewAction(employee, action, channel);
  }

  const path = action === 'provision'
    ? '/api/admin/employee-accounts/provision'
    : action === 'reset_password'
      ? '/api/admin/employee-accounts/reset-password'
      : '/api/admin/employee-accounts/share';

  return request<AccountActionResult>(path, {
    method: 'POST',
    body: JSON.stringify({
      employeeId: employee.id,
      employeeEmail: employee.email,
      employeeName: employee.name,
      contactNumber: employee.contactNumber || '',
      channel,
    }),
  });
};

export const isEmployeeAccountPreview = isPreviewMode;
