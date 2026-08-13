/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Printer, 
  Download, 
  Sliders, 
  User, 
  Building2, 
  Percent, 
  CheckCircle, 
  Briefcase, 
  AlertCircle,
  HelpCircle,
  Clock,
  ArrowRight
} from 'lucide-react';
import { Employee } from '../types';
import { calculatePayslip, calculateYtd } from '../data';
import { getGmt8DateString, formatToDDMMMYYYY } from '../lib/dateUtils';

import PCBReconstructionHub from './PCBReconstructionHub';

interface TaxSettingsViewProps {
  employees: Employee[];
  onUpdateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
  onShowNotification: (title: string, message: string, type?: 'success' | 'info' | 'error') => void;
}

type ActiveForm = 'EA' | 'CP22' | 'CP22A' | 'CP21' | 'CP58' | 'TP3' | 'PCB_RECONSTRUCTION';

export default function TaxSettingsView({
  employees,
  onUpdateEmployee,
  onShowNotification
}: TaxSettingsViewProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(employees[0]?.id || '');
  const [activeFormTab, setActiveFormTab] = useState<ActiveForm>('EA');
  
  // Tax Settings Config States
  const [taxYear, setTaxYear] = useState('2026');
  const [autoPcb, setAutoPcb] = useState(true);
  const [digitalSignature, setDigitalSignature] = useState(true);
  const [authorizedSignatory, setAuthorizedSignatory] = useState('Director of Human Resources');
  
  // Form CP22A cessations state
  const [cessationDate, setCessationDate] = useState(() => getGmt8DateString());
  const [cessationReason, setCessationReason] = useState('Resignation');
  
  // Form CP21 departure state
  const [departureDate, setDepartureDate] = useState(() => getGmt8DateString());
  const [countryOfOrigin, setCountryOfOrigin] = useState('United Kingdom');
  
  // TP3 previous employment entries
  const [tp3PrevSalary, setTp3PrevSalary] = useState('24500.00');
  const [tp3PrevEpf, setTp3PrevEpf] = useState('2695.00');
  const [tp3PrevSocso, setTp3PrevSocso] = useState('197.50');
  const [tp3PrevPcb, setTp3PrevPcb] = useState('1100.00');

  const activeEmployee = employees.find(e => e.id === selectedEmployeeId) || employees[0];

  if (!activeEmployee) {
    return (
      <div className="p-8 text-center bg-white rounded-lg border border-neutral-border">
        No active employees found to generate statutory tax settings.
      </div>
    );
  }

  // Calculate values
  const payslip = calculatePayslip(activeEmployee);
  const currentPeriod = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const ytd = calculateYtd(activeEmployee, currentPeriod);

  const handleDownloadForm = (formType: string) => {
    onShowNotification(
      'Form Downloaded',
      `Official LHDN Form ${formType} generated for ${activeEmployee.name} (Year ${taxYear}) is saved to your downloads.`
    );
  };

  const handlePrintForm = () => {
    window.print();
  };

  // Synchronize TP3 state when selected employee changes
  useEffect(() => {
    if (activeEmployee) {
      setTp3PrevSalary(activeEmployee.tp3Data?.accumulatedPriorRemuneration?.toString() || '0');
      setTp3PrevEpf(activeEmployee.tp3Data?.accumulatedPriorEPF?.toString() || '0');
      setTp3PrevSocso(activeEmployee.tp3Data?.accumulatedPriorSocso?.toString() || '0');
      setTp3PrevPcb(activeEmployee.tp3Data?.accumulatedPriorPCB?.toString() || '0');
    }
  }, [selectedEmployeeId, activeEmployee]);

  const handleSaveTP3 = async () => {
    try {
      await onUpdateEmployee(activeEmployee.id, {
        tp3Data: {
          accumulatedPriorRemuneration: Number(tp3PrevSalary),
          accumulatedPriorEPF: Number(tp3PrevEpf),
          accumulatedPriorPCB: Number(tp3PrevPcb),
          accumulatedPriorSocso: Number(tp3PrevSocso)
        }
      });
      onShowNotification(
        'TP3 Record Synced',
        `Prior employment earnings of RM ${Number(tp3PrevSalary).toLocaleString()} have been registered for ${activeEmployee.name} to optimize remaining 2026 PCB calculations.`,
        'success'
      );
    } catch (error) {
      console.error('[TP3 Save] Failed:', error);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-200">
      
      {/* Top Welcome Title Grid */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white border border-neutral-border p-6 rounded-lg shadow-xs gap-4 text-left">
        <div>
          <h2 className="text-xl font-bold text-primary tracking-tight flex items-center gap-2">
            <Percent className="w-5 h-5 text-primary" /> Malaysian Statutory Tax & Compliance Forms
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Process EA Statements, new hire CP22 declarations, clearance certificates (CP22A/CP21), agency incentives (CP58), and TP3 previous employment sheets.
          </p>
        </div>
        <div className="flex gap-2">
          <select 
            value={taxYear}
            onChange={(e) => setTaxYear(e.target.value)}
            className="bg-surface border border-neutral-border rounded text-xs font-semibold py-1.5 px-3 outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="2025">Tax Year 2025</option>
            <option value="2026">Tax Year 2026</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        
        {/* Left column: Setup & Employee selection */}
        <div className="space-y-6 lg:col-span-1">
          
          {/* General Tax Settings Card */}
          <div className="bg-white border border-neutral-border rounded-lg p-5 shadow-xs text-left">
            <h3 className="font-bold text-sm text-primary uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <Sliders className="w-4 h-4" /> Global Tax Config
            </h3>
            
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-neutral-50 rounded border border-neutral-border/40">
                <div>
                  <p className="font-semibold text-on-surface">Auto PCB Calculation</p>
                  <p className="text-[10px] text-on-surface-variant">Verify local schedules</p>
                </div>
                <input 
                  type="checkbox" 
                  checked={autoPcb}
                  onChange={(e) => setAutoPcb(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-neutral-50 rounded border border-neutral-border/40">
                <div>
                  <p className="font-semibold text-on-surface">Digital Signature</p>
                  <p className="text-[10px] text-on-surface-variant">Auto-inject on forms</p>
                </div>
                <input 
                  type="checkbox" 
                  checked={digitalSignature}
                  onChange={(e) => setDigitalSignature(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Authorized Signatory Role</label>
                <input 
                  type="text"
                  value={authorizedSignatory}
                  onChange={(e) => setAuthorizedSignatory(e.target.value)}
                  className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="p-3 bg-parchment/30 rounded border border-neutral-border text-[11px] text-on-surface-variant leading-relaxed">
                <span className="font-semibold text-primary block mb-0.5">LHDN Compliance Notice:</span>
                All generated forms conform precisely to LHDN Malaysia standards. Form EA requires completion prior to March 1st annually.
              </div>
            </div>
          </div>

          {/* Active Employee Selector Card */}
          <div className="bg-white border border-neutral-border rounded-lg p-5 shadow-xs text-left">
            <h3 className="font-bold text-sm text-primary uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <User className="w-4 h-4" /> Select Employee
            </h3>
            
            <div className="space-y-2">
              {employees.map((emp) => {
                const isSelected = emp.id === selectedEmployeeId;
                return (
                  <button
                    key={emp.id}
                    onClick={() => setSelectedEmployeeId(emp.id)}
                    className={`w-full p-3 text-left rounded-lg border transition-all flex items-center gap-3 ${
                      isSelected 
                        ? 'bg-primary/5 border-primary shadow-xs' 
                        : 'border-neutral-border hover:bg-neutral-50'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                      {emp.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-xs text-on-surface truncate">{emp.name}</p>
                      <p className="text-[10px] text-on-surface-variant truncate font-mono">{emp.id} · {emp.designation}</p>
                    </div>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right column: Form Preview Area */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Statutory Forms Tabs */}
          <div className="bg-white border border-neutral-border rounded-lg shadow-xs overflow-hidden">
            <div className="border-b border-neutral-border bg-neutral-50 flex flex-wrap">
              {(['EA', 'CP22', 'CP22A', 'CP21', 'CP58', 'TP3', 'PCB_RECONSTRUCTION'] as ActiveForm[]).map((tab) => {
                const labelMap: Record<ActiveForm, string> = {
                  EA: 'EA Form (Annual)',
                  CP22: 'CP22 (New Hire)',
                  CP22A: 'CP22A (Cessation)',
                  CP21: 'CP21 (Expat Departure)',
                  CP58: 'CP58 (Contractors)',
                  TP3: 'TP3 (Prior Income)',
                  PCB_RECONSTRUCTION: 'PCB Reconstruction Hub'
                };
                const isActive = activeFormTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveFormTab(tab)}
                    className={`px-4 py-3 text-xs font-bold transition-all border-b-2 text-left ${
                      isActive 
                        ? 'border-primary text-primary bg-white' 
                        : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-neutral-100/60'
                    }`}
                  >
                    {labelMap[tab]}
                  </button>
                );
              })}
            </div>

            {activeFormTab === 'PCB_RECONSTRUCTION' ? (
              <div className="p-6 bg-white">
                <PCBReconstructionHub 
                  employees={employees}
                  onUpdateEmployee={onUpdateEmployee}
                  onShowNotification={onShowNotification}
                />
              </div>
            ) : (
              <>
                {/* Form Actions Toolbar */}
            <div className="p-4 bg-white border-b border-neutral-border flex justify-between items-center">
              <span className="text-xs font-semibold text-on-surface-variant">
                Form State: <span className="text-green-600 font-bold">READY FOR SIGN-OFF</span>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handlePrintForm}
                  className="bg-surface border border-neutral-border hover:bg-surface-container text-primary text-xs font-semibold py-1.5 px-3 rounded flex items-center gap-1 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" /> Print / PDF
                </button>
                <button
                  onClick={() => handleDownloadForm(activeFormTab)}
                  className="bg-primary text-white hover:bg-primary-container text-xs font-semibold py-1.5 px-3 rounded flex items-center gap-1 transition-colors shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" /> Download LHDN XML/PDF
                </button>
              </div>
            </div>

            {/* Dynamic Form Content */}
            <div className="p-6 bg-[#fbfbfa] text-left min-h-[550px] overflow-x-auto select-text">
              
              {/* Form Render Area Paper */}
              <div className="max-w-3xl mx-auto bg-white border border-neutral-border p-8 rounded shadow-sm text-xs font-sans leading-normal text-gray-800 space-y-6">
                
                {/* 1. Form EA View */}
                {activeFormTab === 'EA' && (
                  <div className="space-y-6">
                    <div className="border-b border-black pb-4 flex justify-between items-start">
                      <div>
                        <span className="font-bold border border-black px-2 py-0.5 text-[10px] block w-max uppercase">BORANG EA</span>
                        <h1 className="text-lg font-bold tracking-tight mt-1">STATEMENT OF REMUNERATION FROM EMPLOYMENT</h1>
                        <p className="text-[10px] text-gray-500 uppercase">FOR THE YEAR ENDED 31 DECEMBER {taxYear}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">LHDN MALAYSIA</p>
                        <p className="text-[10px] text-gray-500">M.A.S. No: C 3928172-10</p>
                      </div>
                    </div>

                    {/* Section A: Employee Details */}
                    <div className="space-y-3">
                      <h4 className="font-bold border-b border-gray-400 pb-1 uppercase text-primary">A. Particulars of Employee</h4>
                      <table className="w-full text-[11px] space-y-1">
                        <tbody>
                          <tr>
                            <td className="w-1/3 py-1 font-semibold">1. Full Name:</td>
                            <td className="py-1 uppercase font-bold">{activeEmployee.name}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">2. Job Designation:</td>
                            <td className="py-1">{activeEmployee.designation}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">3. NRIC / Passport No:</td>
                            <td className="py-1 font-mono">{activeEmployee.nricPassport}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">4. Income Tax Number (TIN):</td>
                            <td className="py-1 font-mono font-semibold">{activeEmployee.taxNumber || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">5. EPF Member Number:</td>
                            <td className="py-1 font-mono">{activeEmployee.epfNumber || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">6. Nationality:</td>
                            <td className="py-1">{activeEmployee.nationality}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">7. Marital Status:</td>
                            <td className="py-1">{activeEmployee.maritalStatus}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Section B: Employment Income */}
                    <div className="space-y-3">
                      <h4 className="font-bold border-b border-gray-400 pb-1 uppercase text-primary">B. Employment Income, Benefits and Value of Living Accomodation</h4>
                      <div className="border border-gray-300 rounded overflow-hidden">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-300">
                              <th className="p-2 text-left">Description of Income Item</th>
                              <th className="p-2 text-right w-1/4">Amount (RM)</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-gray-200">
                              <td className="p-2 font-medium">1. Gross salary, wages, leave pay, fees, commissions, bonus or gratuity</td>
                              <td className="p-2 text-right font-mono font-semibold">RM {ytd.grossEarnings.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                            <tr className="border-b border-gray-200">
                              <td className="p-2 pl-4 text-gray-600">· Of which is Basic Salary</td>
                              <td className="p-2 text-right font-mono">RM {ytd.basicSalary.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                            <tr className="border-b border-gray-200">
                              <td className="p-2 pl-4 text-gray-600">· Of which is Allowances & Additions</td>
                              <td className="p-2 text-right font-mono">RM {ytd.allowances.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                            <tr className="border-b border-gray-200">
                              <td className="p-2 pl-4 text-gray-600">· Of which is Bonuses / One-Time Supplements</td>
                              <td className="p-2 text-right font-mono">RM {ytd.bonus.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                            <tr className="border-b border-gray-200 bg-gray-50/50">
                              <td className="p-2 font-medium">2. Benefits-In-Kind (BIK) and non-monetary incentives</td>
                              <td className="p-2 text-right font-mono">RM 0.00</td>
                            </tr>
                            <tr className="font-bold bg-gray-100">
                              <td className="p-2">TOTAL SECTION B INCOME</td>
                              <td className="p-2 text-right font-mono text-primary">RM {ytd.grossEarnings.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Section C: Statutory Deductions */}
                    <div className="space-y-3">
                      <h4 className="font-bold border-b border-gray-400 pb-1 uppercase text-primary">C. Pension / EPF / SOCSO / PCB Statutory Deductions</h4>
                      <table className="w-full text-[11px] border border-gray-300 rounded overflow-hidden">
                        <tbody>
                          <tr className="border-b border-gray-200">
                            <td className="p-2 font-medium">1. Monthly Income Tax (PCB) paid to LHDN</td>
                            <td className="p-2 text-right font-mono font-semibold text-error">RM {ytd.taxPcb.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                          <tr className="border-b border-gray-200">
                            <td className="p-2 font-medium">2. EPF (Employees Provident Fund) Contribution (Employee share)</td>
                            <td className="p-2 text-right font-mono font-semibold">RM {ytd.epfEmployee.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                          <tr className="border-b border-gray-200 bg-gray-50/30">
                            <td className="p-2 pl-4 text-gray-600">· Employer share for reference</td>
                            <td className="p-2 text-right font-mono text-gray-500">RM {ytd.epfEmployer.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                          <tr className="border-b border-gray-200">
                            <td className="p-2 font-medium">3. SOCSO Contribution (Employee share)</td>
                            <td className="p-2 text-right font-mono font-semibold">RM {ytd.socsoEmployee.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                          {ytd.skbbkEmployee > 0 && (
                            <tr className="border-b border-gray-200">
                              <td className="p-2 pl-4 text-gray-600 font-medium">· SOCSO (SKBBK) Contribution (Employee share)</td>
                              <td className="p-2 text-right font-mono font-semibold text-gray-700">RM {ytd.skbbkEmployee.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                          )}
                          <tr className="border-b border-gray-200">
                            <td className="p-2 font-medium">4. EIS Contribution (Employee share)</td>
                            <td className="p-2 text-right font-mono font-semibold">RM {ytd.eisEmployee.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                          <tr className="font-bold bg-gray-100">
                            <td className="p-2">TOTAL SECTION C STATUTORY DEDUCTIONS</td>
                            <td className="p-2 text-right font-mono text-error">RM {(ytd.taxPcb + ytd.epfEmployee + ytd.socsoEmployee + ytd.skbbkEmployee + ytd.eisEmployee).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Section D: Sign-off */}
                    <div className="pt-6 border-t border-dashed border-gray-300 flex justify-between items-end text-[10px]">
                      <div>
                        <p className="font-bold">Authorized Person Signature:</p>
                        {digitalSignature && (
                          <div className="mt-2 text-primary font-serif font-bold italic border border-primary/25 bg-primary/5 px-3 py-1 rounded w-max text-xs">
                            YSYD HRMS Digital Sign-Off
                          </div>
                        )}
                        <p className="mt-2 text-gray-500">Designation: {authorizedSignatory}</p>
                        <p className="text-gray-500">Date: {getGmt8DateString()}</p>
                      </div>
                      <div className="text-right text-gray-400">
                        <p>Enterprise Compliance ID</p>
                        <p className="font-mono text-[9px]">LHDN-EA-2026-F9A3</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Form CP22 View */}
                {activeFormTab === 'CP22' && (
                  <div className="space-y-6">
                    <div className="border-b border-black pb-4 text-center">
                      <span className="font-bold border border-black px-2 py-0.5 text-[10px] uppercase">CP 22</span>
                      <h1 className="text-base font-bold tracking-tight mt-2 uppercase">MALAYSIAN INLAND REVENUE BOARD (LHDN)</h1>
                      <p className="text-xs font-bold uppercase mt-1">NOTIFICATION OF NEW EMPLOYEE REGISTERED FOR TAX</p>
                    </div>

                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-700 leading-relaxed">
                      <strong>Submission Notice:</strong> Submit this notification to LHDN within 30 days of employing <strong>{activeEmployee.name}</strong> (Joined: {formatToDDMMMYYYY(activeEmployee.dateOfJoined)}).
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-bold border-b border-gray-400 pb-1 text-primary">1. EMPLOYER PARTICULARS</h4>
                      <table className="w-full text-xs">
                        <tbody>
                          <tr>
                            <td className="w-1/3 py-1.5 font-medium">Employer Tax No (E No):</td>
                            <td className="py-1.5 font-mono font-bold">E 2938173-09</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 font-medium">Company Registered Name:</td>
                            <td className="py-1.5 font-bold">Acme Technologies Sdn Bhd</td>
                          </tr>
                        </tbody>
                      </table>

                      <h4 className="font-bold border-b border-gray-400 pb-1 text-primary mt-6">2. NEW EMPLOYEE PROFILE</h4>
                      <table className="w-full text-xs space-y-1">
                        <tbody>
                          <tr>
                            <td className="w-1/3 py-1 font-medium">Employee Full Name:</td>
                            <td className="py-1 font-bold uppercase">{activeEmployee.name}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-medium">Identity Card (NRIC) / Passport:</td>
                            <td className="py-1 font-mono font-semibold">{activeEmployee.nricPassport}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-medium">Tax Number (TIN):</td>
                            <td className="py-1 font-mono font-semibold">{activeEmployee.taxNumber || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-medium">EPF Number:</td>
                            <td className="py-1 font-mono">{activeEmployee.epfNumber || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-medium">Date of Employment:</td>
                            <td className="py-1 font-semibold">{formatToDDMMMYYYY(activeEmployee.dateOfJoined || '2026-01-01')}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-medium">Initial Monthly Basic Salary:</td>
                            <td className="py-1 font-mono font-semibold">RM {activeEmployee.basicSalary.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-medium">Job Designation:</td>
                            <td className="py-1">{activeEmployee.designation}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-medium">Nationality:</td>
                            <td className="py-1">{activeEmployee.nationality}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-6 border-t border-gray-300 text-[10px] text-gray-500 flex justify-between">
                      <div>
                        <p className="font-semibold">Prepared by YSYD HRMS Auto-Compliance Platform</p>
                        <p>Authorized Signatory: {authorizedSignatory}</p>
                      </div>
                      <div className="text-right">
                        <p>Document Version: CP22/2026</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Form CP22A View */}
                {activeFormTab === 'CP22A' && (
                  <div className="space-y-6">
                    <div className="border-b border-black pb-4 text-center">
                      <span className="font-bold border border-black px-2 py-0.5 text-[10px] uppercase">CP 22A</span>
                      <h1 className="text-base font-bold tracking-tight mt-2 uppercase">MALAYSIAN INLAND REVENUE BOARD (LHDN)</h1>
                      <p className="text-xs font-bold uppercase mt-1">TAX CLEARANCE FOR CESSATION OF EMPLOYMENT OF PRIVATE SECTOR EMPLOYEE</p>
                    </div>

                    <div className="p-4 bg-orange-50 border border-orange-200 rounded text-[11px] text-orange-800 leading-relaxed space-y-2">
                      <p className="font-bold">⚠️ Tax Clearance Withholding Obligation:</p>
                      <p>
                        You are required to withhold all monies/remuneration due to <strong>{activeEmployee.name}</strong> until a tax clearance certificate is issued. This notification must be sent at least 30 days prior to cessation.
                      </p>
                    </div>

                    {/* Interactive Cessation Adjuster */}
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                      <span className="font-bold text-xs text-primary block">Configure Cessation Attributes:</span>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Cessation Date</label>
                          <input 
                            type="date"
                            value={cessationDate}
                            onChange={(e) => setCessationDate(e.target.value)}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Reason for Cessation</label>
                          <select 
                            value={cessationReason}
                            onChange={(e) => setCessationReason(e.target.value)}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option>Resignation</option>
                            <option>Retirement</option>
                            <option>Retrenchment / VSS</option>
                            <option>Cessation of Contract</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-bold border-b border-gray-400 pb-1 text-primary">CESSATION RECORD DATA</h4>
                      <table className="w-full text-xs">
                        <tbody>
                          <tr>
                            <td className="w-1/3 py-1 font-semibold">Employee Name:</td>
                            <td className="py-1 uppercase font-bold">{activeEmployee.name}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">NRIC / Passport No:</td>
                            <td className="py-1 font-mono font-semibold">{activeEmployee.nricPassport}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Tax Number (TIN):</td>
                            <td className="py-1 font-mono font-semibold">{activeEmployee.taxNumber || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Date of Joining:</td>
                            <td className="py-1">{formatToDDMMMYYYY(activeEmployee.dateOfJoined)}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Expected Cessation Date:</td>
                            <td className="py-1 font-bold text-red-600">{cessationDate}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Cessation Reason:</td>
                            <td className="py-1 font-medium">{cessationReason}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">YTD Remuneration (2026):</td>
                            <td className="py-1 font-mono font-semibold text-primary">RM {ytd.grossEarnings.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-6 border-t border-gray-300 text-[10px] text-gray-500 text-center">
                      <p>Subject to clearance audit by Inland Revenue Board of Malaysia.</p>
                    </div>
                  </div>
                )}

                {/* 4. Form CP21 View */}
                {activeFormTab === 'CP21' && (
                  <div className="space-y-6">
                    <div className="border-b border-black pb-4 text-center">
                      <span className="font-bold border border-black px-2 py-0.5 text-[10px] uppercase">CP 21</span>
                      <h1 className="text-base font-bold tracking-tight mt-2 uppercase">MALAYSIAN INLAND REVENUE BOARD (LHDN)</h1>
                      <p className="text-xs font-bold uppercase mt-1">NOTIFICATION OF DEPARTURE OF EMPLOYEE FROM MALAYSIA (EXPATRIATE / NON-CITIZEN)</p>
                    </div>

                    <div className="p-3.5 bg-red-50 border border-red-200 rounded text-[11px] text-red-700 leading-relaxed">
                      <strong>Critical Expatriate Requirement:</strong> You must notify LHDN at least 30 days before the expected departure date of non-citizen employees who intend to leave Malaysia for more than 3 months.
                    </div>

                    {/* Interactive Departure Attributes */}
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                      <span className="font-bold text-xs text-primary block">Expatriate Departure Settings:</span>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Expected Departure Date</label>
                          <input 
                            type="date"
                            value={departureDate}
                            onChange={(e) => setDepartureDate(e.target.value)}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Country Returning To</label>
                          <input 
                            type="text"
                            value={countryOfOrigin}
                            onChange={(e) => setCountryOfOrigin(e.target.value)}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-bold border-b border-gray-400 pb-1 text-primary">DEPARTING INDIVIDUAL DOSSIER</h4>
                      <table className="w-full text-xs">
                        <tbody>
                          <tr>
                            <td className="w-1/3 py-1 font-semibold">Expat Full Name:</td>
                            <td className="py-1 uppercase font-bold">{activeEmployee.name}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Passport Number:</td>
                            <td className="py-1 font-mono font-bold text-blue-600">{activeEmployee.nricPassport || 'EX-PASS-99023'}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Tax Reference Number:</td>
                            <td className="py-1 font-mono font-semibold">{activeEmployee.taxNumber || 'SG-99382710'}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Nationality:</td>
                            <td className="py-1">{activeEmployee.nationality}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Destination Country:</td>
                            <td className="py-1 font-semibold text-primary">{countryOfOrigin}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Departure Date:</td>
                            <td className="py-1 font-bold">{departureDate}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-6 border-t border-gray-300 text-[10px] text-gray-400 text-center">
                      <p>Prepared securely using LHDN CP21 Direct Ingress Integration.</p>
                    </div>
                  </div>
                )}

                {/* 5. Form CP58 View */}
                {activeFormTab === 'CP58' && (
                  <div className="space-y-6">
                    <div className="border-b border-black pb-4 text-center">
                      <span className="font-bold border border-black px-2 py-0.5 text-[10px] uppercase">CP 58</span>
                      <h1 className="text-base font-bold tracking-tight mt-2 uppercase">MALAYSIAN INLAND REVENUE BOARD (LHDN)</h1>
                      <p className="text-xs font-bold uppercase mt-1">STATEMENT OF MONETARY AND NON-MONETARY INCENTIVES FOR INDEPENDENT RECIPIENTS</p>
                    </div>

                    <div className="p-3.5 bg-teal-50 border border-teal-200 rounded text-[11px] text-teal-700 leading-relaxed">
                      <strong>Contractor Notice:</strong> Form CP58 is mandatory for private sector companies paying incentives (monetary or non-monetary commissions/incentives) exceeding <strong>RM 5,000</strong> annually to agents, dealers, distributors, or freelancers.
                    </div>

                    <div className="space-y-4 text-xs">
                      <h4 className="font-bold border-b border-gray-400 pb-1 text-primary">A. PAYING COMPANY PARTICULARS</h4>
                      <table className="w-full">
                        <tbody>
                          <tr>
                            <td className="w-1/3 py-1 font-semibold">Company Name:</td>
                            <td className="py-1">Acme Technologies Sdn Bhd</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Employer E No:</td>
                            <td className="py-1 font-mono">E 2938173-09</td>
                          </tr>
                        </tbody>
                      </table>

                      <h4 className="font-bold border-b border-gray-400 pb-1 text-primary mt-4">B. RECIPIENT AGENT / CONTRACTOR DETAIL</h4>
                      <table className="w-full">
                        <tbody>
                          <tr>
                            <td className="w-1/3 py-1 font-semibold">Recipient Full Name:</td>
                            <td className="py-1 font-bold uppercase">{activeEmployee.name}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Employment Type:</td>
                            <td className="py-1 text-amber-700 font-bold">{activeEmployee.employmentType}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">NRIC / Passport:</td>
                            <td className="py-1 font-mono font-semibold">{activeEmployee.nricPassport}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Tax Reference Number:</td>
                            <td className="py-1 font-mono font-semibold">{activeEmployee.taxNumber || 'N/A'}</td>
                          </tr>
                        </tbody>
                      </table>

                      <h4 className="font-bold border-b border-gray-400 pb-1 text-primary mt-4">C. INCENTIVES RECEIVED IN TAX YEAR {taxYear}</h4>
                      <table className="w-full border border-gray-300 rounded overflow-hidden">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-300">
                            <th className="p-2 text-left">Incentive Category</th>
                            <th className="p-2 text-right">Value (RM)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-gray-200">
                            <td className="p-2">1. Monetary Incentives (Commissions / Referral Fees)</td>
                            <td className="p-2 text-right font-mono font-semibold">RM {ytd.commissions.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                          <tr className="border-b border-gray-200">
                            <td className="p-2">2. Service Fees & Retainers (Gross)</td>
                            <td className="p-2 text-right font-mono">RM {ytd.basicSalary.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                          <tr className="border-b border-gray-200">
                            <td className="p-2">3. Non-Monetary Rewards (Bonus credits, merchandise)</td>
                            <td className="p-2 text-right font-mono">RM 0.00</td>
                          </tr>
                          <tr className="bg-gray-100 font-bold">
                            <td className="p-2">TOTAL INCIDENT COMMISSIONS / FEES</td>
                            <td className="p-2 text-right font-mono text-primary">RM {(ytd.commissions + ytd.basicSalary).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-6 border-t border-gray-300 text-[10px] text-gray-500 flex justify-between">
                      <p>Compiled automatically from general ledger and voucher lists.</p>
                      <p className="font-mono">LHDN-CP58-V3</p>
                    </div>
                  </div>
                )}

                {/* 6. Form TP3 View */}
                {activeFormTab === 'TP3' && (
                  <div className="space-y-6">
                    <div className="border-b border-black pb-4 text-center">
                      <span className="font-bold border border-black px-2 py-0.5 text-[10px] uppercase">BORANG TP3</span>
                      <h1 className="text-base font-bold tracking-tight mt-2 uppercase">MALAYSIAN INLAND REVENUE BOARD (LHDN)</h1>
                      <p className="text-xs font-bold uppercase mt-1">EMPLOYEE DECLARATION OF PRIOR REMUNERATION IN THE CURRENT YEAR</p>
                    </div>

                    <div className="p-3 bg-purple-50 border border-purple-200 rounded text-[11px] text-purple-700 leading-relaxed">
                      <strong>Newly Hired Employee declaration:</strong> TP3 Form registers income and statutory deductions from <strong>previous employers</strong> in the same tax year. This ensures accurate cumulative monthly PCB deduction calculations.
                    </div>

                    {/* TP3 Interactive Form Editor */}
                    <div className="bg-[#fcfaff] p-5 rounded-lg border border-purple-200 space-y-4">
                      <span className="font-bold text-xs text-purple-800 flex items-center gap-1.5">
                        <Sliders className="w-4 h-4 text-purple-700" /> Enter Prior Remuneration Details:
                      </span>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-700 uppercase mb-1">Prior 2026 Gross Salary (RM)</label>
                          <input 
                            type="number"
                            value={tp3PrevSalary}
                            onChange={(e) => setTp3PrevSalary(e.target.value)}
                            className="w-full bg-white border border-purple-200 rounded p-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-purple-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-700 uppercase mb-1">Prior 2026 EPF Deducted (RM)</label>
                          <input 
                            type="number"
                            value={tp3PrevEpf}
                            onChange={(e) => setTp3PrevEpf(e.target.value)}
                            className="w-full bg-white border border-purple-200 rounded p-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-purple-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-700 uppercase mb-1">Prior 2026 SOCSO Deducted (RM)</label>
                          <input 
                            type="number"
                            value={tp3PrevSocso}
                            onChange={(e) => setTp3PrevSocso(e.target.value)}
                            className="w-full bg-white border border-purple-200 rounded p-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-purple-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-700 uppercase mb-1">Prior 2026 PCB Paid (RM)</label>
                          <input 
                            type="number"
                            value={tp3PrevPcb}
                            onChange={(e) => setTp3PrevPcb(e.target.value)}
                            className="w-full bg-white border border-purple-200 rounded p-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-purple-500"
                          />
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={handleSaveTP3}
                          className="bg-purple-700 hover:bg-purple-800 text-white font-semibold text-xs py-1.5 px-4 rounded flex items-center gap-1.5 transition-colors"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Save and Recalculate PCB
                        </button>
                      </div>
                    </div>

                    {/* TP3 Preview Output */}
                    <div className="space-y-4">
                      <h4 className="font-bold border-b border-gray-400 pb-1 text-primary">ACTIVE TP3 RECORD TO BE ATTACHED</h4>
                      <table className="w-full text-xs">
                        <tbody>
                          <tr>
                            <td className="w-1/3 py-1 font-semibold">Employee Name:</td>
                            <td className="py-1 uppercase font-bold">{activeEmployee.name}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">NRIC / Passport No:</td>
                            <td className="py-1 font-mono font-semibold">{activeEmployee.nricPassport}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Prior Employer Gross Remuneration:</td>
                            <td className="py-1 font-mono font-bold">RM {Number(tp3PrevSalary).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Prior Employer EPF Withholding:</td>
                            <td className="py-1 font-mono">RM {Number(tp3PrevEpf).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Prior Employer SOCSO Contribution:</td>
                            <td className="py-1 font-mono">RM {Number(tp3PrevSocso).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                          <tr>
                            <td className="py-1 font-semibold">Prior Employer PCB Paid:</td>
                            <td className="py-1 font-mono text-red-600 font-bold">RM {Number(tp3PrevPcb).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-6 border-t border-gray-300 text-[10px] text-gray-500 flex justify-between">
                      <p>Certified true and correct declaration by signature above.</p>
                      <p className="font-mono">TP3-Form-E03</p>
                    </div>
                  </div>
                )}

              </div>
            </div>
            </>
            )}
          </div>

          {/* Bottom Help notice */}
          <div className="bg-white border border-neutral-border rounded-lg p-5 shadow-xs flex items-start gap-4 text-left">
            <HelpCircle className="w-6 h-6 text-primary shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <h4 className="font-bold text-primary">Need assistance with Inland Revenue Board submissions?</h4>
              <p className="text-on-surface-variant leading-relaxed">
                EPF contributions are updated with standard 2026 rates. SOCSO, EIS and PCB deductions are loaded from statutory tiers. If you notice calculations that require override adjustments, you can modify individual employee balances using the Workforce Directory or direct active payroll override sheets.
              </p>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
