/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  Briefcase, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar as CalendarIcon,
  UserCheck,
  MapPin,
  Clock
} from 'lucide-react';
import { Employee } from '../types';
import EmployeeAvatar from './EmployeeAvatar';
import { LeaveRequest } from './LeaveManagementView';
import { formatToDDMMMYYYY } from '../lib/dateUtils';
import { isCurrentActiveEmployee } from '../data';

interface LeaveCalendarProps {
  requests: LeaveRequest[];
  employees: Employee[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function LeaveCalendar({ requests, employees }: LeaveCalendarProps) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  // Handle previous month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  // Handle next month navigation
  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Handle going to current live today
  const handleGoToMockToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${d}`);
  };

  // Generate grid days
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthTotalDays = new Date(currentYear, currentMonth, 0).getDate();

    const daysList = [];

    // 1. Padding from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthTotalDays - i;
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateString = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      daysList.push({
        day: dayNum,
        isCurrentMonth: false,
        dateString
      });
    }

    // 2. Days of current month
    for (let i = 1; i <= totalDays; i++) {
      const dateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      daysList.push({
        day: i,
        isCurrentMonth: true,
        dateString
      });
    }

    // 3. Padding from next month (fill up to 42 cells to complete the 6 rows)
    const remainingCells = 42 - daysList.length;
    for (let i = 1; i <= remainingCells; i++) {
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateString = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      daysList.push({
        day: i,
        isCurrentMonth: false,
        dateString
      });
    }

    return daysList;
  }, [currentYear, currentMonth]);

  // Map APPROVED leave requests by date for easier lookup
  const approvedLeavesByDate = useMemo(() => {
    const map: Record<string, LeaveRequest[]> = {};
    
    requests.forEach(req => {
      if (req.status !== 'Approved') return;
      
      // We need to parse startDate and endDate, and map every date in between
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
      
      const current = new Date(start);
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        if (!map[dateStr]) {
          map[dateStr] = [];
        }
        // Avoid duplicate mappings
        if (!map[dateStr].some(r => r.id === req.id)) {
          map[dateStr].push(req);
        }
        current.setDate(current.getDate() + 1);
      }
    });
    
    return map;
  }, [requests]);

  // Selected date statistics & personnel
  const selectedDateLeaves = useMemo(() => {
    return approvedLeavesByDate[selectedDate] || [];
  }, [selectedDate, approvedLeavesByDate]);

  // Active coverage details for selected date
  const shiftPlanningCoverage = useMemo(() => {
    // Group approved leaves of selected day by department
    const departmentLeaveCounts: Record<string, number> = {};
    selectedDateLeaves.forEach(leave => {
      const emp = employees.find(e => e.id === leave.employeeId);
      if (emp) {
        departmentLeaveCounts[emp.department] = (departmentLeaveCounts[emp.department] || 0) + 1;
      }
    });

    // Check for high absenteeism within the same department
    const warnings: string[] = [];
    Object.entries(departmentLeaveCounts).forEach(([dept, count]) => {
      if (count > 1) {
        warnings.push(`High Alert: ${count} staff member(s) from "${dept}" are on approved leave today. Coordinate backups immediately!`);
      }
    });

    // Determine available backup staff
    const leaveEmployeeIds = new Set(selectedDateLeaves.map(l => l.employeeId));
    
    const backupsByDept: Record<string, Employee[]> = {};
    selectedDateLeaves.forEach(leave => {
      const absentEmp = employees.find(e => e.id === leave.employeeId);
      if (absentEmp && !backupsByDept[absentEmp.department]) {
        // Find other employees in same department who are NOT on leave today
        const deptStaff = employees.filter(e => 
          e.department === absentEmp.department && 
          e.id !== absentEmp.id && 
          !leaveEmployeeIds.has(e.id) &&
          isCurrentActiveEmployee(e)
        );
        backupsByDept[absentEmp.department] = deptStaff;
      }
    });

    return {
      warnings,
      backupsByDept,
      totalEmployees: employees.length,
      absentCount: selectedDateLeaves.length,
      activeCount: employees.length - selectedDateLeaves.length
    };
  }, [selectedDateLeaves, employees]);

  // Color helper for leave types
  const getLeaveColorStyles = (leaveType: string) => {
    const type = leaveType.toLowerCase();
    if (type.includes('sick') || type.includes('hospital')) {
      return {
        cellDot: 'bg-red-500',
        badge: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/50',
        text: 'text-red-700 dark:text-red-300'
      };
    }
    if (type.includes('emergency')) {
      return {
        cellDot: 'bg-amber-500',
        badge: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50',
        text: 'text-amber-700 dark:text-amber-300'
      };
    }
    if (type.includes('maternity') || type.includes('paternity')) {
      return {
        cellDot: 'bg-purple-500',
        badge: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-900/50',
        text: 'text-purple-700 dark:text-purple-300'
      };
    }
    if (type.includes('annual')) {
      return {
        cellDot: 'bg-blue-500',
        badge: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/50',
        text: 'text-blue-700 dark:text-blue-300'
      };
    }
    return {
      cellDot: 'bg-neutral-500',
      badge: 'bg-neutral-50 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800',
      text: 'text-neutral-700 dark:text-neutral-300'
    };
  };

  // Helper to get initials
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  // Month-Year selection options
  const yearOptions = [2025, 2026, 2027];

  return (
    <div className="bg-white border border-neutral-border rounded-lg shadow-sm overflow-hidden animate-in fade-in duration-200 text-left mt-6">
      
      {/* Calendar Header with Controls */}
      <div className="bg-neutral-50 border-b border-neutral-border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-on-surface">Company Shift-Planning Leave Calendar</h2>
            <p className="text-[11px] text-on-surface-variant font-medium">
              Real-time visualization of approved leave dates to coordinate department shift-planning and coverage.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          
          {/* Quick jump to Current Mock Today */}
          <button
            onClick={handleGoToMockToday}
            className="px-2.5 py-1.5 bg-white border border-neutral-border hover:bg-neutral-100 rounded text-[11px] font-bold text-on-surface transition-colors cursor-pointer"
          >
            Go to Today
          </button>

          {/* Month Dropdown Selector */}
          <select
            value={currentMonth}
            onChange={(e) => setCurrentMonth(Number(e.target.value))}
            className="bg-white border border-neutral-border rounded px-2 py-1.5 text-[11px] font-bold text-on-surface focus:outline-none"
          >
            {MONTHS.map((m, idx) => (
              <option key={m} value={idx}>{m}</option>
            ))}
          </select>

          {/* Year Dropdown Selector */}
          <select
            value={currentYear}
            onChange={(e) => setCurrentYear(Number(e.target.value))}
            className="bg-white border border-neutral-border rounded px-2 py-1.5 text-[11px] font-bold text-on-surface focus:outline-none"
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Nav arrows */}
          <div className="flex items-center border border-neutral-border rounded bg-white overflow-hidden">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-neutral-100 border-r border-neutral-border cursor-pointer text-on-surface"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-neutral-100 cursor-pointer text-on-surface"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid & Side Detail Column */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-neutral-border/60">
        
        {/* Left 8 Cols: Calendar Grid */}
        <div className="lg:col-span-8 p-4">
          
          {/* Month Indicator */}
          <div className="text-center mb-4">
            <span className="text-base font-bold text-primary tracking-wide">
              {MONTHS[currentMonth]} {currentYear}
            </span>
          </div>

          {/* Days of Week Headers */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-on-surface-variant uppercase tracking-wider mb-1.5 pb-2 border-b border-neutral-100">
            {WEEKDAYS.map(day => (
              <div key={day} className="py-1">{day}</div>
            ))}
          </div>

          {/* 42-cell Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((cell, idx) => {
              const dateLeaves = approvedLeavesByDate[cell.dateString] || [];
              const isSelected = selectedDate === cell.dateString;
              const hasLeaves = dateLeaves.length > 0;
              
              return (
                <button
                  key={`${cell.dateString}-${idx}`}
                  onClick={() => setSelectedDate(cell.dateString)}
                  className={`min-h-[76px] p-1.5 border rounded-md transition-all flex flex-col justify-between text-left cursor-pointer group ${
                    cell.isCurrentMonth 
                      ? 'bg-white text-on-surface hover:border-primary/50' 
                      : 'bg-neutral-50/50 text-on-surface-variant/40'
                  } ${
                    isSelected 
                      ? 'ring-2 ring-primary border-primary bg-primary/5' 
                      : 'border-neutral-border/40'
                  }`}
                >
                  {/* Top line: Day number and Dots */}
                  <div className="flex items-center justify-between w-full">
                    <span className={`text-[11px] font-bold font-mono ${
                      cell.isCurrentMonth 
                        ? (isSelected ? 'text-primary' : 'text-on-surface') 
                        : 'text-on-surface-variant/30'
                    }`}>
                      {cell.day}
                    </span>
                    
                    {/* Tiny visual indicators */}
                    {hasLeaves && (
                      <div className="flex gap-0.5">
                        {dateLeaves.slice(0, 3).map((l, i) => {
                          const style = getLeaveColorStyles(l.leaveType);
                          return (
                            <span 
                              key={l.id} 
                              className={`w-1.5 h-1.5 rounded-full ${style.cellDot}`}
                              title={`${l.employeeName} (${l.leaveType})`}
                            />
                          );
                        })}
                        {dateLeaves.length > 3 && (
                          <span className="w-1.5 h-1.5 bg-neutral-600 rounded-full flex items-center justify-center text-[5px] text-white">
                            +
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Horizontal small label badges for desktop */}
                  <div className="w-full space-y-0.5 mt-1 overflow-hidden hidden md:block">
                    {dateLeaves.slice(0, 2).map(l => {
                      const style = getLeaveColorStyles(l.leaveType);
                      const nameParts = l.employeeName.split(' ');
                      const displayName = nameParts[0] + (nameParts[1] ? ' ' + nameParts[1][0] + '.' : '');
                      return (
                        <div 
                          key={l.id} 
                          className={`text-[9px] px-1 py-0.5 rounded border leading-tight truncate text-left font-semibold ${style.badge}`}
                          title={`${l.employeeName}: ${l.leaveType}`}
                        >
                          {displayName}
                        </div>
                      );
                    })}
                    {dateLeaves.length > 2 && (
                      <div className="text-[8px] text-on-surface-variant font-bold pl-1">
                        + {dateLeaves.length - 2} more...
                      </div>
                    )}
                  </div>

                  {/* Small visual line for mobile if there's any leave */}
                  <div className="w-full md:hidden mt-1">
                    {hasLeaves && (
                      <div className="h-1 bg-red-400 rounded-full w-3/4" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right 4 Cols: "Shift Coverage Coordination Panel" */}
        <div className="lg:col-span-4 p-4 flex flex-col justify-between bg-neutral-50/40">
          
          <div className="space-y-4">
            
            {/* Header / Active Date */}
            <div className="border-b border-neutral-border pb-3">
              <span className="text-[10px] font-bold text-primary tracking-wider uppercase font-mono block">Selected Date Shift Status</span>
              <span className="text-sm font-extrabold text-on-surface flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4 text-primary" />
                {formatToDDMMMYYYY(selectedDate)}
              </span>
            </div>

            {/* Quick stats counter */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="bg-white border border-neutral-border/40 p-2 rounded flex flex-col justify-center">
                <span className="text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">Active Duty</span>
                <span className="text-base font-bold text-green-700 font-mono mt-0.5">
                  {shiftPlanningCoverage.activeCount}
                </span>
                <span className="text-[8px] text-on-surface-variant">/ {shiftPlanningCoverage.totalEmployees} employees</span>
              </div>
              <div className="bg-white border border-neutral-border/40 p-2 rounded flex flex-col justify-center">
                <span className="text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">On Approved Leave</span>
                <span className={`text-base font-bold font-mono mt-0.5 ${shiftPlanningCoverage.absentCount > 0 ? 'text-amber-600' : 'text-neutral-500'}`}>
                  {shiftPlanningCoverage.absentCount}
                </span>
                <span className="text-[8px] text-on-surface-variant">Absent staff</span>
              </div>
            </div>

            {/* Coverage Warnings */}
            {shiftPlanningCoverage.warnings.length > 0 && (
              <div className="space-y-1.5">
                {shiftPlanningCoverage.warnings.map((warn, i) => (
                  <div 
                    key={i} 
                    className="p-2.5 bg-red-50 border border-red-200 rounded text-[10px] text-red-900 leading-normal flex gap-1.5 items-start"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 animate-pulse" />
                    <span className="font-semibold">{warn}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Main Content Area */}
            <div>
              <h3 className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-2">
                Approved Absentee Roster ({selectedDateLeaves.length})
              </h3>

              {selectedDateLeaves.length === 0 ? (
                <div className="text-center py-10 bg-white border border-dashed border-neutral-border/40 rounded-lg p-4 text-[11px] text-on-surface-variant flex flex-col items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-500 mb-1.5" />
                  <span className="font-bold text-green-700">Perfect Shift Coverage</span>
                  <span className="mt-0.5 text-on-surface-variant/80 text-center">
                    All employees are scheduled for active duty. No approved leaves on this day.
                  </span>
                </div>
              ) : (
                <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                  {selectedDateLeaves.map(leave => {
                    const emp = employees.find(e => e.id === leave.employeeId);
                    const style = getLeaveColorStyles(leave.leaveType);
                    const sameDeptBackups = shiftPlanningCoverage.backupsByDept[emp?.department || ''] || [];

                    return (
                      <div 
                        key={leave.id}
                        className="bg-white border border-neutral-border/60 rounded-lg p-3 space-y-2 shadow-xs hover:border-neutral-400 transition-all text-[11px]"
                      >
                        {/* Avatar and name */}
                        <div className="flex items-center justify-between border-b border-neutral-100 pb-1.5">
                          <div className="flex items-center gap-2">
                            <EmployeeAvatar employee={emp} className="w-6 h-6 rounded-full" />
                            <div>
                              <span className="font-bold text-on-surface block leading-tight">{leave.employeeName}</span>
                              <span className="text-[9px] text-on-surface-variant block font-medium font-mono">{emp?.designation || 'Staff'}</span>
                            </div>
                          </div>
                          
                          <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border tracking-wide uppercase ${style.badge}`}>
                            {leave.leaveType}
                          </span>
                        </div>

