import React, { useState } from 'react';
import { 
  AlertCircle, 
  Calendar, 
  Play, 
  CheckCircle, 
  Download, 
  TrendingUp, 
  XCircle, 
  Plus, 
  FileText, 
  Sliders,
  DollarSign,
  User,
  Info
} from 'lucide-react';
import { 
  Employee, 
  HistoricalPayrollRecord, 
  EmployeeTaxProfile, 
  HistoricalCalculationBasis, 
  HistoricalPCBResult, 
  PCBProcessingMode 
} from '../types';
import {
  reconstructPCBHistory, 
  recalculatePCBFromMonth,
  getEffectiveProfileForMonth,
  getPayrollRecordForMonth,
  calculateAccumulatedPCBHistory,
  recalculatePCBForward
} from '../data';
import { hasGlobalAdminPrivileges } from '../lib/userRoles';

interface PCBReconstructionHubProps {
  employees: Employee[];
  onUpdateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
  onShowNotification: (title: string, message: string, type?: 'success' | 'info' | 'error') => void;
}

export default function PCBReconstructionHub({
  employees,
  onUpdateEmployee,
  onShowNotification
}: PCBReconstructionHubProps) {
  const [selectedEmpId, setSelectedEmpId] = useState(employees[0]?.id || '');
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(12);
  const [calcBasis, setCalcBasis] = useState<HistoricalCalculationBasis>('actual_deduction_history');
  
  // UI Tab state
  const [activeSubTab, setActiveSubTab] = useState<'input_payroll' | 'input_profiles' | 'reconstruction' | 'ledger_tp3'>('reconstruction');

  // Preview / Computed results state
  const [previewResults, setPreviewResults] = useState<HistoricalPCBResult[]>([]);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [lastUsedBasis, setLastUsedBasis] = useState<HistoricalCalculationBasis>('actual_deduction_history');

  // Form states for adding historical payroll record
  const [payMonth, setPayMonth] = useState(1);
  const [payBasic, setPayBasic] = useState(5000);
  const [payAllowanceGen, setPayAllowanceGen] = useState(0);
  const [payOvertime, setPayOvertime] = useState(0);
  const [payBonus, setPayBonus] = useState(0);
  const [payCommission, setPayCommission] = useState(0);
  const [payActualPcb, setPayActualPcb] = useState(0);

  // Form states for adding effective profile snap
  const [profEffectiveDate, setProfEffectiveDate] = useState('2026-01-01');
  const [profBasic, setProfBasic] = useState(5000);
  const [profMarital, setProfMarital] = useState<'Single' | 'Married' | 'Divorced' | 'Widowed'>('Single');
  const [profSpouseWorking, setProfSpouseWorking] = useState<'Yes' | 'No'>('No');
  const [profDependants, setProfDependants] = useState(0);
  const [selectedBreakdownResult, setSelectedBreakdownResult] = useState<HistoricalPCBResult | null>(null);

  // TP3 states
  const [tp3Remuneration, setTp3Remuneration] = useState(5000);
  const [tp3AddRemuneration, setTp3AddRemuneration] = useState(0);
  const [tp3Epf, setTp3Epf] = useState(550);
  const [tp3AllowableDeductions, setTp3AllowableDeductions] = useState(0);
  const [tp3Pcb, setTp3Pcb] = useState(80);
  const [tp3Zakat, setTp3Zakat] = useState(0);
  const [tp3StartDate, setTp3StartDate] = useState('2026-01-01');
  const [tp3EndDate, setTp3EndDate] = useState('2026-02-28');
  const [tp3DeclDate, setTp3DeclDate] = useState('2026-03-01');
  const [tp3Status, setTp3Status] = useState<'VERIFIED' | 'UNVERIFIED' | 'CANCELLED'>('VERIFIED');
  const [tp3Doc, setTp3Doc] = useState('verified_tp3_copy.pdf');

  // Adjustment states
  const [adjMonth, setAdjMonth] = useState(1);
  const [adjOriginal, setAdjOriginal] = useState(0);
  const [adjCorrected, setAdjCorrected] = useState(0);
  const [adjReason, setAdjReason] = useState('Administrative tax profile alignment');
  const [adjDoc, setAdjDoc] = useState('supporting_ledger_correction.pdf');
  const [adjRemitted, setAdjRemitted] = useState<'Yes' | 'No'>('No');
  const [adjRequestedBy, setAdjRequestedBy] = useState('');
  const [adjApprovedBy, setAdjApprovedBy] = useState('');

  const activeEmployee = employees.find(e => e.id === selectedEmpId) || employees[0];

  if (!activeEmployee) {
    return (
      <div className="p-6 bg-white border border-neutral-border rounded-lg text-center text-xs">
        No active employees found to reconstruct PCB records.
      </div>
    );
  }

  // Monthly Labels
  const MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];

  const handleAddPayrollRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    const newRecord: HistoricalPayrollRecord = {
      payrollMonth: Number(payMonth),
      basicSalary: Number(payBasic),
      allowanceGeneral: Number(payAllowanceGen),
      overtime: Number(payOvertime),
      bonusAmount: Number(payBonus),
      commissionAmount: Number(payCommission),
      actualPCBDeducted: Number(payActualPcb),
      epfEmployee: Math.round(Number(payBasic) * 0.11),
      zakat: 0,
      cp38: 0
    };

    const currentRecords = activeEmployee.historicalPayrollRecords || [];
    const filtered = currentRecords.filter(r => r.payrollMonth !== Number(payMonth));
    const updated = [...filtered, newRecord].sort((a, b) => a.payrollMonth - b.payrollMonth);

    // Automatically trigger forward recalculation if needed
    const recalculated = recalculatePCBFromMonth({
      employee: { ...activeEmployee, historicalPayrollRecords: updated },
      taxYear: 2026,
      changedMonth: Number(payMonth),
      calculationBasis: calcBasis
    });
    
    try {
      await onUpdateEmployee(activeEmployee.id, {
        historicalPayrollRecords: updated,
        historicalPcbResults: recalculated
      });
      onShowNotification(
        'Payroll Record Saved',
        `Successfully registered payroll for ${MONTH_NAMES[payMonth]} 2026. Recalculated PCB forwarding effects.`,
        'success'
      );
    } catch (error) {
      console.error('[Historical Payroll Save] Failed:', error);
    }
  };

  const handleAddEffectiveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const newProfile: EmployeeTaxProfile = {
      effectiveDate: profEffectiveDate,
      basicSalary: Number(profBasic),
      housingAllowance: 0,
      transportAllowance: 0,
      maritalStatus: profMarital,
      spouseIsWorking: profSpouseWorking,
      dependantsCount: Number(profDependants),
      eligibleForStatutory: 'Yes'
    };

    const currentProfiles = activeEmployee.effectiveDatedProfiles || [];
    const filtered = currentProfiles.filter(p => p.effectiveDate !== profEffectiveDate);
    const updated = [...filtered, newProfile].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

    try {
      await onUpdateEmployee(activeEmployee.id, {
        effectiveDatedProfiles: updated
      });
      onShowNotification(
        'Tax Profile Registered',
        `Effective profile registered for ${profEffectiveDate}. Run reconstruction to apply updates.`,
        'success'
      );
    } catch (error) {
      console.error('[Tax Profile Save] Failed:', error);
    }
  };

  const handlePreviewReconstruction = () => {
    const computed = reconstructPCBHistory({
      employee: activeEmployee,
      taxYear: 2026,
      startMonth: Number(startMonth),
      endMonth: Number(endMonth),
      calculationBasis: calcBasis
    });
    setPreviewResults(computed);
    setHasCalculated(true);
    setLastUsedBasis(calcBasis);
    onShowNotification('Reconstruction Previewed', 'Reconstructed chronological PCB calculations generated.', 'info');
  };

  const handleRunReconstruction = async () => {
    const computed = reconstructPCBHistory({
      employee: activeEmployee,
      taxYear: 2026,
      startMonth: 1,
      endMonth: 12,
      calculationBasis: calcBasis
    });

    const newLedgers = computed.map(res => ({
      id: `pay_${res.payrollMonth}_2026`,
      employee_id: activeEmployee.id,
      assessment_year: 2026,
      payroll_month: res.payrollMonth,
      source_type: 'CURRENT_EMPLOYER_PAYROLL' as const,
      source_reference: `Month ${res.payrollMonth} Payroll`,
      source_record_id: `rec_${res.payrollMonth}`,
      original_amount: res.actualPCBDeducted || 0,
      adjustment_amount: 0,
      effective_amount: res.calculatedPCB,
      normal_remuneration_pcb: res.normalRemunerationPCB,
      additional_remuneration_pcb: res.additionalRemunerationPCB,
      total_pcb: res.calculatedPCB,
      status: 'FINALIZED' as const,
      finalized_at: new Date().toISOString(),
      included_in_accumulated_x: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const existingAdjustments = (activeEmployee.employee_pcb_history_ledger || [])
      .filter(l => l.source_type !== 'CURRENT_EMPLOYER_PAYROLL');
    
    const updatedLedger = [...existingAdjustments, ...newLedgers].sort((a, b) => a.payroll_month - b.payroll_month);

    try {
      await onUpdateEmployee(activeEmployee.id, {
        historicalPcbResults: computed,
        employee_pcb_history_ledger: updatedLedger
      });
      setPreviewResults(computed.filter(r => r.payrollMonth >= Number(startMonth) && r.payrollMonth <= Number(endMonth)));
      setHasCalculated(true);
      setLastUsedBasis(calcBasis);
      onShowNotification(
        'Reconstruction Finalized',
        `Committed chronological calculation results for months 1-12 to the employee's registry and updated the history ledger.`,
        'success'
      );
    } catch (error) {
      console.error('[PCB Reconstruction Save] Failed:', error);
    }
  };

  const handleSaveTP3 = async (e: React.FormEvent) => {
    e.preventDefault();
    const newDecl = {
      id: `tp3_${Date.now()}`,
      employee_id: activeEmployee.id,
      taxYear: 2026,
      previousEmployerRemuneration: Number(tp3Remuneration),
      previousEmployerAdditionalRemuneration: Number(tp3AddRemuneration),
      previousEmployerEpf: Number(tp3Epf),
      previousEmployerAllowableDeductions: Number(tp3AllowableDeductions),
      previousEmployerPcb: Number(tp3Pcb),
      previousEmployerZakat: Number(tp3Zakat),
      previousEmployerStartDate: tp3StartDate,
      previousEmployerEndDate: tp3EndDate,
      declarationDate: tp3DeclDate,
      verificationStatus: tp3Status,
      supportingDocument: tp3Doc
    };

    const currentDecls = activeEmployee.employee_tp3_declarations || [];
    const filtered = currentDecls.filter(t => t.taxYear !== 2026);
    const updated = [...filtered, newDecl];

    try {
      await onUpdateEmployee(activeEmployee.id, {
        employee_tp3_declarations: updated
      });
      onShowNotification(
        'TP3 Declaration Saved',
        `TP3 form status is ${tp3Status}. Forward recalculations will be updated.`,
        'success'
      );
    } catch (error) {
      console.error('[TP3 Declaration Save] Failed:', error);
    }
  };

  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const userRole = localStorage.getItem('hr-nexus-user-role') || 'Employee';
    const isApprover = hasGlobalAdminPrivileges(userRole) || userRole === 'Payroll Tax Approver' || userRole === 'Administrator';
    if (!isApprover) {
      onShowNotification('Permission Denied', 'Only a Payroll Tax Approver or Global Administrator can authorize manual adjustments.', 'error');
      return;
    }

    const diff = Number(adjCorrected) - Number(adjOriginal);
    const newEntry = {
      id: `adj_${Date.now()}`,
      employee_id: activeEmployee.id,
      assessment_year: 2026,
      payroll_month: Number(adjMonth),
      source_type: 'APPROVED_ADJUSTMENT' as const,
      source_reference: adjDoc || 'Manual Correction',
      source_record_id: `manual_${Date.now()}`,
      original_amount: Number(adjOriginal),
      adjustment_amount: diff,
      effective_amount: Number(adjCorrected),
      normal_remuneration_pcb: Number(adjCorrected),
      additional_remuneration_pcb: 0,
      total_pcb: Number(adjCorrected),
      status: 'APPROVED' as const,
      finalized_at: new Date().toISOString(),
      included_in_accumulated_x: true,
      exclusion_reason: adjReason,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const currentLedger = activeEmployee.employee_pcb_history_ledger || [];
    const updated = [...currentLedger, newEntry];

    try {
      await onUpdateEmployee(activeEmployee.id, {
        employee_pcb_history_ledger: updated
      });
      const recalcResult = recalculatePCBForward({
        employee: { ...activeEmployee, employee_pcb_history_ledger: updated },
        assessmentYear: 2026,
        changedEffectiveMonth: Number(adjMonth),
        reason: adjReason,
        changedBy: adjRequestedBy || 'System User'
      });
      onShowNotification(
        'Manual Adjustment Approved',
        `Manual adjustment of RM ${diff.toFixed(2)} applied. Forward recalculation completed across ${recalcResult.monthsRecalculated.length} months.`,
        'success'
      );
    } catch (error) {
      console.error('[PCB Adjustment Save] Failed:', error);
    }
  };

  const handleReverseLedger = async (item: any) => {
    const userRole = localStorage.getItem('hr-nexus-user-role') || 'Employee';
    const isApprover = hasGlobalAdminPrivileges(userRole) || userRole === 'Payroll Tax Approver' || userRole === 'Administrator';
    if (!isApprover) {
      onShowNotification('Permission Denied', 'Only a Payroll Tax Approver or Global Administrator can authorize reversals.', 'error');
      return;
    }

    const reversalEntry = {
      id: `rev_${Date.now()}`,
      employee_id: activeEmployee.id,
      assessment_year: 2026,
      payroll_month: item.payroll_month,
      source_type: 'REVERSAL' as const,
      source_reference: `Reversal of ${item.id}`,
      source_record_id: item.id,
      original_amount: item.total_pcb,
      adjustment_amount: -item.total_pcb,
      effective_amount: -item.total_pcb,
      normal_remuneration_pcb: -item.normal_remuneration_pcb,
      additional_remuneration_pcb: -item.additional_remuneration_pcb,
      total_pcb: -item.total_pcb,
      status: 'APPROVED' as const,
      reversed_at: new Date().toISOString(),
      reversal_reference: item.id,
      included_in_accumulated_x: true,
      exclusion_reason: `Reversal of entry ${item.id}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const currentLedger = activeEmployee.employee_pcb_history_ledger || [];
    const updated = currentLedger.map(l => l.id === item.id ? { ...l, status: 'REVERSED' as const } : l);
    updated.push(reversalEntry);

    try {
      await onUpdateEmployee(activeEmployee.id, {
        employee_pcb_history_ledger: updated
      });
      recalculatePCBForward({
        employee: { ...activeEmployee, employee_pcb_history_ledger: updated },
        assessmentYear: 2026,
        changedEffectiveMonth: item.payroll_month,
        reason: `Reversal of entry ${item.id}`,
        changedBy: adjApprovedBy || 'System User'
      });
      onShowNotification('Entry Reversed', `Successfully reversed tax entry for month ${item.payroll_month}.`, 'success');
    } catch (error) {
      console.error('[PCB Reversal Save] Failed:', error);
    }
  };

  // Summarize Reconciliation Totals
  const activeResults = (activeEmployee.historicalPcbResults && activeEmployee.historicalPcbResults.length > 0)
    ? activeEmployee.historicalPcbResults.filter(r => r.payrollMonth >= Number(startMonth) && r.payrollMonth <= Number(endMonth))
    : previewResults;
    
  const annualCalculated = activeResults.reduce((acc, curr) => acc + curr.calculatedPCB, 0);
  const annualActual = activeResults.reduce((acc, curr) => acc + (curr.actualPCBDeducted || 0), 0);
  const annualVariance = annualActual - annualCalculated;

  const currentMonthForLedger = activeEmployee.historicalPayrollRecords && activeEmployee.historicalPayrollRecords.length > 0
    ? Math.min(12, Math.max(...activeEmployee.historicalPayrollRecords.map(r => r.payrollMonth)) + 1)
    : 10;

  const verifiedTP3 = (activeEmployee.employee_tp3_declarations || [])
    .filter(t => t.verificationStatus === 'VERIFIED' && t.taxYear === 2026);

  const finalizedPayrollHistory = (activeEmployee.employee_pcb_history_ledger || [])
    .filter(l => l.assessment_year === 2026);

  const historyX = calculateAccumulatedPCBHistory({
    employeeId: activeEmployee.id,
    assessmentYear: 2026,
    currentPayrollMonth: currentMonthForLedger,
    verifiedTP3Records: verifiedTP3,
    finalizedPayrollHistory: finalizedPayrollHistory
  });

  const actualAccumulated = historyX.accumulatedPCB_X;

  const expectedAccumulated = (activeEmployee.historicalPcbResults || [])
    .filter(r => r.payrollMonth < currentMonthForLedger)
    .reduce((sum, r) => sum + r.calculatedPCB, 0);

  const shortfall = expectedAccumulated - actualAccumulated;

  const remainingMonthsCount = 13 - currentMonthForLedger;

  const monthlyAdjVal = remainingMonthsCount > 0 ? shortfall / remainingMonthsCount : 0;

  return (
    <div className="space-y-6 text-left">
      <div className="bg-surface-container-low p-5 rounded-lg border border-neutral-border">
        <h3 className="font-bold text-sm text-primary uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <Sliders className="w-4 h-4 text-primary" /> Chronological PCB Processing Console
        </h3>
        <p className="text-[11px] text-on-surface-variant leading-relaxed">
          Reconstruct, audits, or recalculates monthly tax deduction histories chronologically based on actual historical monthly payroll records and effective-dated employee profiles.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 text-xs">
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Select Employee</label>
            <select
              value={selectedEmpId}
              onChange={(e) => {
                setSelectedEmpId(e.target.value);
                setHasCalculated(false);
                setPreviewResults([]);
              }}
              className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
            >
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.id})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Start Month</label>
            <select
              value={startMonth}
              onChange={(e) => setStartMonth(Number(e.target.value))}
              className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={m}>{MONTH_NAMES[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">End Month</label>
            <select
              value={endMonth}
              onChange={(e) => setEndMonth(Number(e.target.value))}
              className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={m}>{MONTH_NAMES[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Calculation Basis</label>
            <select
              value={calcBasis}
              onChange={(e) => setCalcBasis(e.target.value as HistoricalCalculationBasis)}
              className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="actual_deduction_history">Actual Deduction History (Audit)</option>
              <option value="corrected_recalculated_history">Corrected Recalculated History (Revised)</option>
            </select>
          </div>
        </div>

        <div className="mt-4 p-3 bg-amber-50/70 border border-amber-200 text-amber-900 rounded text-[10px] leading-relaxed flex gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 font-bold" />
          <div>
            <strong>Reconstruction Rule Notice:</strong> This process calculates PCB chronologically. Rebuilding or changing records in an earlier month affects accumulated variables and tax brackets, modifying calculated PCB for all subsequent months.
          </div>
        </div>

        <div className="mt-4 flex gap-2 justify-end">
          <button
            onClick={handlePreviewReconstruction}
            className="bg-zinc-100 text-zinc-800 border border-neutral-border text-xs font-semibold py-2 px-4 rounded hover:bg-zinc-200 cursor-pointer flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" /> Preview Reconstruction
          </button>
          <button
            onClick={handleRunReconstruction}
            className="bg-primary text-[#f7f0e0] text-xs font-semibold py-2 px-5 rounded hover:opacity-95 cursor-pointer flex items-center gap-1.5"
          >
            <Play className="w-4 h-4 text-[#f7f0e0]" /> Run & Save Reconstruction
          </button>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex border-b border-neutral-border text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab('reconstruction')}
          className={`py-2.5 px-4 cursor-pointer transition-colors border-b-2 ${
            activeSubTab === 'reconstruction' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          1. Reconciliation Report
        </button>
        <button
          onClick={() => setActiveSubTab('input_payroll')}
          className={`py-2.5 px-4 cursor-pointer transition-colors border-b-2 ${
            activeSubTab === 'input_payroll' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          2. Enter Historical Payroll Records
        </button>
        <button
          onClick={() => setActiveSubTab('input_profiles')}
          className={`py-2.5 px-4 cursor-pointer transition-colors border-b-2 ${
            activeSubTab === 'input_profiles' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          3. Manage Effective-Dated Profiles
        </button>
        <button
          onClick={() => setActiveSubTab('ledger_tp3')}
          className={`py-2.5 px-4 cursor-pointer transition-colors border-b-2 ${
            activeSubTab === 'ledger_tp3' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          4. PCB History Ledger & TP3
        </button>
      </div>

      {/* Reconciliation tab */}
      {activeSubTab === 'reconstruction' && (
        <div className="space-y-6">
          {/* Report Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 bg-neutral-50 rounded border border-neutral-border">
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider block">YTD Calculated PCB</span>
              <span className="text-sm font-mono font-bold text-primary">RM {annualCalculated.toLocaleString('en-US', {minimumFractionDigits:2})}</span>
            </div>
            <div className="p-3 bg-neutral-50 rounded border border-neutral-border">
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider block font-bold">YTD Actual Deducted</span>
              <span className="text-sm font-mono font-bold text-on-surface">RM {annualActual.toLocaleString('en-US', {minimumFractionDigits:2})}</span>
            </div>
            <div className="p-3 bg-neutral-50 rounded border border-neutral-border">
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider block font-bold">PCB Variance</span>
              <span className={`text-sm font-mono font-bold ${annualVariance < 0 ? 'text-error' : annualVariance > 0 ? 'text-green-700' : 'text-zinc-600'}`}>
                RM {annualVariance.toLocaleString('en-US', {minimumFractionDigits:2})}
              </span>
            </div>
            <div className="p-3 bg-neutral-50 rounded border border-neutral-border">
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider block">Audit Status</span>
              <span className={`text-[10px] font-bold inline-block px-2 py-0.5 rounded-full uppercase ${annualVariance !== 0 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                {annualVariance !== 0 ? 'Variance Detected' : 'Fully Matched'}
              </span>
            </div>
          </div>

          <div className="bg-white border border-neutral-border rounded-lg overflow-hidden shadow-xs">
            <div className="p-4 border-b border-neutral-border flex justify-between items-center bg-neutral-50">
              <h4 className="font-bold text-xs uppercase tracking-wider text-primary">
                Chronological PCB Reconciliation Report (2026)
              </h4>
              <span className="text-[10px] font-semibold text-on-surface-variant font-bold">
                Basis: <span className="font-bold text-primary uppercase font-mono">{lastUsedBasis}</span>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50/50 text-on-surface-variant font-bold border-b border-neutral-border uppercase tracking-wider text-[9px]">
                    <th className="p-3">Month</th>
                    <th className="p-3">Profile Applied</th>
                    <th className="p-3 text-right">Normal Income</th>
                    <th className="p-3 text-right">Additional Income</th>
                    <th className="p-3 text-right font-bold text-primary">Calculated PCB</th>
                    <th className="p-3 text-right font-bold">Actual PCB Deducted</th>
                    <th className="p-3 text-right">PCB Variance</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-border/60">
                  {activeResults.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-on-surface-variant italic">
                        No calculations have been run. Click "Run & Save Reconstruction" to analyze history.
                      </td>
                    </tr>
                  ) : (
                    activeResults.map(res => (
                      <tr key={res.payrollMonth} className="hover:bg-neutral-50/30">
                        <td className="p-3 font-semibold font-mono">{MONTH_NAMES[res.payrollMonth]}</td>
                        <td className="p-3 font-mono text-[10px] text-zinc-400">{res.effectiveEmployeeProfileVersion}</td>
                        <td className="p-3 text-right font-mono font-bold">RM {res.currentNormalRemuneration.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td className="p-3 text-right font-mono">RM {res.currentAdditionalRemuneration.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td className="p-3 text-right font-mono text-primary font-bold">RM {res.calculatedPCB.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td className="p-3 text-right font-mono font-bold text-zinc-700">RM {(res.actualPCBDeducted || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td className={`p-3 text-right font-mono font-bold ${res.pcbVariance && res.pcbVariance < 0 ? 'text-error' : res.pcbVariance && res.pcbVariance > 0 ? 'text-green-700' : 'text-zinc-500'}`}>
                          RM {(res.pcbVariance || 0).toLocaleString('en-US', {minimumFractionDigits:2})}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            res.status === 'variance_detected' 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {res.status}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => setSelectedBreakdownResult(res)}
                            className="bg-primary/10 text-primary border border-primary/20 rounded py-1 px-2.5 hover:bg-primary/20 text-[10px] font-bold cursor-pointer transition-colors uppercase tracking-wider"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* View PCB Calculation Breakdown Modal (Requirement 29) */}
          {selectedBreakdownResult && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
              <div className="bg-white rounded-lg border border-neutral-border shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col text-left">
                <div className="p-4 border-b border-neutral-border bg-neutral-50 flex justify-between items-center">
                  <h3 className="font-bold text-sm text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-4 h-4" /> MTD / PCB Detailed Calculation Breakdown
                  </h3>
                  <button 
                    onClick={() => setSelectedBreakdownResult(null)}
                    className="text-on-surface-variant hover:text-on-surface font-bold text-xs"
                  >
                    ✕ Close
                  </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6 text-xs leading-relaxed">
                  {/* Section A: Employee info */}
                  <div>
                    <h4 className="font-bold text-xs text-primary border-b pb-1 mb-2">A. Employee Statutory Profile</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-50 p-3 rounded border border-neutral-border/40">
                      <div><span className="text-zinc-500 block">Residence Status:</span> <strong>{selectedBreakdownResult.taxResidenceStatus || 'RESIDENT'}</strong></div>
                      <div><span className="text-zinc-500 block">Calculation Type:</span> <strong>{selectedBreakdownResult.calculationType || 'RESIDENT_PROGRESSIVE'}</strong></div>
                      <div><span className="text-zinc-500 block">Tax Category:</span> <strong>{selectedBreakdownResult.employeeCategory || 'CATEGORY_1'}</strong></div>
                      <div><span className="text-zinc-500 block">Qualifying Children (C):</span> <strong>{selectedBreakdownResult.C || 0}</strong></div>
                    </div>
                  </div>

                  {/* Section B & C: Remuneration & EPF inputs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-bold text-xs text-primary border-b pb-1 mb-2">B. Accumulated YTD Earnings</h4>
                      <table className="w-full">
                        <tbody>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Prior Remuneration (ΣY):</td><td className="py-1 text-right font-mono">RM {selectedBreakdownResult.Y.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Prior EPF (ΣK):</td><td className="py-1 text-right font-mono">RM {selectedBreakdownResult.K.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Prior PCB Paid (X):</td><td className="py-1 text-right font-mono">RM {selectedBreakdownResult.accumulatedPriorPCB.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Prior Zakat Paid (Z):</td><td className="py-1 text-right font-mono">RM {selectedBreakdownResult.accumulatedPriorZakat.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-primary border-b pb-1 mb-2">C. Current Month Earning Items</h4>
                      <table className="w-full">
                        <tbody>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Normal Remuneration (Y1):</td><td className="py-1 text-right font-mono">RM {selectedBreakdownResult.currentNormalRemuneration.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Normal EPF (K1):</td><td className="py-1 text-right font-mono">RM {selectedBreakdownResult.currentMonthEmployeeEPF.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Additional Remuneration (Yt):</td><td className="py-1 text-right font-mono">RM {selectedBreakdownResult.currentAdditionalRemuneration.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Current Zakat Offset:</td><td className="py-1 text-right font-mono">RM {(selectedBreakdownResult.currentZakat || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Section D & E: Projection & Reliefs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-bold text-xs text-primary border-b pb-1 mb-2">D. Future Projections</h4>
                      <table className="w-full">
                        <tbody>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Remaining Months (n):</td><td className="py-1 text-right font-mono">{selectedBreakdownResult.n}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Projected Remuneration (Y2):</td><td className="py-1 text-right font-mono">RM {selectedBreakdownResult.Y1.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Projected EPF Relief (K2):</td><td className="py-1 text-right font-mono">RM {selectedBreakdownResult.K2?.toLocaleString('en-US', {minimumFractionDigits: 2}) || '0.00'}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-primary border-b pb-1 mb-2">E. Deductions & Reliefs Capped</h4>
                      <table className="w-full">
                        <tbody>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Individual Relief (D):</td><td className="py-1 text-right font-mono">RM {selectedBreakdownResult.D.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Spouse Relief (S):</td><td className="py-1 text-right font-mono">RM {selectedBreakdownResult.S.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Child Relief (Q × C):</td><td className="py-1 text-right font-mono">RM {((selectedBreakdownResult.Q || 0) * 2000).toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">TP1 Relief (ΣLP + LP1):</td><td className="py-1 text-right font-mono">RM {(selectedBreakdownResult.qualifyingDeductions).toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Section F, G: Chargeable Income, brackets & results */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-bold text-xs text-primary border-b pb-1 mb-2">F. Chargeable Income (P) & Tax Table</h4>
                      <table className="w-full">
                        <tbody>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">P (Excl. Additional):</td><td className="py-1 text-right font-mono">RM {selectedBreakdownResult.PWithoutCurrentAdditional.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">P (Incl. Additional):</td><td className="py-1 text-right font-mono">RM {selectedBreakdownResult.PWithCurrentAdditional.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Progressive Bracket Base (M):</td><td className="py-1 text-right font-mono">RM {selectedBreakdownResult.M.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Rate (R) / Rebate (B):</td><td className="py-1 text-right font-mono">{(selectedBreakdownResult.R * 100).toFixed(1)}% / RM {selectedBreakdownResult.B.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-primary border-b pb-1 mb-2">G. Calculations & Final Output</h4>
                      <table className="w-full">
                        <tbody>
                          <tr className="border-b border-neutral-border/20"><td className="py-1 font-semibold text-primary">Normal PCB:</td><td className="py-1 text-right font-mono font-bold">RM {selectedBreakdownResult.normalRemunerationPCB.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1 font-semibold text-primary">Additional PCB:</td><td className="py-1 text-right font-mono font-bold">RM {selectedBreakdownResult.additionalRemunerationPCB.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b border-neutral-border/20"><td className="py-1">Pre-rounded PCB:</td><td className="py-1 text-right font-mono font-mono">RM {selectedBreakdownResult.finalPCBPreFiveSenRounding.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                          <tr className="border-b font-bold text-green-700 bg-green-50/50"><td className="py-1.5 px-2">Final Payable MTD / PCB:</td><td className="py-1.5 px-2 text-right font-mono font-mono">RM {selectedBreakdownResult.calculatedPCB.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input payroll tab */}
      {activeSubTab === 'input_payroll' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 bg-white border border-neutral-border rounded-lg p-5 shadow-sm">
            <h4 className="font-bold text-xs uppercase tracking-wider text-primary border-b border-neutral-100 pb-2 mb-4">
              Register Payroll Record
            </h4>
            <form onSubmit={handleAddPayrollRecord} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Payroll Month</label>
                <select
                  value={payMonth}
                  onChange={(e) => setPayMonth(Number(e.target.value))}
                  className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none"
                >
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                    <option key={m} value={m}>{MONTH_NAMES[m]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Basic Salary (RM)</label>
                <input
                  type="number" required
                  value={payBasic}
                  onChange={(e) => setPayBasic(Number(e.target.value))}
                  className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Fixed General Allowance (RM)</label>
                <input
                  type="number"
                  value={payAllowanceGen}
                  onChange={(e) => setPayAllowanceGen(Number(e.target.value))}
                  className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Overtime Paid (RM)</label>
                <input
                  type="number"
                  value={payOvertime}
                  onChange={(e) => setPayOvertime(Number(e.target.value))}
                  className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Contractual / Performance Bonus (RM)</label>
                <input
                  type="number"
                  value={payBonus}
                  onChange={(e) => setPayBonus(Number(e.target.value))}
                  className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Commission Earned (RM)</label>
                <input
                  type="number"
                  value={payCommission}
                  onChange={(e) => setPayCommission(Number(e.target.value))}
                  className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                />
              </div>
              <div className="bg-primary/5 p-3 rounded border border-primary/20">
                <label className="block text-[10px] font-bold text-primary uppercase mb-1">Actual PCB Deducted (RM)</label>
                <input
                  type="number" required
                  value={payActualPcb}
                  onChange={(e) => setPayActualPcb(Number(e.target.value))}
                  className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono text-primary font-semibold"
                />
                <span className="text-[9px] text-on-surface-variant block mt-1">Specify actual amount deducted on employee's payslip for comparison.</span>
              </div>
              <button
                type="submit"
                className="w-full bg-primary text-[#f7f0e0] font-semibold py-2 rounded hover:opacity-95 cursor-pointer"
              >
                Save Record & Trigger Recalculation
              </button>
            </form>
          </div>

          <div className="lg:col-span-8 bg-white border border-neutral-border rounded-lg p-5 shadow-sm text-xs">
            <h4 className="font-bold text-xs uppercase tracking-wider text-on-surface-variant border-b border-neutral-100 pb-2 mb-4">
              Registered Payroll Records (January–December 2026)
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-on-surface-variant font-bold border-b border-neutral-border uppercase tracking-wider text-[9px]">
                    <th className="p-2">Month</th>
                    <th className="p-2 text-right">Basic Salary</th>
                    <th className="p-2 text-right">General Allowance</th>
                    <th className="p-2 text-right">Overtime</th>
                    <th className="p-2 text-right">Bonus</th>
                    <th className="p-2 text-right">Commission</th>
                    <th className="p-2 text-right font-bold text-primary">Actual PCB Deducted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-border/60">
                  {!activeEmployee.historicalPayrollRecords || activeEmployee.historicalPayrollRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-on-surface-variant italic">
                        No historical payroll records registered yet. Fill out the form on the left to get started.
                      </td>
                    </tr>
                  ) : (
                    activeEmployee.historicalPayrollRecords.map(rec => (
                      <tr key={rec.payrollMonth} className="hover:bg-neutral-50/40">
                        <td className="p-2 font-semibold font-mono">{MONTH_NAMES[rec.payrollMonth]}</td>
                        <td className="p-2 text-right font-mono">RM {rec.basicSalary.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td className="p-2 text-right font-mono">RM {(rec.allowanceGeneral || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td className="p-2 text-right font-mono">RM {(rec.overtime || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td className="p-2 text-right font-mono">RM {(rec.bonusAmount || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td className="p-2 text-right font-mono">RM {(rec.commissionAmount || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td className="p-2 text-right font-mono font-bold text-primary">RM {rec.actualPCBDeducted.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Input profiles tab */}
      {activeSubTab === 'input_profiles' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 bg-white border border-neutral-border rounded-lg p-5 shadow-sm">
            <h4 className="font-bold text-xs uppercase tracking-wider text-primary border-b border-neutral-100 pb-2 mb-4">
              Add Effective Profile Snapshot
            </h4>
            <form onSubmit={handleAddEffectiveProfile} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Effective Date (YYYY-MM-DD)</label>
                <input
                  type="date" required
                  value={profEffectiveDate}
                  onChange={(e) => setProfEffectiveDate(e.target.value)}
                  className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Basic Salary (RM)</label>
                <input
                  type="number" required
                  value={profBasic}
                  onChange={(e) => setProfBasic(Number(e.target.value))}
                  className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Marital Status</label>
                <select
                  value={profMarital}
                  onChange={(e) => setProfMarital(e.target.value as any)}
                  className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Divorced">Divorced</option>
                  <option value="Widowed">Widowed</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Spouse Working Status</label>
                <select
                  value={profSpouseWorking}
                  onChange={(e) => setProfSpouseWorking(e.target.value as any)}
                  className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="No">No (Spouse Relief Applicable)</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Number of Dependants (Children)</label>
                <input
                  type="number" required min={0}
                  value={profDependants}
                  onChange={(e) => setProfDependants(Number(e.target.value))}
                  className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-primary text-[#f7f0e0] font-semibold py-2 rounded hover:opacity-95 cursor-pointer"
              >
                Register Snapshot Profile
              </button>
            </form>
          </div>

          <div className="lg:col-span-8 bg-white border border-neutral-border rounded-lg p-5 shadow-sm text-xs">
            <h4 className="font-bold text-xs uppercase tracking-wider text-on-surface-variant border-b border-neutral-100 pb-2 mb-4">
              Effective-Dated Snapshots Timeline
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-on-surface-variant font-bold border-b border-neutral-border uppercase tracking-wider text-[9px]">
                    <th className="p-2">Effective Date</th>
                    <th className="p-2 text-right">Basic Salary</th>
                    <th className="p-2">Marital Status</th>
                    <th className="p-2">Spouse Working</th>
                    <th className="p-2 text-center">Children Count</th>
                    <th className="p-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-border/60 font-mono text-[11px]">
                  {!activeEmployee.effectiveDatedProfiles || activeEmployee.effectiveDatedProfiles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-on-surface-variant italic font-sans text-xs">
                        No custom effective snapshots registered yet. Running default current active profile variables.
                      </td>
                    </tr>
                  ) : (
                    activeEmployee.effectiveDatedProfiles.map((prof, idx) => (
                      <tr key={idx} className="hover:bg-neutral-50/40">
                        <td className="p-2 font-bold text-primary">{prof.effectiveDate}</td>
                        <td className="p-2 text-right">RM {prof.basicSalary.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td className="p-2 uppercase font-sans text-[10px]">{prof.maritalStatus}</td>
                        <td className="p-2 uppercase font-sans text-[10px]">{prof.spouseIsWorking || 'No'}</td>
                        <td className="p-2 text-center">{prof.dependantsCount || 0}</td>
                        <td className="p-2 text-center">
                          <span className="bg-green-100 text-green-800 text-[9px] font-sans font-bold px-1.5 py-0.5 rounded">Active</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'ledger_tp3' && (
        <div className="space-y-6 text-xs">
          {/* Comparison Panel */}
          <div className="bg-surface-container-low border border-neutral-border rounded-lg p-5 shadow-sm">
            <h4 className="font-bold text-sm text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-primary" /> PCB Expected vs. Actual Comparison Panel
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4 text-center font-mono">
              <div className="bg-white border p-3 rounded">
                <div className="text-[10px] text-on-surface-variant font-bold uppercase mb-1">Expected Accumulated PCB</div>
                <div className="text-sm font-bold text-neutral-800">RM {expectedAccumulated.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="bg-white border p-3 rounded">
                <div className="text-[10px] text-on-surface-variant font-bold uppercase mb-1">Actual Accumulated PCB (X)</div>
                <div className="text-sm font-bold text-primary">RM {actualAccumulated.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="bg-white border p-3 rounded">
                <div className="text-[10px] text-on-surface-variant font-bold uppercase mb-1">Accumulated Shortfall</div>
                <div className="text-sm font-bold text-red-600">RM {shortfall.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="bg-white border p-3 rounded">
                <div className="text-[10px] text-on-surface-variant font-bold uppercase mb-1">Remaining Months (Incl. Current)</div>
                <div className="text-sm font-bold text-neutral-800">{remainingMonthsCount}</div>
              </div>
              <div className="bg-white border p-3 rounded">
                <div className="text-[10px] text-on-surface-variant font-bold uppercase mb-1">Spread Monthly Adjustment</div>
                <div className="text-sm font-bold text-neutral-800">RM {monthlyAdjVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 border rounded text-on-surface leading-relaxed text-[11px]">
              <strong>Explanation:</strong> The current PCB is RM {Math.abs(monthlyAdjVal).toFixed(2)} {monthlyAdjVal >= 0 ? 'higher' : 'lower'} because RM {Math.abs(shortfall).toFixed(2)} {shortfall >= 0 ? 'less' : 'more'} PCB was deducted during earlier months and the shortfall is being spread over {remainingMonthsCount} months.
            </div>

            <div className="mt-3 text-[10px] text-on-surface-variant leading-relaxed">
              <strong>Cumulative Formula:</strong> Current PCB = <code>(Estimated annual tax &minus; X &minus; Z) &divide; current and remaining payroll months</code>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Col - TP3 Declarations */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white border border-neutral-border rounded-lg p-5 shadow-sm">
                <h4 className="font-bold text-xs uppercase tracking-wider text-primary border-b border-neutral-100 pb-2 mb-4">
                  Form TP3 (Previous Employer) Declaration
                </h4>
                <form onSubmit={handleSaveTP3} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Previous Remuneration (RM)</label>
                      <input
                        type="number" required
                        value={tp3Remuneration}
                        onChange={(e) => setTp3Remuneration(Number(e.target.value))}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Previous Add. Remuneration (RM)</label>
                      <input
                        type="number"
                        value={tp3AddRemuneration}
                        onChange={(e) => setTp3AddRemuneration(Number(e.target.value))}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Previous EPF (RM)</label>
                      <input
                        type="number" required
                        value={tp3Epf}
                        onChange={(e) => setTp3Epf(Number(e.target.value))}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Previous Allowable Deduct (RM)</label>
                      <input
                        type="number"
                        value={tp3AllowableDeductions}
                        onChange={(e) => setTp3AllowableDeductions(Number(e.target.value))}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Previous PCB Paid (RM)</label>
                      <input
                        type="number" required
                        value={tp3Pcb}
                        onChange={(e) => setTp3Pcb(Number(e.target.value))}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Previous Zakat (RM)</label>
                      <input
                        type="number"
                        value={tp3Zakat}
                        onChange={(e) => setTp3Zakat(Number(e.target.value))}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Start Date</label>
                      <input
                        type="date" required
                        value={tp3StartDate}
                        onChange={(e) => setTp3StartDate(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">End Date</label>
                      <input
                        type="date" required
                        value={tp3EndDate}
                        onChange={(e) => setTp3EndDate(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Declaration Date</label>
                      <input
                        type="date" required
                        value={tp3DeclDate}
                        onChange={(e) => setTp3DeclDate(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Verification Status</label>
                      <select
                        value={tp3Status}
                        onChange={(e) => setTp3Status(e.target.value as any)}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option value="VERIFIED">Verified</option>
                        <option value="UNVERIFIED">Unverified</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Supporting Document File</label>
                    <input
                      type="text" required
                      value={tp3Doc}
                      onChange={(e) => setTp3Doc(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-primary text-[#f7f0e0] font-semibold py-2 rounded hover:opacity-95 cursor-pointer mt-2"
                  >
                    Save & Apply TP3 Form
                  </button>
                </form>
              </div>

              {/* Add Manual Adjustment */}
              <div className="bg-white border border-neutral-border rounded-lg p-5 shadow-sm">
                <h4 className="font-bold text-xs uppercase tracking-wider text-primary border-b border-neutral-100 pb-2 mb-4">
                  Add Approved Ledger Adjustment
                </h4>
                <form onSubmit={handleAddAdjustment} className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Target Month</label>
                      <select
                        value={adjMonth}
                        onChange={(e) => setAdjMonth(Number(e.target.value))}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                      >
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                          <option key={m} value={m}>{MONTH_NAMES[m]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Original PCB</label>
                      <input
                        type="number" required
                        value={adjOriginal}
                        onChange={(e) => setAdjOriginal(Number(e.target.value))}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Corrected PCB</label>
                      <input
                        type="number" required
                        value={adjCorrected}
                        onChange={(e) => setAdjCorrected(Number(e.target.value))}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Reason for Adjustment</label>
                    <input
                      type="text" required
                      value={adjReason}
                      onChange={(e) => setAdjReason(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Document Ref</label>
                      <input
                        type="text" required
                        value={adjDoc}
                        onChange={(e) => setAdjDoc(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Already Remitted?</label>
                      <select
                        value={adjRemitted}
                        onChange={(e) => setAdjRemitted(e.target.value as any)}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option value="No">No</option>
                        <option value="Yes">Yes (Will warn HR)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Requested By</label>
                      <input
                        type="text" required
                        value={adjRequestedBy}
                        onChange={(e) => setAdjRequestedBy(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Approver Signature</label>
                      <input
                        type="text" required
                        value={adjApprovedBy}
                        onChange={(e) => setAdjApprovedBy(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-green-700 text-[#f7f0e0] font-semibold py-2 rounded hover:opacity-95 cursor-pointer mt-2"
                  >
                    Add Approved Adjustment
                  </button>
                </form>
              </div>
            </div>

            {/* Right Col - Ledger Table */}
            <div className="lg:col-span-7 space-y-6">
              {/* Compliance & Validation Summary */}
              {historyX.exclusionReasons.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-900 leading-relaxed text-[11px] space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                    Ledger Validation Blocks ({historyX.exclusionReasons.length})
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px]">
                    {historyX.exclusionReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings panel */}
              {(!activeEmployee.employee_tp3_declarations || activeEmployee.employee_tp3_declarations.length === 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-900 leading-relaxed text-[11px] flex gap-2">
                  <AlertCircle className="w-4.5 h-4.5 text-amber-600 shrink-0 font-bold" />
                  <div>
                    <strong>Compliance Warning:</strong> Employee joined after January without a verified TP3 previous employer declaration. Please register a verified TP3 or declare that there was no previous employment this year.
                  </div>
                </div>
              )}

              {/* Ledger Entries List */}
              <div className="bg-white border border-neutral-border rounded-lg p-5 shadow-sm">
                <h4 className="font-bold text-xs uppercase tracking-wider text-on-surface-variant border-b border-neutral-100 pb-2 mb-4">
                  Canonical PCB History Ledger Entries (X Ledger)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-neutral-50 text-on-surface-variant font-bold border-b border-neutral-border uppercase tracking-wider text-[9px]">
                        <th className="p-2.5">Month</th>
                        <th className="p-2.5">Source Type</th>
                        <th className="p-2.5">Reference</th>
                        <th className="p-2.5 text-right">Original</th>
                        <th className="p-2.5 text-right">Effective</th>
                        <th className="p-2.5 text-center">X Status</th>
                        <th className="p-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-border/60 font-mono text-[11px]">
                      {(!activeEmployee.employee_pcb_history_ledger || activeEmployee.employee_pcb_history_ledger.length === 0) ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-on-surface-variant italic font-sans text-xs">
                            No ledger entries found. Please run reconstruction to populate payroll items.
                          </td>
                        </tr>
                      ) : (
                        activeEmployee.employee_pcb_history_ledger.map((item, idx) => (
                          <tr key={idx} className="hover:bg-neutral-50/40">
                            <td className="p-2.5 font-bold">{item.payroll_month === 0 ? 'TP3' : MONTH_NAMES[item.payroll_month].slice(0, 3)}</td>
                            <td className="p-2.5 text-[9px] uppercase font-sans text-on-surface-variant">{item.source_type.replace(/_/g, ' ')}</td>
                            <td className="p-2.5 text-[10px] text-primary truncate max-w-[120px]" title={item.source_reference}>{item.source_reference}</td>
                            <td className="p-2.5 text-right">RM {item.original_amount.toFixed(2)}</td>
                            <td className="p-2.5 text-right font-bold">RM {item.effective_amount.toFixed(2)}</td>
                            <td className="p-2.5 text-center">
                              <span className={`text-[9px] font-sans font-bold px-1.5 py-0.5 rounded ${
                                item.status === 'REVERSED' ? 'bg-red-100 text-red-800' :
                                item.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                                'bg-zinc-100 text-zinc-800'
                              }`}>{item.status}</span>
                            </td>
                            <td className="p-2.5 text-center">
                              {item.status !== 'REVERSED' && item.source_type !== 'REVERSAL' && (
                                <button
                                  onClick={() => handleReverseLedger(item)}
                                  className="text-red-600 hover:text-red-800 text-[10px] font-bold border border-red-200 px-1.5 py-0.5 rounded bg-red-50/50 hover:bg-red-50 transition-colors"
                                >
                                  Reverse
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
