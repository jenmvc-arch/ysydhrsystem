import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Home,
  LifeBuoy,
  LockKeyhole,
  RotateCcw,
  Save,
  TrendingUp,
  User,
  UserRound,
  Wallet,
} from 'lucide-react';
import { Employee } from '../types';
import {
  canManageAppAccess,
  isEmployeePortalRole,
} from '../lib/userRoles';

type PortalAccessKey =
  | 'home'
  | 'profile'
  | 'payslips'
  | 'leave'
  | 'growth'
  | 'documents'
  | 'support';

type PortalAccessMap = Record<string, Partial<Record<PortalAccessKey, boolean>>>;

interface AppAccessSettingsPreviewProps {
  employees: Employee[];
  currentUserEmail?: string | null;
  onShowNotification: (title: string, message: string) => void;
}

interface PreviewAccount {
  email: string;
  name: string;
  role: string;
  accountType: 'Admin User' | 'Employee';
}

const STORAGE_KEY = 'preview_employee_portal_access_settings';

const ACCESS_ITEMS: Array<{
  id: PortalAccessKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'home', label: 'Home', description: 'Personal overview and announcements.', icon: Home },
  { id: 'profile', label: 'My Profile', description: 'Contact and employment details.', icon: User },
  { id: 'payslips', label: 'Payslips', description: 'Payslip history and downloads.', icon: Wallet },
  { id: 'leave', label: 'Leave', description: 'Balances and leave requests.', icon: CalendarDays },
  { id: 'growth', label: 'Growth', description: 'Performance and career history.', icon: TrendingUp },
  { id: 'documents', label: 'Documents', description: 'Handbook and employee documents.', icon: FileText },
  { id: 'support', label: 'Support', description: 'HR support requests and follow-up.', icon: LifeBuoy },
];

const DEFAULT_ACCESS: Record<PortalAccessKey, boolean> = {
  home: true,
  profile: true,
  payslips: true,
  leave: true,
  growth: true,
  documents: true,
  support: true,
};

const readAccessMap = (): PortalAccessMap => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) as PortalAccessMap : {};
  } catch (_error) {
    return {};
  }
};

