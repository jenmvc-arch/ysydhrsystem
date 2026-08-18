/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Award, 
  FileText, 
  Settings, 
  HelpCircle, 
  Plus,
  Calendar,
  ClipboardList,
  UserPlus,
  Tags,
  Percent
} from 'lucide-react';
import { AppTab, CorporateEntity } from '../types';
import { getPathForAppTab } from '../lib/appRoutes';

interface SidebarProps {
  currentTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onNewRequest: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  entities?: CorporateEntity[];
  activeEntityId?: string;
  onChangeActiveEntity?: (id: string) => void;
}

export default function Sidebar({
  currentTab,
  onTabChange,
  onNewRequest,
  isMobileOpen,
  onMobileClose,
}: SidebarProps) {
  const coreItems = [
    { id: 'dashboard' as AppTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'directory' as AppTab, label: 'People', icon: Users },
    { id: 'payroll' as AppTab, label: 'Payroll', icon: CreditCard },
    { id: 'leave-management' as AppTab, label: 'Leave', icon: Calendar },
    { id: 'performance' as AppTab, label: 'Performance', icon: Award },
    { id: 'hire-onboarding' as AppTab, label: 'Hiring', icon: UserPlus },
  ];

  const complianceItems = [
    { id: 'department-role' as AppTab, label: 'Departments', icon: Tags },
    { id: 'tax-settings' as AppTab, label: 'Tax & LHDN', icon: Percent },
    { id: 'forms-directory' as AppTab, label: 'Forms', icon: ClipboardList },
    { id: 'reports' as AppTab, label: 'Reports', icon: FileText },
  ];

  const bottomItems = [
    { id: 'settings' as AppTab, label: 'Settings', icon: Settings },
    { id: 'help' as AppTab, label: 'Help', icon: HelpCircle },
  ];

  const navLinkClass = (isActive: boolean) =>
    `w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 ${
      isActive
        ? 'bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
        : 'text-white/65 hover:bg-white/6 hover:text-white'
    }`;

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-transparent text-white py-5">
      <div className="px-4 mb-5">
        <div className="rounded-2xl bg-white/95 px-3 py-3 shadow-sm">
          <img
            src="/redpoint-logo.png"
            alt="YSYD HRMS Logo"
            className="w-full h-10 object-contain"
          />
        </div>
        <p className="mt-3 px-1 text-[11px] font-medium uppercase tracking-[0.18em] text-teal-200/80">
          People OS
        </p>
      </div>

      <div className="px-4 mb-5">
        <button
          onClick={onNewRequest}
          className="w-full bg-teal-300 text-teal-950 font-semibold text-sm py-2.5 px-4 rounded-xl shadow-sm hover:bg-teal-200 transition-colors flex items-center justify-center gap-2"
          id="btn-sidebar-new-request"
        >
          <Plus className="w-4 h-4" />
          New request
        </button>
      </div>

      <nav className="flex-1 px-3 space-y-5 overflow-y-auto style-scrollbar">
        <div>
          <div className="px-3 py-1 text-[10px] font-semibold text-white/40 uppercase tracking-[0.16em] mb-1">
            Workspace
          </div>
          <div className="space-y-0.5">
            {coreItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id || (item.id === 'payroll' && currentTab === 'payroll-mockup');
              return (
                <a
                  key={item.id}
                  href={getPathForAppTab(item.id)}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    onTabChange(item.id);
                    onMobileClose();
                  }}
                  className={navLinkClass(isActive)}
                  id={`nav-item-${item.id}`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-teal-200' : 'text-white/55'}`} />
                  {item.label}
                </a>
              );
            })}
          </div>
        </div>

        <div>
          <div className="px-3 py-1 text-[10px] font-semibold text-white/40 uppercase tracking-[0.16em] mb-1">
            Compliance
          </div>
          <div className="space-y-0.5">
            {complianceItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <a
                  key={item.id}
                  href={getPathForAppTab(item.id)}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    onTabChange(item.id);
                    onMobileClose();
                  }}
                  className={navLinkClass(isActive)}
                  id={`nav-item-${item.id}`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-teal-200' : 'text-white/55'}`} />
                  {item.label}
                </a>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="px-3 pt-4 border-t border-white/10">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <a
              key={item.id}
              href={getPathForAppTab(item.id)}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onTabChange(item.id);
                onMobileClose();
              }}
              className={navLinkClass(isActive)}
              id={`nav-item-${item.id}`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </a>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:block w-[248px] shrink-0 h-screen sticky top-0 select-none z-30 bg-[#102027]">
        <SidebarContent />
      </aside>

      {isMobileOpen && (
        <div
          onClick={onMobileClose}
          className="md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity"
        />
      )}

      <aside className={`md:hidden fixed inset-y-0 left-0 w-[248px] z-50 transform transition-transform duration-300 ease-in-out bg-[#102027] ${
        isMobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <SidebarContent />
      </aside>
    </>
  );
}
