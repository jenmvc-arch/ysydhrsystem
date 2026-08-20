/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Minus, 
  Plus, 
  RotateCw, 
  Printer, 
  Download,
  AlertCircle,
  Building2,
  User,
  Mail,
  Briefcase,
  Award
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { PayslipPDFDocument } from './PayslipPDFDocument';
import { Employee, CorporateEntity, PayrollDocumentDisplaySettings, PayrollRecord2026 } from '../types';
import { calculatePayslip, getHrdCorpLocalWorkerCount, getPayrollDocumentDisplaySettings, getPayrollDocumentFieldLabels, getPayrollDocumentProfile, getPayrollDocumentProfileForRecord, getPayrollBasicSalary, getSalaryProration, getDirectLogoUrl, calculateSocsoContribution, getEmployeeForMonth, getEffectiveTerminationDateForDate, getSeparatePayoutConfig, isSeparatePayrollRecord } from '../data';
import { formatToDDMMMYYYY } from '../lib/dateUtils';

interface PayslipDocumentViewProps {
  employees: Employee[];
  selectedEmployeeId: string;
  onBack: () => void;
  onShowNotification: (title: string, message: string) => void;
  activeEntity?: CorporateEntity;
  isPrintView?: boolean;
  payMonth?: number;
  payYear?: number;
  displaySettingsOverride?: PayrollDocumentDisplaySettings;
  payrollRecordOverride?: PayrollRecord2026;
  userRole?: string;
  entities?: CorporateEntity[];
  allEmployeesForHrdCorp?: Employee[];
}