const buildPreviewAccounts = (employees: Employee[]): PreviewAccount[] => {
  const accounts = new Map<string, PreviewAccount>();

  employees.forEach((employee) => {
    const email = employee.email.trim().toLowerCase();
    accounts.set(email, {
      email,
      name: employee.name,
      role: 'Employee',
      accountType: 'Employee',
    });
  });

  return Array.from(accounts.values()).sort((left, right) => {
    if (left.accountType !== right.accountType) {
      return left.accountType === 'Admin User' ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
};

export default function AppAccessSettingsPreview({
  employees,
  currentUserEmail,
  onShowNotification,
}: AppAccessSettingsPreviewProps) {
  const accounts = useMemo(() => buildPreviewAccounts(employees), [employees]);
  const [selectedEmail, setSelectedEmail] = useState(
    String(currentUserEmail || accounts[0]?.email || '').toLowerCase()
  );
  const [accessMap, setAccessMap] = useState<PortalAccessMap>(() => readAccessMap());

  const selectedAccount = accounts.find((account) => account.email === selectedEmail) || accounts[0] || null;
  const canEditAccess = canManageAppAccess(currentUserEmail);
  const selectedAccess = {
    ...DEFAULT_ACCESS,
    ...(selectedAccount ? accessMap[selectedAccount.email] : {}),
  };
  const isEmployeeAccount = !!selectedAccount && (
    selectedAccount.accountType === 'Employee' || isEmployeePortalRole(selectedAccount.role)
  );

  const handleToggle = (key: PortalAccessKey) => {
    if (!selectedAccount || !isEmployeeAccount || !canEditAccess) return;
    setAccessMap((previous) => ({
      ...previous,
      [selectedAccount.email]: {
        ...DEFAULT_ACCESS,
        ...(previous[selectedAccount.email] || {}),
        [key]: !selectedAccess[key],
      },
    }));
  };

  const handleSave = () => {
    if (!selectedAccount || !isEmployeeAccount || !canEditAccess) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accessMap));
    onShowNotification(
      'Access Preview Saved',
      `Portal access settings for ${selectedAccount.name} were saved locally for preview.`
    );
  };

  const handleReset = () => {
    if (!selectedAccount || !isEmployeeAccount || !canEditAccess) return;
    setAccessMap((previous) => {
      const next = { ...previous };
      delete next[selectedAccount.email];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    onShowNotification(
      'Access Preview Reset',
      `${selectedAccount.name} now has the default employee portal access.`
    );
  };

  return (
    <section
      id="app-access-settings"
      className="max-w-6xl mx-auto bg-white border border-neutral-border rounded-lg p-6 shadow-sm space-y-5"
    >
      <div className="flex flex-col gap-3 border-b border-neutral-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-primary uppercase tracking-wider">App Access Settings</h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
              <LockKeyhole className="h-3 w-3" />
              Preview only
            </span>
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">
            Preview per-user portal access before connecting this console to the employee Supabase project.
          </p>
        </div>
        <span className={`inline-flex h-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
          canEditAccess
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-neutral-100 text-on-surface-variant'
        }`}>
          <LockKeyhole className="h-3 w-3" />
          {canEditAccess ? 'Master User editing enabled' : 'Read-only for this account'}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-neutral-border bg-[#fffaf4] p-3">
          <div className="flex items-center justify-between px-2 pb-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">Accounts</p>
              <p className="mt-1 text-xs text-on-surface-variant">Select a user to preview access.</p>
            </div>
            <UserRound className="h-4 w-4 text-primary" />
          </div>

          <div className="space-y-1.5">
            {accounts.map((account) => {
              const isSelected = selectedAccount?.email === account.email;
              return (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => setSelectedEmail(account.email)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    isSelected
                      ? 'border-primary/30 bg-white shadow-sm'
                      : 'border-transparent hover:border-neutral-border hover:bg-white/70'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      account.accountType === 'Admin User'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {account.accountType === 'Admin User'
                        ? <LockKeyhole className="h-3.5 w-3.5" />
                        : <UserRound className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-on-surface">{account.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-on-surface-variant">{account.email}</span>
                      <span className="mt-1 inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
                        {account.role}
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {selectedAccount ? (
          <div className="space-y-5">
            <div className="flex flex-col gap-4 rounded-xl border border-neutral-border bg-[#fffdfb] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {selectedAccount.accountType === 'Admin User'
                    ? <LockKeyhole className="h-5 w-5" />
                    : <UserRound className="h-5 w-5" />}
                </div>
                <div>
                  <p className="text-base font-bold text-on-surface">{selectedAccount.name}</p>
                  <p className="text-xs text-on-surface-variant">{selectedAccount.email}</p>
                </div>
              </div>
              <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
                selectedAccount.accountType === 'Admin User'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-emerald-50 text-emerald-700'
              }`}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {selectedAccount.accountType === 'Admin User' ? 'Admin portal enabled' : 'Employee portal enabled'}
              </span>
            </div>

            {selectedAccount.accountType === 'Admin User' ? (
              <div className="rounded-xl border border-primary/15 bg-primary/[0.03] p-5">
                <h3 className="text-sm font-bold text-primary">Admin User access</h3>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-on-surface-variant">
                  {selectedAccount.name} is treated as an admin account by role. Admin users open the HRMS console and retain access to admin-only modules.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-on-surface shadow-sm">
                    Admin console
                  </span>
                  <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-on-surface shadow-sm">
                    User management
                  </span>
                  <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-on-surface shadow-sm">
                    Payroll & reports
                  </span>
                </div>
              </div>
            ) : (
              <>
                {!canEditAccess && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                    <p className="font-bold">Read-only preview</p>
                    <p className="mt-1 leading-5">
                      Only <strong>hr.redpoint</strong> can change access settings for other admin and employee accounts.
                    </p>
                  </div>
                )}
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-on-surface">Employee portal sections</h3>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        Toggle what this employee can see in the self-service portal.
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      Local preview
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {ACCESS_ITEMS.map((item) => {
                      const Icon = item.icon;
                      const enabled = selectedAccess[item.id];
                      return (
                        <label
                          key={item.id}
                          className={`flex items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                            canEditAccess ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'
                          } ${
                            enabled
                              ? 'border-emerald-200 bg-emerald-50/40'
                              : 'border-neutral-border bg-white'
                          }`}
                        >
                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-on-surface-variant'
                          }`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-on-surface">{item.label}</span>
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={() => handleToggle(item.id)}
                                disabled={!canEditAccess}
                                className="h-4 w-4 accent-primary"
                              />
                            </span>
                            <span className="mt-1 block text-[10px] leading-4 text-on-surface-variant">
                              {item.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-border pt-4">
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={!canEditAccess}
                    className="inline-flex items-center gap-2 rounded-lg border border-neutral-border px-3 py-2 text-xs font-semibold text-on-surface-variant hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset defaults
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!canEditAccess}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save preview settings
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-neutral-border bg-[#fffdfb] p-6 text-center">
            <div>
              <UserRound className="mx-auto h-8 w-8 text-on-surface-variant" />
              <p className="mt-3 text-sm font-semibold text-on-surface">No accounts available</p>
              <p className="mt-1 text-xs text-on-surface-variant">Add an employee or configure a preview account to begin.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
