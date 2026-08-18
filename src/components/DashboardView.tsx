/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Users, 
  CreditCard, 
  Award, 
  ArrowRight, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp,
  ChevronRight,
  FileText,
  UserPlus,
  Building2,
  MapPin,
  Copy,
  Globe,
  ShieldCheck,
  Check,
  Sliders,
  Calendar
} from 'lucide-react';
import { Employee, ReviewCycle, CorporateEntity, EmployeePerformance, PayrollRecord2026 } from '../types';
import EmployeeAvatar from './EmployeeAvatar';
import { getEffectiveEmploymentStatusForDate, isCurrentActiveEmployee } from '../data';
import { getGmt8DateString } from '../lib/dateUtils';

interface DashboardViewProps {
  employees: Employee[];
  entities: CorporateEntity[];
  reviewCycles: ReviewCycle[];
  performances: EmployeePerformance[];
  payrollRecords2026?: PayrollRecord2026[];
  onNavigate: (tab: any) => void;
  onOpenNewEmployeeModal: () => void;
  onOpenRequestModal: () => void;
  activeEntityId?: string;
  onChangeActiveEntity?: (id: string) => void;
}

export default function DashboardView({
  employees,
  entities,
  reviewCycles,
  performances,
  payrollRecords2026,
  onNavigate,
  onOpenNewEmployeeModal,
  onOpenRequestModal,
  activeEntityId,
  onChangeActiveEntity
}: DashboardViewProps) {
  const selectedEntityId = activeEntityId;
  const [addressCopied, setAddressCopied] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());

  // 1. Filter employees by selected corporate subsidiary
  const filteredEmployees = selectedEntityId === 'all' 
    ? employees 
    : employees.filter(e => e.entityId === selectedEntityId);

  // 2. Find active entity if specific one is selected
  const activeEntity = entities.find(ent => ent.id === selectedEntityId);

  // 3. Compute dynamic stats
  const totalEmployees = filteredEmployees.length;
  const todayIsoDate = getGmt8DateString();
  const activeEmployees = filteredEmployees.filter(
    e => isCurrentActiveEmployee(e, todayIsoDate)
  ).length;
  const onLeaveEmployees = filteredEmployees.filter(
    e => getEffectiveEmploymentStatusForDate(e, todayIsoDate) === 'On Leave'
  ).length;
  
  // Find actual processed payroll records matching the selected month and year
  const matchingRecords = (payrollRecords2026 || []).filter(
    r => r.payrollYear === selectedYear && r.payrollMonth === (selectedMonth + 1)
  );

  const calculateRecordGross = (r: PayrollRecord2026) => {
    return r.basicSalary +
      (r.allowanceGeneral || 0) +
      (r.allowanceTransport || 0) +
      (r.allowanceParking || 0) +
      (r.allowanceMeal || 0) +
      (r.allowanceAccommodation || 0) +
      (r.allowancePhone || 0) +
      (r.overtime || 0) +
      (r.bonusAmount || 0) +
      (r.commissionAmount || 0) +
      (r.backPayAmount || 0) +
      (r.awsAmount || 0) +
      (r.compensationAmount || 0);
  };

  const baselineGrossPayroll = filteredEmployees.reduce(
    (acc, e) => acc + e.basicSalary + (e.housingAllowance || 0) + (e.transportAllowance || 0), 
    0
  );

  const totalPayroll = matchingRecords.length > 0
    ? Math.round(matchingRecords.reduce((acc, r) => acc + calculateRecordGross(r), 0))
    : Math.round(baselineGrossPayroll);

  const averageSalary = matchingRecords.length > 0
    ? Math.round(matchingRecords.reduce((acc, r) => acc + r.basicSalary, 0) / matchingRecords.length)
    : (totalEmployees > 0 
        ? Math.round(filteredEmployees.reduce((acc, e) => acc + e.basicSalary, 0) / totalEmployees) 
        : 0);

  // 4. Compute dynamic performance metrics matching current review cycle
  const currentCycleId = reviewCycles[0]?.id || 'cycle-2026-annual';
  const entityPerformances = performances.filter(
    p => p.reviewCycleId === currentCycleId && filteredEmployees.some(e => e.id === p.employeeId)
  );

  const reviewsCompletedCount = entityPerformances.filter(p => p.reviewStatus === 'Completed').length;
  const reviewsPendingCount = Math.max(0, totalEmployees - reviewsCompletedCount);
  
  const ratedPerfs = entityPerformances.filter(p => p.reviewStatus === 'Completed' && p.rating > 0);
  const averageRating = ratedPerfs.length > 0 
    ? parseFloat((ratedPerfs.reduce((acc, p) => acc + p.rating, 0) / ratedPerfs.length).toFixed(1))
    : 0;

  // 5. Dynamic Chart Scaling based on selected subsidiary's payroll ratio
  const currentMonthIdx = selectedMonth;
  const currentYear = selectedYear;
  const allMonthsAbbr = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const allMonthsFull = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];
  const currentMonthName = allMonthsFull[currentMonthIdx];
  const currentMonthAbbr = allMonthsAbbr[currentMonthIdx];
  const chartLabels = allMonthsAbbr.slice(0, currentMonthIdx + 1);

  // Calculate scaledValues dynamically from historical database records
  const scaledValues = chartLabels.map((_, idx) => {
    const monthNum = idx + 1;
    const monthlyRecords = (payrollRecords2026 || []).filter(
      r => r.payrollYear === selectedYear && r.payrollMonth === monthNum
    );
    if (monthlyRecords.length > 0) {
      return Math.round(monthlyRecords.reduce((acc, r) => acc + calculateRecordGross(r), 0));
    }
    return baselineGrossPayroll;
  });

  const maxScaledValue = Math.max(...scaledValues, 1000);
  const chartMaxVal = Math.ceil(maxScaledValue / 5000) * 5000 || 5000;

  const getChartY = (val: number) => {
    const minY = 220;
    const maxY = 30;
    const percent = val / chartMaxVal;
    return minY - percent * (minY - maxY);
  };

  const chartPoints = scaledValues.map((val, idx) => {
    const totalPoints = chartLabels.length;
    const x = totalPoints > 1 
      ? 50 + idx * (600 / (totalPoints - 1))
      : 350;
    return {
      x,
      y: getChartY(val),
      val: `RM ${val.toLocaleString()}`
    };
  });

  const yAxisTicks = [
    { label: `RM ${Math.round(chartMaxVal / 1000)}k`, y: 34 },
    { label: `RM ${Math.round((chartMaxVal * 0.75) / 1000)}k`, y: 84 },
    { label: `RM ${Math.round((chartMaxVal * 0.5) / 1000)}k`, y: 134 },
    { label: `RM ${Math.round((chartMaxVal * 0.25) / 1000)}k`, y: 184 },
    { label: `RM 0`, y: 224 }
  ];

  const linePathD = `M ${chartPoints.map(p => `${p.x} ${p.y}`).join(' L ')}`;
  const areaPathD = `M 50 220 L ${chartPoints.map(p => `${p.x} ${p.y}`).join(' L ')} L ${chartPoints[chartPoints.length - 1]?.x || 50} 220 Z`;

  // 6. Action: copy address to clipboard
  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-left">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary mb-1">Overview</p>
          <h1 className="text-4xl font-bold text-on-background tracking-tight">Your people, at a glance</h1>
          <p className="text-on-surface-variant mt-2 text-[15px]">
            Welcome back. You have <span className="font-semibold text-primary">{reviewsPendingCount} performance reviews</span> pending for {currentMonthName}.
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={onOpenRequestModal}
            className="px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-teal-800 transition-colors flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New request
          </button>
        </div>
      </div>

      {/* Dynamic Month/Year Slicer Controls */}
      <div className="bg-white/80 backdrop-blur border border-neutral-border p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs text-left">
        <div className="flex items-center gap-2 text-primary font-bold">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="text-xs uppercase tracking-wider">Dashboard View Period</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-on-surface-variant">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-neutral-50 hover:bg-neutral-100 text-on-surface border border-neutral-border rounded px-2 py-1 text-xs font-bold outline-none cursor-pointer focus:border-primary transition-all"
            >
              {allMonthsFull.map((m, idx) => (
                <option key={idx} value={idx}>{m}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-on-surface-variant">Year:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-neutral-50 hover:bg-neutral-100 text-on-surface border border-neutral-border rounded px-2 py-1 text-xs font-bold outline-none cursor-pointer focus:border-primary transition-all"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>



      {/* Dedicated Corporate Subsidiary Details Card */}
      {selectedEntityId !== 'all' && activeEntity && (
        <div className="bg-white border border-neutral-border rounded-2xl p-6 shadow-sm text-left grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-4 duration-300">
          
          {/* Subsidiary Profile */}
          <div className="md:col-span-1 border-b md:border-b-0 md:border-r border-neutral-border pb-4 md:pb-0 md:pr-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary font-bold">
                <Building2 className="w-4 h-4 text-primary" />
                <span className="text-[10px] uppercase tracking-wider">Corporate Subsidiary profile</span>
              </div>
              <h2 className="text-lg font-bold text-on-background mt-1.5 leading-tight">{activeEntity.name}</h2>
              <div className="text-xs text-on-surface-variant mt-2 leading-relaxed flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-on-surface-variant/70" />
                <span>{activeEntity.address}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-neutral-border/40 flex items-center justify-between">
              <button
                onClick={() => handleCopyAddress(activeEntity.address)}
                className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                {addressCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-600" />
                    <span className="text-green-600">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Company Address</span>
                  </>
                )}
              </button>
              <span className="text-[10px] font-mono text-on-surface-variant bg-neutral-100 px-2 py-0.5 rounded font-semibold">
                ID: {activeEntity.id}
              </span>
            </div>
          </div>
          
          {/* Detailed Tax & Social Security Registry Details */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            
            <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-border/40 space-y-3">
              <span className="font-bold text-[10px] text-on-surface-variant uppercase tracking-wider block border-b border-neutral-border/40 pb-1">Statutory Registrations</span>
              <div className="space-y-2 font-mono text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">SSM Reg No:</span>
                  <span className="font-semibold text-on-surface">{activeEntity.registrationNumber}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">Tax Ref (TIN):</span>
                  <span className="font-semibold text-on-surface">{activeEntity.taxReferenceNo}</span>
                </div>
              </div>
            </div>

            <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-border/40 space-y-3">
              <span className="font-bold text-[10px] text-on-surface-variant uppercase tracking-wider block border-b border-neutral-border/40 pb-1">Social Security Credentials</span>
              <div className="space-y-2 font-mono text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">EPF Ref No:</span>
                  <span className="font-semibold text-on-surface">{activeEntity.epfReferenceNo}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">SOCSO Ref No:</span>
                  <span className="font-semibold text-on-surface">{activeEntity.socsoReferenceNo}</span>
                </div>
              </div>
            </div>

            <div className="sm:col-span-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-on-surface-variant bg-primary/5 px-4 py-2.5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                <span>Operating Currency: <strong className="text-primary font-mono">{activeEntity.currency} (Malaysian Ringgit)</strong></span>
              </div>
              <div className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-800 text-[10px] font-bold uppercase tracking-wider">Active LHDN Connection</span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Grid: 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
        {/* Card 1: Total Workforce */}
        <div 
          onClick={() => onNavigate('directory')}
          className="bg-white p-5 rounded-2xl border border-neutral-border shadow-sm flex flex-col justify-between hover:border-primary hover:-translate-y-0.5 transition-all cursor-pointer group"
          id="stat-card-workforce"
        >
          <div className="flex justify-between items-start">
            <span className="text-on-surface-variant text-sm font-medium">Workforce Directory</span>
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-on-background">{totalEmployees}</div>
            <div className="text-xs text-on-surface-variant mt-1">
              <span className="text-green-600 font-semibold">{activeEmployees} Active</span>
              {onLeaveEmployees > 0 && <> · {onLeaveEmployees} On Leave</>}
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-primary font-semibold group-hover:underline">
            Manage personnel <ChevronRight className="w-3 h-3 ml-1" />
          </div>
        </div>

        {/* Card 2: Total Payout */}
        <div 
          onClick={() => onNavigate('payroll')}
          className="bg-white p-5 rounded-2xl border border-neutral-border shadow-sm flex flex-col justify-between hover:border-primary hover:-translate-y-0.5 transition-all cursor-pointer group"
          id="stat-card-payroll"
        >
          <div className="flex justify-between items-start">
            <span className="text-on-surface-variant text-sm font-medium">Monthly {currentMonthAbbr} Payout</span>
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-on-background">RM {totalPayroll.toLocaleString()}</div>
            <div className="text-xs text-on-surface-variant mt-1">
              Average basic salary: <span className="font-semibold">RM {averageSalary.toLocaleString()}</span>
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-primary font-semibold group-hover:underline">
            Generate payroll <ChevronRight className="w-3 h-3 ml-1" />
          </div>
        </div>

        {/* Card 3: Reviews Pending */}
        <div 
          onClick={() => onNavigate('performance')}
          className="bg-white p-5 rounded-2xl border border-neutral-border shadow-sm flex flex-col justify-between hover:border-primary hover:-translate-y-0.5 transition-all cursor-pointer group"
          id="stat-card-pending-reviews"
        >
          <div className="flex justify-between items-start">
            <span className="text-on-surface-variant text-sm font-medium">Reviews Pending</span>
            <AlertTriangle className="w-5 h-5 text-error" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-on-background">{reviewsPendingCount}</div>
            <div className="text-xs text-error font-semibold mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-error" /> Action required
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-primary font-semibold group-hover:underline">
            View pending cycles <ChevronRight className="w-3 h-3 ml-1" />
          </div>
        </div>

        {/* Card 4: Reviews Completed */}
        <div 
          onClick={() => onNavigate('performance')}
          className="bg-white p-5 rounded-2xl border border-neutral-border shadow-sm flex flex-col justify-between hover:border-primary hover:-translate-y-0.5 transition-all cursor-pointer group"
          id="stat-card-completed-reviews"
        >
          <div className="flex justify-between items-start">
            <span className="text-on-surface-variant text-sm font-medium">Reviews Completed</span>
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-on-background">{reviewsCompletedCount}</div>
            <div className="text-xs text-green-600 font-semibold mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-600" /> 88% Completion rate
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-primary font-semibold group-hover:underline">
            Analyze analytics <ChevronRight className="w-3 h-3 ml-1" />
          </div>
        </div>
      </div>

      {/* Grid: 2 Columns (Main Content & Sidebar widgets) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
        
        {/* Left main: Chart & Recent Updates */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Payroll Trend Chart */}
          <div className="bg-white p-6 rounded-2xl border border-neutral-border shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-lg text-on-background">
                  {selectedEntityId === 'all' ? 'Group' : activeEntity?.name} Payroll Expense (YTD)
                </h3>
                <p className="text-xs text-on-surface-variant">Monthly spending on gross salaries and allowances</p>
              </div>
              <span className="text-xs text-primary bg-primary-container/10 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> +4.2% YoY
              </span>
            </div>

            {/* SVG Interactive Line/Area Chart */}
            <div className="h-64 w-full relative">
              <svg viewBox="0 0 700 240" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="gradient-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#18181b" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#18181b" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                
                {/* Horizontal Grid lines */}
                <line x1="50" y1="30" x2="680" y2="30" stroke="#e4e4e7" strokeDasharray="4 4" strokeWidth="1" />
                <line x1="50" y1="80" x2="680" y2="80" stroke="#e4e4e7" strokeDasharray="4 4" strokeWidth="1" />
                <line x1="50" y1="130" x2="680" y2="130" stroke="#e4e4e7" strokeDasharray="4 4" strokeWidth="1" />
                <line x1="50" y1="180" x2="680" y2="180" stroke="#e4e4e7" strokeDasharray="4 4" strokeWidth="1" />
                <line x1="50" y1="220" x2="680" y2="220" stroke="#a1a1aa" strokeWidth="1" />

                {/* Dynamic Y-axis Labels */}
                {yAxisTicks.map((tick, index) => (
                  <text key={index} x="42" y={tick.y} fontSize="9" textAnchor="end" fill="#71717a" className="font-mono">
                    {tick.label}
                  </text>
                ))}

                {/* Chart Area */}
                <path d={areaPathD} fill="url(#gradient-area)" />

                {/* Line Path */}
                <path 
                  d={linePathD} 
                  fill="none" 
                  stroke="#18181b" 
                  strokeWidth="3" 
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data Nodes */}
                {chartPoints.map((pt, idx) => (
                  <g key={idx} className="group/node cursor-pointer">
                    <circle 
                      cx={pt.x} 
                      cy={pt.y} 
                      r="4" 
                      fill="#FFFFFF" 
                      stroke="#18181b" 
                      strokeWidth="2.5" 
                    />
                    <circle 
                      cx={pt.x} 
                      cy={pt.y} 
                      r="10" 
                      fill="#18181b" 
                      fillOpacity="0"
                      className="hover:fill-opacity-10 transition-all"
                    />
                    {/* Tooltip on hover */}
                    <g className="opacity-0 group-hover/node:opacity-100 transition-opacity duration-150 pointer-events-none">
                      <rect x={pt.x - 38} y={pt.y - 35} width="76" height="22" rx="4" fill="#18181b" />
                      <text x={pt.x} y={pt.y - 21} fontSize="9" fontWeight="bold" textAnchor="middle" fill="#FFFFFF" className="font-mono">{pt.val}</text>
                    </g>
                  </g>
                ))}

                {/* X-axis Labels */}
                {chartLabels.map((label, idx) => (
                  <text key={idx} x={chartPoints[idx]?.x || 50} y="238" fontSize="10" textAnchor="middle" fill="#71717a" className="font-medium">{label}</text>
                ))}
              </svg>
            </div>
          </div>

          {/* Quick Informational / Action Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-neutral-border shadow-sm">
              <h3 className="font-semibold text-lg mb-4 text-on-background">Organization Directives</h3>
              <div className="space-y-4">
                <div className="p-3 bg-parchment/40 rounded border-l-4 border-secondary text-sm">
                  <div className="font-semibold text-primary">Revised EPF Voluntary Submissions</div>
                  <p className="text-xs text-on-surface-variant mt-1">Starting Nov 2023, voluntary employee contributions can exceed 11% directly via self-service.</p>
                </div>
                
                <div className="p-3 bg-surface-container-low rounded border-l-4 border-outline text-sm">
                  <div className="font-semibold text-on-surface">Workspace Directives</div>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Configure a company and employee records to activate organization-specific compliance notices.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-neutral-border shadow-sm">
              <h3 className="font-semibold text-lg mb-4 text-on-background">Review Cycles Overview</h3>
              <div className="space-y-3">
                {reviewCycles.map((cycle) => (
                  <div key={cycle.id} className="flex justify-between items-center p-2.5 rounded hover:bg-surface-container-low transition-colors">
                    <div>
                      <div className="font-medium text-sm text-on-surface">{cycle.name}</div>
                      <div className="text-xs text-on-surface-variant mt-0.5">{cycle.period}</div>
                    </div>
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${
                      cycle.status === 'In Progress' 
                        ? 'bg-blue-100 text-primary' 
                        : cycle.status === 'Completed'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {cycle.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* Right main: Quick Workflows & Recent Payslips */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Quick Actions Panel */}
          <div className="bg-white p-6 rounded-2xl border border-neutral-border shadow-sm">
            <h3 className="font-semibold text-lg text-on-background mb-4 pb-2 border-b border-surface-container">Quick Workflows</h3>
            <div className="space-y-3">
              <button 
                onClick={() => onNavigate('payroll')}
                className="w-full flex items-center justify-between p-3 rounded-md bg-primary text-white hover:opacity-95 text-sm font-medium shadow-sm transition-opacity cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <CreditCard className="w-4 h-4" /> Generate Active Payroll
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button 
                onClick={onOpenNewEmployeeModal}
                className="w-full flex items-center justify-between p-3 rounded-md bg-surface-container-low text-primary hover:bg-surface-container-high text-sm font-medium border border-neutral-border transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <UserPlus className="w-4 h-4" /> Add New Employee
                </span>
                <ArrowRight className="w-4 h-4 text-primary" />
              </button>

              <button 
                onClick={() => onNavigate('reports')}
                className="w-full flex items-center justify-between p-3 rounded-md bg-surface-container-low text-primary hover:bg-surface-container-high text-sm font-medium border border-neutral-border transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4" /> Performance Export Tool
                </span>
                <ArrowRight className="w-4 h-4 text-primary" />
              </button>
            </div>
          </div>

          {/* Quick Payslip Selector list */}
          <div className="bg-white p-6 rounded-2xl border border-neutral-border shadow-sm">
            <h3 className="font-semibold text-lg text-on-background mb-1">Quick Payslip Records</h3>
            <p className="text-xs text-on-surface-variant mb-4">
              {selectedEntityId === 'all' 
                ? 'Select employee profile to view active payslip document:' 
                : `Active staff in ${activeEntity?.name}:`}
            </p>
            <div className="space-y-3">
              {filteredEmployees.length === 0 ? (
                <div className="text-xs text-on-surface-variant p-4 text-center border border-dashed border-neutral-border rounded">
                  No employees in this subsidiary.
                </div>
              ) : (
                filteredEmployees.slice(0, 5).map((emp) => (
                  <div 
                    key={emp.id}
                    onClick={() => {
                      // Navigate to payroll with this employee
                      onNavigate('payroll');
                    }}
                    className="p-3 rounded-md border border-outline-variant/30 hover:border-primary bg-surface-container-lowest hover:bg-surface-container-low transition-all cursor-pointer flex justify-between items-center group"
                  >
                    <div className="flex items-center gap-3">
                      <EmployeeAvatar employee={emp} className="w-8 h-8 rounded-full shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-on-surface group-hover:text-primary transition-colors truncate">{emp.name}</div>
                        <div className="text-[10px] text-on-surface-variant truncate">{emp.designation}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-outline group-hover:text-primary transition-colors" />
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

// Simple Plus icon helper to prevent import issue
function Plus(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M5 12h14" /><path d="M12 5v14" /></svg>
  );
}