export default function PayslipDocumentView({
  employees,
  selectedEmployeeId,
  onBack,
  onShowNotification,
  activeEntity,
  isPrintView = false,
  payMonth: propPayMonth,
  payYear: propPayYear,
  displaySettingsOverride,
  payrollRecordOverride,
  userRole = 'Global Administrator',
  entities,
  allEmployeesForHrdCorp
}: PayslipDocumentViewProps) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  const rawActiveEmployee = employees.find(e => e.id === selectedEmployeeId) || employees[0];

  if (!rawActiveEmployee) {
    return (
      <div className="p-8 text-center bg-white rounded-lg border border-neutral-border">
        No active employee found for document viewing.
      </div>
    );
  }

  const params = new URLSearchParams(window.location.search);
  const payMonth = propPayMonth !== undefined ? propPayMonth : (params.get('month') ? parseInt(params.get('month')!, 10) : 10);
  const payYear = propPayYear !== undefined ? propPayYear : (params.get('year') ? parseInt(params.get('year')!, 10) : 2026);
  const hrdCorpLocalWorkerCount = getHrdCorpLocalWorkerCount(
    allEmployeesForHrdCorp || employees,
    payMonth,
    payYear,
    rawActiveEmployee.entityId
  );

  const activeEmployee = getEmployeeForMonth(rawActiveEmployee, payMonth, payYear);
  const activePayrollRecord = payrollRecordOverride || null;
  const documentProfile = activePayrollRecord
    ? getPayrollDocumentProfileForRecord(activeEmployee, activePayrollRecord)
    : getPayrollDocumentProfile(activeEmployee);
  const documentFieldLabels = getPayrollDocumentFieldLabels(documentProfile);
  const displaySettings = {
    ...(activePayrollRecord?.displaySettingsSnapshot || getPayrollDocumentDisplaySettings(activeEmployee)),
    ...(displaySettingsOverride || {})
  };
  if (!documentProfile.statutoryEnabled) {
    displaySettings.showEpfNumber = false;
    displaySettings.showEmployerContributions = false;
  }
  const isSeparatePayoutDocument = !!activePayrollRecord && isSeparatePayrollRecord(activePayrollRecord);
  const payoutConfig = isSeparatePayoutDocument && activePayrollRecord?.payoutKind && activePayrollRecord.payoutKind !== 'regular'
    ? getSeparatePayoutConfig(activePayrollRecord.payoutKind)
    : null;
  const payrollDocumentEmployee = activePayrollRecord
    ? {
      ...activeEmployee,
      basicSalary: isSeparatePayoutDocument ? 0 : (activePayrollRecord.basicSalary ?? activeEmployee.basicSalary),
      allowanceGeneral: isSeparatePayoutDocument ? 0 : activePayrollRecord.allowanceGeneral ?? activeEmployee.allowanceGeneral,
      allowanceTransport: isSeparatePayoutDocument ? 0 : activePayrollRecord.allowanceTransport ?? activeEmployee.allowanceTransport,
      allowanceParking: isSeparatePayoutDocument ? 0 : activePayrollRecord.allowanceParking ?? activeEmployee.allowanceParking,
      allowanceMeal: isSeparatePayoutDocument ? 0 : activePayrollRecord.allowanceMeal ?? activeEmployee.allowanceMeal,
      allowanceAccommodation: isSeparatePayoutDocument ? 0 : activePayrollRecord.allowanceAccommodation ?? activeEmployee.allowanceAccommodation,
      allowancePhone: isSeparatePayoutDocument ? 0 : activePayrollRecord.allowancePhone ?? activeEmployee.allowancePhone,
      overtime: isSeparatePayoutDocument ? 0 : activePayrollRecord.overtime ?? activeEmployee.overtime,
      bonusAmount: isSeparatePayoutDocument ? Number(activePayrollRecord.bonusAmount || 0) : (activePayrollRecord.bonusAmount ?? activeEmployee.bonusAmount),
      bonusDesc: activePayrollRecord.bonusDesc ?? activeEmployee.bonusDesc,
      commissionAmount: isSeparatePayoutDocument ? Number(activePayrollRecord.commissionAmount || 0) : (activePayrollRecord.commissionAmount ?? activeEmployee.commissionAmount),
      commissionDesc: activePayrollRecord.commissionDesc ?? activeEmployee.commissionDesc,
      backPayAmount: isSeparatePayoutDocument ? 0 : activePayrollRecord.backPayAmount ?? activeEmployee.backPayAmount,
      backPayDesc: activePayrollRecord.backPayDesc ?? activeEmployee.backPayDesc,
      awsAmount: isSeparatePayoutDocument ? 0 : activePayrollRecord.awsAmount ?? activeEmployee.awsAmount,
      awsDesc: activePayrollRecord.awsDesc ?? activeEmployee.awsDesc,
      compensationAmount: isSeparatePayoutDocument ? Number(activePayrollRecord.compensationAmount || 0) : activePayrollRecord.compensationAmount ?? activeEmployee.compensationAmount,
      compensationDesc: activePayrollRecord.compensationDesc ?? activeEmployee.compensationDesc,
      reimbursementAmount: isSeparatePayoutDocument ? Number(activePayrollRecord.reimbursementAmount || 0) : (activePayrollRecord.reimbursementAmount ?? activeEmployee.reimbursementAmount),
      reimbursementDesc: activePayrollRecord.reimbursementDesc ?? activeEmployee.reimbursementDesc,
      unpaidLeave: activePayrollRecord.unpaidLeave ?? activeEmployee.unpaidLeave,
      incompleteMonthDeduction: activePayrollRecord.incompleteMonthDeduction ?? activeEmployee.incompleteMonthDeduction,
      deductionInLieu: activePayrollRecord.deductionInLieu ?? activeEmployee.deductionInLieu,
      deductionCp38: activePayrollRecord.deductionCp38 ?? activeEmployee.deductionCp38,
      deductionOthers: activePayrollRecord.deductionOthers ?? activeEmployee.deductionOthers,
      deductionOthersDesc: activePayrollRecord.deductionOthersDesc ?? activeEmployee.deductionOthersDesc,
      payslipDescriptions: activePayrollRecord.payslipDescriptions ?? activeEmployee.payslipDescriptions,
      contractStatutoryTreatment: activePayrollRecord.statutoryTreatment ?? activeEmployee.contractStatutoryTreatment,
      eligibleForStatutory: activePayrollRecord.statutoryTreatment === 'with_statutory' ? 'Yes' : activePayrollRecord.statutoryTreatment === 'without_statutory' ? 'No' : activeEmployee.eligibleForStatutory,
      paymentDate: activePayrollRecord.paymentDate || activeEmployee.paymentDate
    }
    : activeEmployee;
  const breakdown = activePayrollRecord
    ? calculatePayslip(payrollDocumentEmployee, payMonth, payYear, {
      basicSalaryOverride: isSeparatePayoutDocument ? 0 : payrollDocumentEmployee.basicSalary,
      statutorySalaryOverride: isSeparatePayoutDocument
        ? ((activePayrollRecord.payoutKind && activePayrollRecord.payoutKind !== 'regular')
          ? Number((activePayrollRecord.payoutKind === 'bonus'
            ? activePayrollRecord.bonusAmount
            : activePayrollRecord.payoutKind === 'incentive_commission'
              ? activePayrollRecord.commissionAmount
              : activePayrollRecord.reimbursementAmount) || 0)
          : payrollDocumentEmployee.basicSalary)
        : undefined,
      statutoryEligibilityOverride: isSeparatePayoutDocument ? documentProfile.statutoryEnabled : undefined,
      ignoreSavedStatutory: true,
      hrdCorpLocalWorkerCount,
      hrdCorpVoluntaryOptIn: true,
      statutoryOverrides: {
        epfEmployee: activePayrollRecord.epfEmployee,
        epfEmployer: activePayrollRecord.epfEmployer,
        socsoEmployee: activePayrollRecord.socsoEmployee,
        socsoEmployer: activePayrollRecord.socsoEmployer,
        lindung24Employee: activePayrollRecord.lindung24Employee,
        eisEmployee: activePayrollRecord.eisEmployee,
        eisEmployer: activePayrollRecord.eisEmployer,
        taxPcb: activePayrollRecord.actualPCBDeducted
      }
    })
    : calculatePayslip(rawActiveEmployee, payMonth, payYear, {
      hrdCorpLocalWorkerCount,
      hrdCorpVoluntaryOptIn: true
    });
  const employeeEntity = entities?.find(ent => ent.id === activeEmployee.entityId) || activeEntity;
  const lastWorkingDay = getEffectiveTerminationDateForDate(
    payrollDocumentEmployee,
    `${payYear}-${String(payMonth).padStart(2, '0')}-${new Date(payYear, payMonth, 0).getDate()}`
  );
  const getDescription = (key: keyof NonNullable<Employee['payslipDescriptions']>, fallback: string) =>
    payrollDocumentEmployee.payslipDescriptions?.[key] || fallback;
  const getLineNote = (field: string) => activePayrollRecord?.lineNotes?.[field] || '';
  const renderLineDescription = (label: React.ReactNode, field: string) => {
    const note = getLineNote(field);
    return (
      <div className="min-w-0">
        <span className="block">{label}</span>
        {note && (
          <span className="mt-0.5 block whitespace-pre-line text-[10px] font-normal leading-relaxed text-[#6B6B6B]">
            {note}
          </span>
        )}
      </div>
    );
  };

  const basicSalaryForSocso = isSeparatePayoutDocument ? 0 : getPayrollBasicSalary(rawActiveEmployee, payMonth, payYear);
  const overtimeForSocso = payrollDocumentEmployee.overtime || 0;
  const commissionForSocso = payrollDocumentEmployee.commissionAmount || 0;
  const allowanceGenForSocso = payrollDocumentEmployee.allowanceGeneral || 0;
  const allowanceTransForSocso = payrollDocumentEmployee.allowanceTransport !== undefined ? payrollDocumentEmployee.allowanceTransport : (payrollDocumentEmployee.transportAllowance || 0);
  const allowanceParkForSocso = payrollDocumentEmployee.allowanceParking || 0;
  const allowanceMlForSocso = payrollDocumentEmployee.allowanceMeal || 0;
  const allowanceAccomForSocso = payrollDocumentEmployee.allowanceAccommodation !== undefined ? payrollDocumentEmployee.allowanceAccommodation : (payrollDocumentEmployee.housingAllowance || 0);
  const allowancePhForSocso = payrollDocumentEmployee.allowancePhone || 0;
  const backPayForSocso = payrollDocumentEmployee.backPayAmount || 0;
  const unpaidLeaveForSocso = payrollDocumentEmployee.unpaidLeave || 0;

  const payrollItemsForSocso = [
    { code: 'basic_salary', amount: basicSalaryForSocso },
    { code: 'overtime', amount: overtimeForSocso },
    { code: 'commission', amount: commissionForSocso },
    { code: 'allowance_general', amount: allowanceGenForSocso },
    { code: 'allowance_transport', amount: allowanceTransForSocso },
    { code: 'allowance_parking', amount: allowanceParkForSocso },
    { code: 'allowance_meal', amount: allowanceMlForSocso },
    { code: 'allowance_accommodation', amount: allowanceAccomForSocso },
    { code: 'allowance_phone', amount: allowancePhForSocso },
    { code: 'backpay', amount: backPayForSocso }
  ];
  if (unpaidLeaveForSocso > 0) {
    payrollItemsForSocso.push({ code: 'unpaid_leave', amount: unpaidLeaveForSocso });
  }

  const socsoRes = calculateSocsoContribution({
    employee: payrollDocumentEmployee,
    payrollPeriod: `${payYear}-${String(payMonth).padStart(2, '0')}`,
    payrollItems: payrollItemsForSocso
  });
  const socsoEmployerScale = socsoRes.employerSocsoTotal > 0
    ? breakdown.socsoEmployerVal / socsoRes.employerSocsoTotal
    : 0;
  const socsoEmployerInjury = socsoRes.employerEmploymentInjury * socsoEmployerScale;
  const socsoEmployerInvalidity = breakdown.socsoEmployerVal - socsoEmployerInjury;

  const salaryProration = getSalaryProration(payrollDocumentEmployee, payMonth, payYear);
  const actualBasic = isSeparatePayoutDocument ? 0 : payrollDocumentEmployee.basicSalary;

  const monthNameForPeriod = new Date(payYear, payMonth - 1).toLocaleDateString('en-US', { month: 'long' });
  const lastDayForPeriod = new Date(payYear, payMonth, 0).getDate();
  const payPeriodString = `01 ${monthNameForPeriod} ${payYear} – ${lastDayForPeriod} ${monthNameForPeriod} ${payYear}`;

  const handleZoomIn = () => {
    if (zoom < 150) setZoom(prev => prev + 10);
  };

  const handleZoomOut = () => {
    if (zoom > 70) setZoom(prev => prev - 10);
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handlePrint = () => {
    const monthsList = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const formattedMonthYear = `${monthsList[payMonth - 1]}${payYear}`;
    const cleanEmpName = activeEmployee.name.replace(/\s+/g, '_');
    const documentFileLabel = documentProfile.documentType.replace(/\s+/g, '_');
    const fileName = `${cleanEmpName}_${formattedMonthYear}_${documentFileLabel}.pdf`;
    onShowNotification('Print Job Sent', `Sending ${fileName} to your configured system printer.`);
    window.print();
  };

  const handleDownload = async () => {
    const monthsList = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const formattedMonthYear = `${monthsList[payMonth - 1]}${payYear}`;
    const cleanEmpName = activeEmployee.name.replace(/\s+/g, '_');
    const documentFileLabel = documentProfile.documentType.replace(/\s+/g, '_');
    const fileName = `${cleanEmpName}_${formattedMonthYear}_${documentFileLabel}.pdf`;
    onShowNotification('Download Started', `Generating and downloading ${fileName} in your browser...`);
    
    try {
      const doc = (
        <PayslipPDFDocument
          employee={activeEmployee}
          entity={employeeEntity || activeEntity || (entities && entities[0])!}
          month={payMonth}
          year={payYear}
          payrollRecordOverride={activePayrollRecord || undefined}
          displaySettingsOverride={displaySettingsOverride}
          hrdCorpLocalWorkerCount={hrdCorpLocalWorkerCount}
        />
      );
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('[PDF Download] Failed client-side generation:', err);
      onShowNotification('Download Failed', `Could not generate PDF. Please try print to PDF option.`);
    }
  };

  const themeStyles = {} as React.CSSProperties;

  return (
    <div 
      className={isPrintView ? "bg-white w-full select-text text-left flex justify-center" : "flex flex-col h-screen w-full bg-surface-container-highest overflow-hidden animate-in fade-in duration-200"}
      style={themeStyles}
    >
      
      {/* Viewer Toolbar */}
      {!isPrintView && (
        <div className="h-14 bg-zinc-900 flex items-center justify-between px-4 shadow-md z-10 shrink-0 select-none">
          {/* Left Controls */}
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="text-white hover:bg-white/10 p-2 rounded-full transition-colors flex items-center justify-center cursor-pointer"
              title="Go Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col text-left">
              <span className="text-white text-xs font-semibold truncate max-w-[200px] md:max-w-[400px]">
                {documentProfile.documentType.replace(/\s+/g, '_')}_{activeEmployee.id}_{activeEmployee.name.replace(/\s+/g, '_').toUpperCase()}_{payYear}-{String(payMonth).padStart(2, '0')}.pdf
              </span>
              <span className="text-gray-400 text-[10px] uppercase tracking-wider font-semibold">
                {employeeEntity?.name || 'Corporate Subsidiary'}
              </span>
            </div>
          </div>

          {/* Center Controls (Zoom & Page) - Hidden on Mobile */}
          <div className="hidden md:flex items-center gap-3 bg-black/20 rounded px-2.5 py-1">
            <button 
              onClick={handleZoomOut}
              className="text-white hover:bg-white/10 p-1 rounded transition-colors flex items-center justify-center cursor-pointer"
              title="Zoom Out"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-white text-xs font-bold px-2 w-[45px] text-center">{zoom}%</span>
            <button 
              onClick={handleZoomIn}
              className="text-white hover:bg-white/10 p-1 rounded transition-colors flex items-center justify-center cursor-pointer"
              title="Zoom In"
            >
              <Plus className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-white/20 mx-1" />
            <span className="text-white text-xs font-semibold px-2">1 / 1</span>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            <button 
              onClick={handleRotate}
              className="text-white hover:bg-white/10 p-2 rounded-full transition-colors flex items-center justify-center cursor-pointer" 
              title="Rotate 90°"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button 
              onClick={handlePrint}
              className="text-white hover:bg-white/10 p-2 rounded-full transition-colors flex items-center justify-center cursor-pointer" 
              title="Print Document"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button 
              onClick={handleDownload}
              className="text-white hover:bg-white/10 p-2 rounded-full transition-colors flex items-center justify-center cursor-pointer" 
              title="Download PDF"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Viewer Canvas (Scrollable) */}
      <div className={isPrintView ? "w-full flex justify-center" : "flex-1 overflow-y-auto p-4 md:p-8 flex justify-center items-start"}>
        {/* Document (Payslip Page) */}
        <div 
          id="payslip-pdf-content"
          style={{ 
            transform: isPrintView ? 'none' : `scale(${zoom / 100}) rotate(${rotation}deg)`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease-out',
            ...themeStyles
          }}
          className={isPrintView ? "bg-white w-full max-w-[800px] min-h-[960px] p-8 md:p-12 text-left relative" : "bg-white w-full max-w-[800px] min-h-[960px] shadow-2xl my-4 p-8 md:p-12 border border-neutral-border/40 text-left select-text relative"}
        >
          {/* Subtle PDF watermark/grid header */}
          <div className="absolute top-2 right-4 text-[9px] text-on-surface-variant/30 font-mono select-none">
            CONFIDENTIAL - STRICTLY PRIVATE
          </div>

          {/* Option A Branding Header */}
          <div className="flex justify-between items-stretch border-b-4 border-primary pb-4 mb-6 select-none bg-white relative">
            <div className="flex items-start gap-4 py-2">
              {/* Logo container */}
              <div className="w-44 h-16 rounded bg-white flex items-center justify-center overflow-hidden shrink-0 relative">
                <img 
                  src="/redpoint-logo.png" 
                  alt="YSYD HRMS Logo"
                  className="w-full h-full object-contain" 
                />
              </div>

              {/* Company Details */}
              <div className="text-left text-[#333333]">
                <h1 className="text-2xl font-black text-primary tracking-tight font-sans mb-1 leading-tight">
                  {employeeEntity?.name || 'Company not configured'}
                </h1>
                {employeeEntity?.registrationNumber && (
                  <p className="text-[10px] text-[#333333] font-mono font-bold mt-0.5">
                    Co. Reg: {employeeEntity.registrationNumber}
                  </p>
                )}
                {displaySettings.showCompanyAddress && (
                  <div className="flex items-start gap-1 mt-1 text-[11px] text-[#333333] leading-normal max-w-[400px]">
                    <span className="text-primary mt-0.5 shrink-0 font-bold">📍</span>
                    <p className="font-medium">{employeeEntity?.address || 'No registered corporate address'}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right side banner block */}
            <div className="bg-primary text-white px-6 py-4 flex flex-col justify-center items-center rounded-l-lg min-w-[140px] text-center self-stretch">
              <span className="text-xs uppercase tracking-widest font-black opacity-80 text-surface">{documentProfile.documentType.toUpperCase()}</span>
              <span className="text-sm font-bold mt-1 font-mono">
                {new Date(payYear, payMonth - 1).toLocaleDateString('en-US', {month: 'short', year: 'numeric'})}
              </span>
              {activePayrollRecord?.payoutTitle && (
                <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-surface">{activePayrollRecord.payoutTitle}</span>
              )}
            </div>
          </div>
          {activePayrollRecord?.payoutDescription && (
            <div className="mb-6 rounded border border-[#E5DED5] bg-white px-4 py-3 text-xs text-[#5a352b]">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-primary">Payout Description</span>
              <p className="mt-1 whitespace-pre-line leading-relaxed">{activePayrollRecord.payoutDescription}</p>
            </div>
          )}
          {/* Employee Details Card (Option A styled) */}
          <div className="bg-surface-container-low border border-neutral-border rounded-lg p-5 mb-6 text-left select-none">
            {/* Title with Deep Red icon */}
            <div className="flex items-center gap-2 mb-3 border-b border-neutral-border pb-2 text-primary">
              <User className="w-4 h-4 text-primary" />
              <span className="text-xs font-black uppercase tracking-wider">{documentFieldLabels.detailsTitle}</span>
            </div>

            {/* Employee Name */}
            <h2 className="text-lg font-black text-[#333333] uppercase mb-4 tracking-tight">
              {payrollDocumentEmployee.name}
            </h2>

            {/* 3-Column Layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-[#333333]">
              {/* Left Group */}
              <div className="space-y-2">
                {displaySettings.showTin && (
                  <div className="grid grid-cols-[145px_1fr] gap-2 py-0.5 text-left">
                    <span className="font-semibold text-[#6B6B6B]">TIN / Tax Number</span>
                    <span className="font-mono font-bold text-[#333333]">{activeEmployee.taxNumber || 'IG 29068110030'}</span>
                  </div>
                )}
                {displaySettings.showEpfNumber && (
                  <div className="grid grid-cols-[145px_1fr] gap-2 py-0.5 text-left">
                    <span className="font-semibold text-[#6B6B6B]">EPF Member Number</span>
                    <span className="font-mono font-bold text-[#333333]">{activeEmployee.epfNumber || '-'}</span>
                  </div>
                )}
                {displaySettings.showNricPassport && (
                  <div className="grid grid-cols-[145px_1fr] gap-2 py-0.5 text-left">
                    <span className="font-semibold text-[#6B6B6B]">NRIC / Passport</span>
                    <span className="font-mono font-bold text-[#333333]">{activeEmployee.nricPassport || '-'}</span>
                  </div>
                )}
                {displaySettings.showDateJoined && (
                  <div className="grid grid-cols-[145px_1fr] gap-2 py-0.5 text-left">
                    <span className="font-semibold text-[#6B6B6B]">{documentFieldLabels.dateJoined}</span>
                    <span className="font-mono font-bold text-[#333333]">{formatToDDMMMYYYY(activeEmployee.dateOfJoined)}</span>
                  </div>
                )}
                {lastWorkingDay && displaySettings.showLastWorkingDay && (
                  <div className="grid grid-cols-[145px_1fr] gap-2 py-0.5 text-left">
                    <span className="font-semibold text-[#6B6B6B]">Last Working Day</span>
                    <span className="font-mono font-bold text-[#A32626]">{formatToDDMMMYYYY(lastWorkingDay)}</span>
                  </div>
                )}
                <div className="grid grid-cols-[145px_1fr] gap-2 py-0.5 text-left">
                  <span className="font-semibold text-[#6B6B6B]">{documentFieldLabels.employmentStatus}</span>
                  <span className="font-bold text-[#333333]">{activeEmployee.employmentType || 'Confirmation'}</span>
                </div>
              </div>

              {/* Middle Group */}
              <div className="space-y-2">
                {displaySettings.showEmail && (
                  <div className="grid grid-cols-[115px_1fr] gap-2 py-0.5 text-left">
                    <span className="font-semibold text-[#6B6B6B]">Email Address</span>
                    <span className="font-bold text-[#333333] truncate" title={activeEmployee.email}>
                      {activeEmployee.email}
                    </span>
                  </div>
                )}
                {displaySettings.showDepartment && (
                  <div className="grid grid-cols-[115px_1fr] gap-2 py-0.5 text-left">
                    <span className="font-semibold text-[#6B6B6B]">Department</span>
                    <span className="font-bold text-[#333333]">{activeEmployee.department}</span>
                  </div>
                )}
                {displaySettings.showDesignation && (
                  <div className="grid grid-cols-[115px_1fr] gap-2 py-0.5 text-left">
                    <span className="font-semibold text-[#6B6B6B]">{documentFieldLabels.designation}</span>
                    <span className="font-bold text-[#333333]">{activeEmployee.designation}</span>
                  </div>
                )}
                <div className="grid grid-cols-[115px_1fr] gap-2 py-0.5 text-left">
                  <span className="font-semibold text-[#6B6B6B]">Payment Date</span>
                  <span className="font-mono font-bold text-[#333333]">{formatToDDMMMYYYY(activeEmployee.paymentDate || `${payYear}-${String(payMonth).padStart(2, '0')}-28`)}</span>
                </div>
              </div>

              {/* Right Group with vertical divider */}
              {displaySettings.showBankAccount && (
              <div className="border-t md:border-t-0 md:border-l border-[#E5DED5] pt-4 md:pt-0 md:pl-6 text-left">
                <div className="flex items-center gap-2 mb-2 text-[#A32626]">
                  <Building2 className="w-4 h-4 text-[#A32626]" />
                  <span className="text-xs font-black uppercase tracking-wider">Bank Details</span>
                </div>
                <p className="text-[10px] text-[#6B6B6B] font-semibold uppercase tracking-wider mb-1">Bank Account</p>
                
                <div className="flex items-center gap-2 bg-white/40 p-2 rounded border border-[#E5DED5]/60">
                  <p className="font-mono font-bold text-xs flex-1 break-all text-[#333333]">
                    {(() => {
                      const acc = String(activeEmployee.accountNo || '');
                      if (!acc) return 'Bank account not available.';
                      return `${activeEmployee.bankName || 'N/A'} - ${acc}`;
                    })()}
                  </p>
                </div>
              </div>
              )}
            </div>
          </div>

          {/* Financial Data Table split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
            {/* Earnings Table */}
            <div className="bg-white border border-[#E5DED5] rounded-lg p-4">
              <div className="bg-[#A32626] text-white px-3 py-2 rounded font-black text-xs uppercase tracking-wider mb-4">
                Earnings & Additions
              </div>
              <table className="w-full text-xs text-[#333333]">
                <thead>
                  <tr className="border-b border-[#E5DED5] text-[10px] uppercase font-black text-[#6B6B6B]">
                    <th className="py-2 text-left">Description</th>
                    <th className="py-2 text-right">Amount (RM)</th>
                  </tr>
                </thead>
	                <tbody className="divide-y divide-[#E5DED5]/40">
                  {!isSeparatePayoutDocument && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(
                        salaryProration.isProrated ? `Prorated ${getDescription('basicSalary', documentProfile.compensationLabel)}` : getDescription('basicSalary', documentProfile.compensationLabel),
                        'basicSalary'
                      )}</td>
                      <td className="py-2 text-right font-mono font-bold">{actualBasic.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}

	                  {displaySettings.showEarningsDetails && (
	                    <>
	                  {/* Allowances */}
                  {(payrollDocumentEmployee.allowanceGeneral || 0) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('allowanceGeneral', 'General Allowance'), 'allowanceGeneral')}</td>
                      <td className="py-2 text-right font-mono font-bold">{(payrollDocumentEmployee.allowanceGeneral || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}
                  {(payrollDocumentEmployee.allowanceTransport !== undefined ? payrollDocumentEmployee.allowanceTransport : payrollDocumentEmployee.transportAllowance) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('allowanceTransport', 'Transport Allowance'), 'allowanceTransport')}</td>
                      <td className="py-2 text-right font-mono font-bold">{Number(payrollDocumentEmployee.allowanceTransport !== undefined ? payrollDocumentEmployee.allowanceTransport : payrollDocumentEmployee.transportAllowance).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}
                  {(payrollDocumentEmployee.allowanceParking || 0) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('allowanceParking', 'Parking Allowance'), 'allowanceParking')}</td>
                      <td className="py-2 text-right font-mono font-bold">{(payrollDocumentEmployee.allowanceParking || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}
                  {(payrollDocumentEmployee.allowanceMeal || 0) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('allowanceMeal', 'Meal Allowance'), 'allowanceMeal')}</td>
                      <td className="py-2 text-right font-mono font-bold">{(payrollDocumentEmployee.allowanceMeal || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}
                  {(payrollDocumentEmployee.allowanceAccommodation !== undefined ? payrollDocumentEmployee.allowanceAccommodation : payrollDocumentEmployee.housingAllowance) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('allowanceAccommodation', 'Accommodation Allowance'), 'allowanceAccommodation')}</td>
                      <td className="py-2 text-right font-mono font-bold">{Number(payrollDocumentEmployee.allowanceAccommodation !== undefined ? payrollDocumentEmployee.allowanceAccommodation : payrollDocumentEmployee.housingAllowance).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}
                  {(payrollDocumentEmployee.allowancePhone || 0) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('allowancePhone', 'Phone Allowance'), 'allowancePhone')}</td>
                      <td className="py-2 text-right font-mono font-bold">{(payrollDocumentEmployee.allowancePhone || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}

                  {(payrollDocumentEmployee.overtime || 0) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('overtime', 'Overtime'), 'overtime')}</td>
                      <td className="py-2 text-right font-mono font-bold">{(payrollDocumentEmployee.overtime || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}

                  {/* Supplemental Payments */}
                  {((payrollDocumentEmployee.bonusAmount !== undefined ? payrollDocumentEmployee.bonusAmount : payrollDocumentEmployee.performanceBonus) || 0) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(payrollDocumentEmployee.bonusDesc || 'Performance Bonus', 'bonusAmount')}</td>
                      <td className="py-2 text-right font-mono font-bold">{Number(payrollDocumentEmployee.bonusAmount !== undefined ? payrollDocumentEmployee.bonusAmount : payrollDocumentEmployee.performanceBonus).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}
                  {(payrollDocumentEmployee.commissionAmount || 0) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(payrollDocumentEmployee.commissionDesc || 'Commissions', 'commissionAmount')}</td>
                      <td className="py-2 text-right font-mono font-bold">{(payrollDocumentEmployee.commissionAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}
                  {(payrollDocumentEmployee.backPayAmount || 0) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(payrollDocumentEmployee.backPayDesc || 'BackPay / Arrears', 'backPayAmount')}</td>
                      <td className="py-2 text-right font-mono font-bold">{(payrollDocumentEmployee.backPayAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}
                  {(payrollDocumentEmployee.awsAmount || 0) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(payrollDocumentEmployee.awsDesc || 'AWS (13th Month)', 'awsAmount')}</td>
                      <td className="py-2 text-right font-mono font-bold">{(payrollDocumentEmployee.awsAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}
                  {(payrollDocumentEmployee.compensationAmount || 0) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(payrollDocumentEmployee.compensationDesc || 'Compensation / Severance', 'compensationAmount')}</td>
                      <td className="py-2 text-right font-mono font-bold">{(payrollDocumentEmployee.compensationAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}

                  {/* Reimbursements */}
		                  {(payrollDocumentEmployee.reimbursementAmount || 0) > 0 && (
		                    <tr className="bg-neutral-50 hover:bg-[#F2E8D8]/20">
		                      <td className="py-2 text-left pl-1 font-semibold text-secondary-container">{renderLineDescription(payrollDocumentEmployee.reimbursementDesc || 'Reimbursements (Tax-Free)', 'reimbursementAmount')}</td>
		                      <td className="py-2 text-right font-mono font-bold text-secondary-container pr-1">{(payrollDocumentEmployee.reimbursementAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
		                    </tr>
		                  )}
	                    </>
	                  )}
                </tbody>
              </table>

              {/* Total Row */}
              <div className="flex justify-between items-center border-t border-b border-[#A32626] py-3 mt-4 text-[#A32626] font-black text-xs uppercase tracking-wider">
	                <span>{documentProfile.isPaymentVoucher ? 'Gross Amount' : 'Total Earnings & Additions'}</span>
                <span className="font-mono">RM {(breakdown.grossPay + breakdown.reimbursementsSum).toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
              </div>
            </div>

            {/* Deductions Table */}
            <div className="bg-white border border-[#E5DED5] rounded-lg p-4 text-left">
              <div className="bg-[#A32626] text-white px-3 py-2 rounded font-black text-xs uppercase tracking-wider mb-4 text-center">
                Deductions
              </div>
              <table className="w-full text-xs text-[#333333]">
                <thead>
                  <tr className="border-b border-[#E5DED5] text-[10px] uppercase font-black text-[#6B6B6B]">
                    <th className="py-2 text-left">Description</th>
                    <th className="py-2 text-right">Amount (RM)</th>
                  </tr>
                </thead>
	                <tbody className="divide-y divide-[#E5DED5]/40">
	                  {documentProfile.statutoryEnabled && (
	                    <>
	                  <tr className="hover:bg-[#F2E8D8]/20">
                    <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('epfEmployee', `EPF (Employee ${payrollDocumentEmployee.epfRateEmployee}%)`), 'epfEmployee')}</td>
                    <td className="py-2 text-right font-mono font-bold">{breakdown.epfEmployeeValue.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                  </tr>

                  {breakdown.skbbkEmpVal > 0 ? (
                    <>
                      <tr className="hover:bg-[#F2E8D8]/20">
                        <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('socsoEmployee', 'SOCSO - Invalidity'), 'socsoEmployee')}</td>
                        <td className="py-2 text-right font-mono font-bold">{breakdown.socsoEmployeeVal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="hover:bg-[#F2E8D8]/20">
                        <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('lindung24Employee', 'SOCSO - LINDUNG 24 Jam'), 'lindung24Employee')}</td>
                        <td className="py-2 text-right font-mono font-bold">{breakdown.skbbkEmpVal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="bg-[#F2E8D8] text-[#333333] font-bold text-[11px] hover:bg-[#F2E8D8]">
                        <td className="py-2 text-left pl-2">SOCSO Employee Total</td>
                        <td className="py-2 text-right font-mono font-black pr-2">{(breakdown.socsoEmployeeVal + breakdown.skbbkEmpVal).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                      </tr>
                    </>
                  ) : (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('socsoEmployee', 'SOCSO'), 'socsoEmployee')}</td>
                      <td className="py-2 text-right font-mono font-bold">{breakdown.socsoEmployeeVal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}

                  <tr className="hover:bg-[#F2E8D8]/20">
                    <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('eisEmployee', 'EIS'), 'eisEmployee')}</td>
                    <td className="py-2 text-right font-mono font-bold">{breakdown.eisEmployeeVal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                  </tr>

	                  <tr className="hover:bg-[#F2E8D8]/20">
		                    <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('taxPcb', 'Income Tax (PCB)'), 'taxPcb')}</td>
	                    <td className="py-2 text-right font-mono font-bold">{breakdown.taxPcbVal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
	                  </tr>
	                    </>
	                  )}

	                  {displaySettings.showDeductionDetails && (
	                    <>
	                  {/* Unpaid Leave */}
                  {(payrollDocumentEmployee.unpaidLeave || 0) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('unpaidLeave', 'Unpaid Leave'), 'unpaidLeave')}</td>
                      <td className="py-2 text-right font-mono font-bold">{(payrollDocumentEmployee.unpaidLeave || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}

                  {(payrollDocumentEmployee.incompleteMonthDeduction || 0) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('incompleteMonthDeduction', 'Incomplete-month deduction'), 'incompleteMonthDeduction')}</td>
                      <td className="py-2 text-right font-mono font-bold">{(payrollDocumentEmployee.incompleteMonthDeduction || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}

                  {/* Payment in Lieu */}
                  {(payrollDocumentEmployee.deductionInLieu || 0) > 0 && (
                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('deductionInLieu', 'Payment in Lieu'), 'deductionInLieu')}</td>
                      <td className="py-2 text-right font-mono font-bold">{(payrollDocumentEmployee.deductionInLieu || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}

                  {/* CP38 */}
		                  {documentProfile.statutoryEnabled && (payrollDocumentEmployee.deductionCp38 || 0) > 0 && (
		                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('deductionCp38', 'CP38 Direct Tax'), 'deductionCp38')}</td>
                      <td className="py-2 text-right font-mono font-bold">{(payrollDocumentEmployee.deductionCp38 || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    </tr>
                  )}

                  {/* Other Deductions */}
		                  {(payrollDocumentEmployee.deductionOthers || 0) > 0 && (
		                    <tr className="hover:bg-[#F2E8D8]/20">
                      <td className="py-2 text-left font-medium">{renderLineDescription(getDescription('deductionOthers', payrollDocumentEmployee.deductionOthersDesc || 'Other Deductions'), 'deductionOthers')}</td>
                      <td className="py-2 text-right font-mono font-bold">{(payrollDocumentEmployee.deductionOthers || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
	                    </tr>
	                  )}
	                    </>
	                  )}
                </tbody>
              </table>

              {/* Total Row */}
              <div className="flex justify-between items-center border-t border-b border-[#A32626] py-3 mt-4 text-[#A32626] font-black text-xs uppercase tracking-wider">
	                <span>{documentProfile.isPaymentVoucher ? 'Other Deductions' : 'Total Deductions'}</span>
                <span className="font-mono">RM {breakdown.totalDeductions.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
              </div>
              {(payrollDocumentEmployee.unpaidLeave || payrollDocumentEmployee.incompleteMonthDeduction || 0) > 0 && (
                <p className="mt-2 text-[10px] leading-relaxed text-on-surface-variant">
                  Unpaid leave and incomplete-month reductions are included in Gross Pay v2 and are not deducted again from this total.
                </p>
              )}
            </div>
          </div>

          {/* Summary Strip (Option A) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 select-none">
            {/* Gross Pay */}
            <div className="flex items-center gap-4 bg-[#F2E8D8] border border-[#E5DED5] rounded-lg p-4 text-left">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#A32626] font-bold text-lg shadow-xs">
                💵
              </div>
              <div>
                <p className="text-[10px] text-[#6B6B6B] font-black uppercase tracking-wider">{documentProfile.isPaymentVoucher ? 'Gross Amount' : 'Gross Pay'}</p>
                <p className="text-lg font-black text-[#333333] font-mono mt-0.5">
                  RM {(breakdown.grossPay + breakdown.reimbursementsSum).toLocaleString('en-US', {minimumFractionDigits: 2})}
                </p>
              </div>
            </div>

            {/* Total Deductions */}
            <div className="flex items-center gap-4 bg-[#F2E8D8] border border-[#E5DED5] rounded-lg p-4 text-left">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#A32626] font-bold text-lg shadow-xs">
                📄
              </div>
              <div>
                <p className="text-[10px] text-[#6B6B6B] font-black uppercase tracking-wider">{documentProfile.isPaymentVoucher ? 'Other Deductions' : 'Total Deductions'}</p>
                <p className="text-lg font-black text-[#333333] font-mono mt-0.5">
                  RM {breakdown.totalDeductions.toLocaleString('en-US', {minimumFractionDigits: 2})}
                </p>
              </div>
            </div>

            {/* Net Pay (Deep Red Block) */}
            <div className="flex items-center gap-4 bg-[#A32626] text-white rounded-lg p-4 text-left shadow-md">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-lg">
                💰
              </div>
              <div>
                <p className="text-[10px] text-[#F2E8D8] font-black uppercase tracking-wider">{documentProfile.isPaymentVoucher ? 'Net Payable' : 'Net Pay'}</p>
                <p className="text-xl font-black text-white font-mono mt-0.5">
                  RM {breakdown.netPay.toLocaleString('en-US', {minimumFractionDigits: 2})}
                </p>
              </div>
            </div>
          </div>

          {/* Employer Contributions Card (Option A) */}
          {documentProfile.statutoryEnabled && displaySettings.showEmployerContributions && (
          <div className="bg-[#F2E8D8] border-2 border-[#D8CFC4] rounded-lg p-4 mb-6 text-left select-none text-xs">
            <div className="flex items-center gap-2 mb-3 text-[#A32626] font-black uppercase tracking-wider text-[10px]">
              🏛️ Employer Contributions <span className="opacity-80 font-medium">(Not Paid to Employee)</span>
            </div>

            <div className="grid grid-cols-2 md:flex md:flex-row md:items-center md:justify-between gap-4 text-[#333333]">
              {/* EPF */}
              <div className="flex-1 min-w-[80px] text-center flex flex-col justify-center items-center">
                <p className="text-[9px] text-[#6B6B6B] uppercase font-bold mb-1">EPF ({payrollDocumentEmployee.epfRateEmployer || 13}%)</p>
                <p className="font-mono font-bold">RM {breakdown.epfEmployerValue.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
              </div>

              <div className="hidden md:block w-[2px] h-7 bg-[#D8CFC4]" />

              {/* SOCSO Injury */}
              <div className="flex-1 min-w-[80px] text-center flex flex-col justify-center items-center">
                <p className="text-[9px] text-[#6B6B6B] uppercase font-bold mb-1">SOCSO - Injury</p>
                <p className="font-mono font-bold">RM {socsoEmployerInjury.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
              </div>

              <div className="hidden md:block w-[2px] h-7 bg-[#D8CFC4]" />

              {/* SOCSO Invalidity */}
              <div className="flex-1 min-w-[80px] text-center flex flex-col justify-center items-center">
                <p className="text-[9px] text-[#6B6B6B] uppercase font-bold mb-1">SOCSO - Invalidity</p>
                <p className="font-mono font-bold">RM {socsoEmployerInvalidity.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
              </div>

              <div className="hidden md:block w-[2px] h-7 bg-[#D8CFC4]" />

              {/* SOCSO Total */}
              <div className="flex-1 min-w-[80px] bg-white/20 py-1 px-2 rounded text-center flex flex-col justify-center items-center">
                <p className="text-[9px] text-[#A32626] uppercase font-black mb-1">SOCSO Employer Total</p>
                <p className="font-mono font-black text-[#A32626]">RM {breakdown.socsoEmployerVal.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
              </div>

              <div className="hidden md:block w-[2px] h-7 bg-[#D8CFC4]" />

              {/* EIS */}
              <div className="flex-1 min-w-[80px] text-center flex flex-col justify-center items-center">
                <p className="text-[9px] text-[#6B6B6B] uppercase font-bold mb-1">EIS</p>
                <p className="font-mono font-bold">RM {breakdown.eisEmployerVal.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
              </div>

            </div>
          </div>
          )}

          {/* Footer Section (Option A) */}
          {displaySettings.showNotesFooter && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#E5DED5] text-xs text-[#333333] mb-8 select-none">
            {/* Left Note */}
            <div className="flex items-start gap-2.5 text-left">
              <span className="text-base text-[#A32626] font-bold mt-0.5">💬</span>
              <div>
                <p className="text-[10px] text-[#A32626] font-black uppercase tracking-wider">Important Note</p>
                <p className="font-medium text-[#6B6B6B] leading-relaxed mt-0.5">
                  This is a computer generated document.<br />
                  No signature is required.
                </p>
              </div>
            </div>

            {/* Right Period */}
            <div className="flex items-start gap-2.5 text-left md:justify-end">
              <span className="text-base text-[#A32626] font-bold mt-0.5">📅</span>
              <div>
                <p className="text-[10px] text-[#A32626] font-black uppercase tracking-wider">Pay Period</p>
                <p className="font-mono font-bold text-[#333333] mt-0.5">
                  {payPeriodString}
                </p>
              </div>
            </div>
          </div>
          )}

          {/* Bottom Confidential Red Bar */}
          {displaySettings.showNotesFooter && (
          <div className="bg-[#A32626] text-white px-4 py-2.5 rounded-b-lg flex flex-col md:flex-row justify-between items-center text-[10px] uppercase font-bold tracking-wider select-none gap-2">
            <span>Thank you for your continued contribution to {employeeEntity?.name || 'Company not configured'}.</span>
            <span className="opacity-95 text-[#F2E8D8] tracking-widest font-black">Confidential</span>
          </div>
          )}

        </div>
      </div>
    </div>
  );
}