                        {/* Leave Meta Details */}
                        <div className="grid grid-cols-2 gap-2 text-[10px] bg-neutral-50 p-1.5 rounded border border-neutral-200/50">
                          <div>
                            <span className="text-[8px] text-on-surface-variant uppercase block font-semibold">Department</span>
                            <span className="font-bold text-primary flex items-center gap-1">
                              <Briefcase className="w-3 h-3 text-primary/60" />
                              {emp?.department || 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[8px] text-on-surface-variant uppercase block font-semibold">Absence Period</span>
                            <span className="font-bold text-on-surface font-mono block truncate" title={`${leave.startDate} to ${leave.endDate}`}>
                              {leave.startDate.substring(5)} to {leave.endDate.substring(5)}
                            </span>
                          </div>
                        </div>

                        {/* Leave Reason note */}
                        <div className="text-[10px] text-on-surface-variant leading-relaxed bg-neutral-50/50 p-1.5 rounded italic">
                          " {leave.reason} "
                        </div>

                        {/* Shift Coverage Backups list */}
                        <div className="pt-1.5 border-t border-neutral-100 space-y-1">
                          <div className="flex items-center justify-between text-[8px] uppercase tracking-wider font-extrabold text-on-surface-variant">
                            <span>Recommended Backups</span>
                            <span className="font-semibold text-green-700 font-mono">{sameDeptBackups.length} Available</span>
                          </div>
                          {sameDeptBackups.length === 0 ? (
                            <span className="text-[9px] text-red-600 font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> No other staff in department available!
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {sameDeptBackups.slice(0, 3).map(bk => (
                                <span 
                                  key={bk.id}
                                  className="text-[9px] font-bold px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded flex items-center gap-1"
                                >
                                  <UserCheck className="w-2.5 h-2.5 text-green-600" />
                                  {bk.name.split(' ')[0]}
                                </span>
                              ))}
                              {sameDeptBackups.length > 3 && (
                                <span className="text-[8px] text-on-surface-variant font-bold pl-0.5">
                                  +{sameDeptBackups.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Bottom legend / guide */}
          <div className="mt-4 pt-4 border-t border-neutral-200 text-[10px] text-on-surface-variant leading-normal bg-neutral-50 p-2 rounded">
            <h4 className="font-bold text-primary uppercase text-[8px] tracking-wider mb-1">Coverage Legend & Guidelines</h4>
            <div className="space-y-1 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span>Annual Leave — Plan temporary cover or redirect project workflows</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span>Sick / Hospitalisation Leave — Urgent backfill recommendations</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Emergency Leave — Immediate review of active shifts required</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
