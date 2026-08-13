/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  User, 
  Building2, 
  CreditCard, 
  ShieldAlert, 
  Briefcase, 
  Save, 
  Trash2, 
  UserCheck, 
  AlertCircle,
  FileText,
  UploadCloud,
  X
} from 'lucide-react';
import { CorporateEntity, Employee, Candidate } from '../types';
import { getGmt8DateString } from '../lib/dateUtils';
import { formatNricOrPassport, MALAYSIAN_BANK_NAMES } from '../lib/employeeInput';

interface OnboardingFormProps {
  candidates: Candidate[];
  entities: CorporateEntity[];
  onOnboardingComplete: (newEmployee: Employee) => Promise<void>;
  onShowNotification: (title: string, message: string) => void;
  onAdvanceCandidateStage?: (candidateId: string, stage: 'Applied' | 'Interviewing' | 'Offered' | 'Onboarding') => Promise<void>;
}

interface DocumentFile {
  name: string;
  size: string;
  previewUrl?: string;
}

interface DocumentUploaderProps {
  id: string;
  label: string;
  sublabel: string;
  file: DocumentFile | null;
  onFileSelect: (file: DocumentFile | null) => void;
}

function DocumentUploader({ id, label, sublabel, file, onFileSelect }: DocumentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFile = (nativeFile: File) => {
    const sizeInMB = (nativeFile.size / (1024 * 1024)).toFixed(2);
    const sizeStr = `${sizeInMB} MB`;
    
    // Create preview URL if it's an image
    let previewUrl: string | undefined;
    if (nativeFile.type.startsWith('image/')) {
      previewUrl = URL.createObjectURL(nativeFile);
    }

    onFileSelect({
      name: nativeFile.name,
      size: sizeStr,
      previewUrl
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (file?.previewUrl) {
      URL.revokeObjectURL(file.previewUrl);
    }
    onFileSelect(null);
  };

  return (
    <div className="space-y-1.5 text-left">
      <label className="block font-bold text-on-surface-variant uppercase text-[11px]">
        {label}
      </label>
      
      {file ? (
        <div className="flex items-center justify-between p-3 bg-green-50/50 border border-green-200 rounded-lg animate-in fade-in duration-200">
          <div className="flex items-center gap-3 overflow-hidden">
            {file.previewUrl ? (
              <img 
                src={file.previewUrl} 
                alt="Upload preview" 
                className="w-10 h-10 object-cover rounded border border-neutral-200"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="p-2 bg-green-100 text-green-700 rounded-lg">
                <FileText className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 text-left">
              <p className="font-semibold text-on-surface truncate text-xs">{file.name}</p>
              <p className="text-[10px] text-on-surface-variant font-mono">{file.size}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="p-1.5 hover:bg-green-100 text-on-surface-variant hover:text-error rounded transition-colors"
            title="Remove document"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
            isDragging 
              ? 'border-primary bg-primary/5' 
              : 'border-neutral-border hover:border-primary/50 hover:bg-neutral-50/50'
          }`}
        >
          <UploadCloud className={`w-8 h-8 mb-2 transition-colors ${isDragging ? 'text-primary' : 'text-on-surface-variant/70'}`} />
          <p className="text-xs font-semibold text-on-surface text-center">
            <span className="text-primary hover:underline">Click to upload</span> or drag and drop
          </p>
          <p className="text-[10px] text-on-surface-variant/70 mt-1 font-mono">{sublabel}</p>
          <input
            id={id}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileChange}
          />
        </label>
      )}
    </div>
  );
}

export default function OnboardingForm({
  candidates,
  entities,
  onOnboardingComplete,
  onShowNotification,
  onAdvanceCandidateStage
}: OnboardingFormProps) {
  // Candidate Selection
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('candidateId') || 'manual';
  });

  const hasCandidateParam = new URLSearchParams(window.location.search).has('candidateId');

  // Form Section 1: Basic & Employment Profile
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('Engineering');
  const [entityId, setEntityId] = useState('');
  const [employmentType, setEmploymentType] = useState<Employee['employmentType']>('Permanent');
  const [dateOfJoined, setDateOfJoined] = useState(getGmt8DateString());
  const [basicSalary, setBasicSalary] = useState('');

  // Form Section 2: Personal & Statutory Compliance
  const [nricPassport, setNricPassport] = useState('');
  const [nationality, setNationality] = useState('Malaysian');
  const [taxNumber, setTaxNumber] = useState('');
  const [epfNumber, setEpfNumber] = useState('');
  const [socsoNumber, setSocsoNumber] = useState('');
  const [maritalStatus, setMaritalStatus] = useState<'Single' | 'Married' | 'Divorced' | 'Widowed'>('Single');

  // Form Section 3: Bank Details
  const [bankName, setBankName] = useState('Maybank Berhad');
  const [accountNo, setAccountNo] = useState('');

  // Form Section 4: Emergency Contact
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactRelation, setEmergencyContactRelation] = useState('Spouse');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  // Load departments and roles dynamically
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);

  useEffect(() => {
    const savedDepts = localStorage.getItem('company_departments');
    let depts = ['Product & Engineering', 'Finance', 'Human Resources', 'Sales & Marketing', 'Strategy', 'Operations'];
    if (savedDepts) {
      depts = JSON.parse(savedDepts);
    }
    setAvailableDepartments(depts);

    const savedRoles = localStorage.getItem('company_roles');
    let rls = ['Software Engineer', 'Senior Software Engineer', 'Product Manager', 'UX Designer', 'HR Specialist', 'Finance Manager', 'Consultant'];
    if (savedRoles) {
      rls = JSON.parse(savedRoles);
    }
    setAvailableRoles(rls);
    setDesignation(current => current || rls[0] || '');
    setDepartment(current => depts.includes(current) ? current : (depts[0] || ''));
  }, []);

  // Form Section 5: Required Document Uploads
  const [icFront, setIcFront] = useState<DocumentFile | null>(null);
  const [icBack, setIcBack] = useState<DocumentFile | null>(null);
  const [certOfEducation, setCertOfEducation] = useState<DocumentFile | null>(null);

  // Error state & Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Populate form if a candidate is selected
  useEffect(() => {
    if (selectedCandidateId === 'manual') {
      setFullName('');
      setEmail('');
      setPhone('');
      setDesignation(availableRoles[0] || '');
      setDepartment(availableDepartments[0] || '');
      setEntityId(entities[0]?.id || '');
      return;
    }

    const cand = candidates.find(c => c.id === selectedCandidateId);
    if (cand) {
      setFullName(cand.name);
      setEmail(cand.email);
      setPhone(cand.phone);
      setDesignation(cand.designation);
      setDepartment(cand.department || 'Engineering');
      setEntityId(cand.entityId || entities[0]?.id || '');
    }
  }, [selectedCandidateId, candidates, entities, availableDepartments, availableRoles]);

  // Handle entity initialization
  useEffect(() => {
    if (!entityId) {
      setEntityId(entities[0]?.id || '');
    }
  }, [entities, entityId]);

  // Validations
  const validate = () => {
    const errs: { [key: string]: string } = {};

    // Name Validation
    if (!fullName.trim()) {
      errs.fullName = 'Full legal name is required.';
    } else if (fullName.trim().length < 3) {
      errs.fullName = 'Full legal name must be at least 3 characters.';
    }

    // Email Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      errs.email = 'Email address is required.';
    } else if (!emailRegex.test(email.trim())) {
      errs.email = 'Please enter a valid email address (e.g. employee@domain.com).';
    }

    // Phone Validation
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    if (!phone.trim()) {
      errs.phone = 'Contact number is required.';
    } else if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      errs.phone = 'Contact number must be between 7 and 15 digits.';
    }

    // Designation
    if (!designation.trim()) {
      errs.designation = 'Designation/Job Role is required.';
    }

    // Basic Salary
    const salaryVal = parseFloat(basicSalary.replace(/,/g, ''));
    if (!basicSalary.trim()) {
      errs.basicSalary = 'Base monthly salary is required.';
    } else if (isNaN(salaryVal) || salaryVal <= 0) {
      errs.basicSalary = 'Monthly salary must be a valid positive number.';
    } else if (salaryVal < 1000) {
      errs.basicSalary = 'Monthly salary must be at least RM 1,000 (minimum statutory rate).';
    } else if (salaryVal > 100000) {
      errs.basicSalary = 'Monthly salary exceeds permissible limit (RM 100,000).';
    }

    // NRIC / Passport
    const cleanNric = nricPassport.replace(/[^a-zA-Z0-9]/g, '');
    if (!nricPassport.trim()) {
      errs.nricPassport = 'NRIC or Passport number is required.';
    } else if (/^\d+$/.test(cleanNric)) {
      if (cleanNric.length !== 12) {
        errs.nricPassport = 'Malaysian NRIC must be exactly 12 digits (excluding hyphens).';
      }
    } else {
      if (cleanNric.length < 5 || cleanNric.length > 20) {
        errs.nricPassport = 'Passport number must be between 5 and 20 alphanumeric characters.';
      }
    }

    // Income Tax Reference Number
    if (!taxNumber.trim()) {
      errs.taxNumber = 'Income Tax reference number (SG/OG) is required.';
    } else if (taxNumber.trim().length < 7) {
      errs.taxNumber = 'Please enter a valid LHDN income tax number.';
    }

    // EPF KWSP Number (Mandatory for local Malaysian citizens)
    if (nationality === 'Malaysian') {
      const cleanEpf = epfNumber.replace(/[^0-9]/g, '');
      if (!epfNumber.trim()) {
        errs.epfNumber = 'EPF number is mandatory for Malaysian citizens.';
      } else if (cleanEpf.length < 7 || cleanEpf.length > 11) {
        errs.epfNumber = 'EPF account number must be between 7 and 11 digits.';
      }
    }

    // SOCSO PERKESO Number
    if (nationality === 'Malaysian') {
      if (!socsoNumber.trim()) {
        errs.socsoNumber = 'SOCSO registration is mandatory for Malaysian citizens.';
      }
    }

    // Bank Account
    if (!bankName.trim()) {
      errs.bankName = 'Bank name is required for payroll processing.';
    }

    const cleanBank = accountNo.replace(/[^0-9]/g, '');
    if (!accountNo.trim()) {
      errs.accountNo = 'Bank account number is required for payroll processing.';
    } else if (cleanBank.length < 8 || cleanBank.length > 18) {
      errs.accountNo = 'Bank account must be between 8 and 18 digits.';
    }

    // Emergency Contact
    if (!emergencyContactName.trim()) {
      errs.emergencyContactName = 'Emergency contact name is required.';
    } else if (emergencyContactName.trim().length < 3) {
      errs.emergencyContactName = 'Emergency contact name must be at least 3 characters.';
    }

    const cleanEmergPhone = emergencyContactPhone.replace(/[^0-9+]/g, '');
    if (!emergencyContactPhone.trim()) {
      errs.emergencyContactPhone = 'Emergency contact phone number is required.';
    } else if (cleanEmergPhone.length < 7 || cleanEmergPhone.length > 15) {
      errs.emergencyContactPhone = 'Emergency contact phone number must be between 7 and 15 digits.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      onShowNotification('Validation Error', 'Please correct the highlighted onboarding mistakes.');
      return;
    }

    setIsSubmitting(true);
    try {
      const salaryAmount = parseFloat(basicSalary.replace(/,/g, ''));
      const safeEmpName = fullName.trim().toUpperCase().replace(/\s+/g, '_');

      // Create a dynamic, robust Employee object
      const newEmpId = `EMP-${String(Math.floor(10000 + Math.random() * 90000))}`;
      
      const newEmployee: Employee = {
        id: newEmpId,
        entityId: entityId || entities[0]?.id || '',
        name: fullName.toUpperCase(),
        email: email.toLowerCase(),
        designation: designation,
        department: department,
        status: 'Active',
        bankName: bankName,
        accountNo: accountNo.replace(/[^0-9]/g, ''),
        basicSalary: salaryAmount,
        housingAllowance: department === 'Strategy' || department === 'Finance' ? 400 : 0,
        transportAllowance: department === 'Marketing' ? 300 : 150,
        overtime: 0,
        performanceBonus: 0,
        epfRateEmployee: 11,
        epfRateEmployer: salaryAmount > 5000 ? 12 : 13,
        socsoEmployee: salaryAmount * 0.005, // approximate
        socsoEmployer: salaryAmount * 0.0175,
        skbbkEmployee: parseFloat((salaryAmount * 0.005 * 0.25).toFixed(2)),
        skbbkEmployer: parseFloat((salaryAmount * 0.0175 * 0.25).toFixed(2)),
        eisEmployee: salaryAmount * 0.002,
        eisEmployer: salaryAmount * 0.002,
        taxPcb: salaryAmount > 4000 ? (salaryAmount - 4000) * 0.15 : 0,
        unpaidLeave: 0,
        hrdCorp: salaryAmount * 0.01,
        nricPassport: formatNricOrPassport(nricPassport),
        nationality: nationality,
        contactNumber: phone,
        taxNumber: taxNumber.toUpperCase(),
        epfNumber: epfNumber || undefined,
        socsoNumber: socsoNumber.replace(/-/g, ''),
        employmentType: employmentType,
        maritalStatus: maritalStatus,
        eligibleForStatutory: 'Yes',
        emergencyContactName: emergencyContactName,
        emergencyContactRelation: emergencyContactRelation,
        emergencyContactPhone: emergencyContactPhone,
        dateOfJoined: dateOfJoined,
        careerHistory: [
          {
            id: `CH-${Date.now()}`,
            date: dateOfJoined,
            type: 'Hired',
            previousValue: 'None (Candidate)',
            newValue: `Hired as ${designation} (${employmentType})`,
            notes: 'Completed full-fidelity statutory onboarding. Record initialized.'
          }
        ],
        icFrontUrl: icFront?.name || `${safeEmpName}_IC_Front.pdf`,
        icBackUrl: icBack?.name || `${safeEmpName}_IC_Back.pdf`,
        educationCertUrl: certOfEducation?.name || `${safeEmpName}_Education_Cert.pdf`
      };

      // Trigger parent callback
      await onOnboardingComplete(newEmployee);

      // If a candidate was selected and we have an advance handler, mark them completed
      if (selectedCandidateId !== 'manual' && onAdvanceCandidateStage) {
        // Set progress to 100 and clean up stage
        await onAdvanceCandidateStage(selectedCandidateId, 'Onboarding');
      }

      // Reset Form
      setSelectedCandidateId('manual');
      setFullName('');
      setEmail('');
      setPhone('');
      setDesignation('');
      setBasicSalary('');
      setNricPassport('');
      setTaxNumber('');
      setEpfNumber('');
      setSocsoNumber('');
      setAccountNo('');
      setEmergencyContactName('');
      setEmergencyContactPhone('');
      setIcFront(null);
      setIcBack(null);
      setCertOfEducation(null);
      setErrors({});

      onShowNotification(
        'Onboarding Finalized',
        `Employee ${newEmployee.name} has been successfully registered and appended to the active directory.`
      );
    } catch (err: any) {
      onShowNotification('Onboarding Error', `Failed to finalize onboarding: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Extract candidates currently in 'Onboarding' or 'Offered' stage for fast lookup
  const eligibleCandidates = candidates.filter(c => c.stage === 'Onboarding' || c.stage === 'Offered');

  return (
    <div className="bg-white border border-neutral-border rounded-lg shadow-sm overflow-hidden text-left">
      {/* Banner / Header */}
      <div className="bg-primary/5 border-b border-primary/10 p-5 flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <UserCheck className="w-5 h-5" /> Statutory Employee Onboarding
          </h2>
          <p className="text-xs text-on-surface-variant">
            Process statutory accounts, banking routes, and emergency contacts to transition candidates to active payroll.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-neutral-border rounded text-xs font-mono">
          <span className="font-semibold text-on-surface-variant">LHDN / KWSP Borang Standard Compliant</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Candidate Selector Link */}
        {!hasCandidateParam && (
          <div className="p-4 bg-neutral-50/50 rounded border border-neutral-border/60">
            <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5">
              Link Prospect / Selected Candidate
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedCandidateId}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
                className="bg-white border border-neutral-border rounded p-2 text-xs font-semibold focus:ring-1 focus:ring-primary outline-none max-w-sm"
              >
                <option value="manual">-- Standard Manual Entry (No Link) --</option>
                {eligibleCandidates.map(cand => (
                  <option key={cand.id} value={cand.id}>
                    {cand.name} ({cand.designation} - Stage: {cand.stage})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-on-surface-variant/80 self-center leading-relaxed">
                Linking a prospect pre-populates basic details and updates their status in the recruitment pipeline upon submission.
              </p>
            </div>
          </div>
        )}

        {/* Form Sections Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          
          {/* Section A: Employment & Basic Info */}
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-primary border-b border-neutral-100 pb-2 flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-primary" /> Employment & Designation Profile
            </h3>

            <div>
              <label className="block font-bold text-on-surface-variant uppercase mb-1">
                Full Legal Name (as per NRIC / Passport) <span className="text-error">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. AMINAH BINTI ABDUL HALIM"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={`w-full bg-white border ${errors.fullName ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none uppercase font-semibold`}
              />
              {errors.fullName && (
                <span className="text-error text-[10px] mt-1 block font-semibold">{errors.fullName}</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">
                  Corporate Email Address <span className="text-error">*</span>
                </label>
                <input
                  type="email"
                  placeholder="aminah.h@acme.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full bg-white border ${errors.email ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono`}
                />
                {errors.email && (
                  <span className="text-error text-[10px] mt-1 block font-semibold">{errors.email}</span>
                )}
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">
                  Primary Contact Number <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  placeholder="+60123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`w-full bg-white border ${errors.phone ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono`}
                />
                {errors.phone && (
                  <span className="text-error text-[10px] mt-1 block font-semibold">{errors.phone}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">
                  Job Designation Role <span className="text-error">*</span>
                </label>
                <select
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className={`w-full bg-white border ${errors.designation ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none font-semibold text-primary`}
                >
                  {(() => {
                    const rolesToRender = [...availableRoles];
                    if (designation && !rolesToRender.includes(designation)) {
                      rolesToRender.push(designation);
                    }
                    return rolesToRender.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ));
                  })()}
                </select>
                {errors.designation && (
                  <span className="text-error text-[10px] mt-1 block font-semibold">{errors.designation}</span>
                )}
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">Department</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none font-semibold text-primary"
                >
                  {(() => {
                    const deptsToRender = [...availableDepartments];
                    if (department && !deptsToRender.includes(department)) {
                      deptsToRender.push(department);
                    }
                    return deptsToRender.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ));
                  })()}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div style={{ display: 'none' }} className="col-span-2">
                <label className="block font-bold text-on-surface-variant uppercase mb-1">Assign Corporate Subsidiary</label>
                <select
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                >
                  {entities.map(ent => (
                    <option key={ent.id} value={ent.id}>{ent.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">Employment Type</label>
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value as any)}
                  className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="Internship">Internship</option>
                  <option value="Probation">Probation</option>
                  <option value="Permanent">Permanent</option>
                  <option value="Fixed Term Contract">Fixed Term Contract</option>
                  <option value="Independent Contractor">Independent Contractor</option>
                  <option value="Part Time">Part Time</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">Commencement Date</label>
                <input
                  type="date"
                  value={dateOfJoined}
                  onChange={(e) => setDateOfJoined(e.target.value)}
                  className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">
                  Basic Monthly Salary (MYR) <span className="text-error">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-on-surface-variant/70 font-mono">RM</span>
                  <input
                    type="text"
                    placeholder="4,500"
                    value={basicSalary}
                    onChange={(e) => setBasicSalary(e.target.value)}
                    className={`w-full bg-white border ${errors.basicSalary ? 'border-error' : 'border-neutral-border'} rounded pl-9 pr-2 py-2 focus:ring-1 focus:ring-primary outline-none font-mono font-semibold`}
                  />
                </div>
                {errors.basicSalary && (
                  <span className="text-error text-[10px] mt-1 block font-semibold">{errors.basicSalary}</span>
                )}
              </div>
            </div>
          </div>

          {/* Section B: Personal & Statutory Compliance */}
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-primary border-b border-neutral-100 pb-2 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-primary" /> Personal & Statutory Compliance
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">
                  NRIC / Passport Number <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 951214-14-5512"
                  value={nricPassport}
                  onChange={(e) => setNricPassport(formatNricOrPassport(e.target.value))}
                  className={`w-full bg-white border ${errors.nricPassport ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono uppercase`}
                />
                {errors.nricPassport && (
                  <span className="text-error text-[10px] mt-1 block font-semibold">{errors.nricPassport}</span>
                )}
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">Nationality</label>
                <select
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="Malaysian">Malaysian</option>
                  <option value="PR / Resident Non-Citizen">PR Resident</option>
                  <option value="Foreign National">Foreign National</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="block font-bold text-on-surface-variant uppercase mb-1">Marital Status</label>
                <select
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value as any)}
                  className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Divorced">Divorced</option>
                  <option value="Widowed">Widowed</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block font-bold text-on-surface-variant uppercase mb-1">
                  LHDN Income Tax Number <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. SG 1283749010"
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                  className={`w-full bg-white border ${errors.taxNumber ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono`}
                />
                {errors.taxNumber && (
                  <span className="text-error text-[10px] mt-1 block font-semibold">{errors.taxNumber}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">
                  EPF Number {nationality === 'Malaysian' && <span className="text-error">*</span>}
                </label>
                <input
                  type="text"
                  placeholder="e.g. 12938471"
                  value={epfNumber}
                  disabled={nationality !== 'Malaysian'}
                  onChange={(e) => setEpfNumber(e.target.value)}
                  className={`w-full bg-white border ${errors.epfNumber ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono disabled:bg-neutral-100 disabled:cursor-not-allowed`}
                />
                {errors.epfNumber && (
                  <span className="text-error text-[10px] mt-1 block font-semibold">{errors.epfNumber}</span>
                )}
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">
                  SOCSO Number {nationality === 'Malaysian' && <span className="text-error">*</span>}
                </label>
                <input
                  type="text"
                  placeholder="e.g. 951214145512"
                  value={socsoNumber}
                  disabled={nationality !== 'Malaysian'}
                  onChange={(e) => setSocsoNumber(e.target.value)}
                  className={`w-full bg-white border ${errors.socsoNumber ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono disabled:bg-neutral-100 disabled:cursor-not-allowed`}
                />
                {errors.socsoNumber && (
                  <span className="text-error text-[10px] mt-1 block font-semibold">{errors.socsoNumber}</span>
                )}
              </div>
            </div>
            
            <div className="p-3 bg-blue-50/30 rounded border border-blue-200/50">
              <p className="text-[10px] leading-relaxed text-primary/90">
                <strong>Local Statutory Mandate:</strong> EPF (KWSP) Borang 3 and SOCSO Form 2 registration is automatically computed based on these inputs. Submitting registers active monthly contribution streams in our payroll registers.
              </p>
            </div>
          </div>

        </div>

        {/* Section C: Bank & Emergency Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs pt-4 border-t border-neutral-100">
          
          {/* Section C1: Bank Accounts */}
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-primary border-b border-neutral-100 pb-2 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-primary" /> Payroll Disbursement & Bank Account
            </h3>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">Disbursement Bank</label>
                <input
                  type="text"
                  list="onboarding-bank-options"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Select or enter bank name"
                  className={`w-full bg-white border ${errors.bankName ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none font-semibold text-on-surface`}
                />
                <datalist id="onboarding-bank-options">
                  {MALAYSIAN_BANK_NAMES.map(bank => <option key={bank} value={bank} />)}
                </datalist>
                {errors.bankName && (
                  <span className="text-error text-[10px] mt-1 block font-semibold">{errors.bankName}</span>
                )}
              </div>

              <div className="col-span-2">
                <label className="block font-bold text-on-surface-variant uppercase mb-1">
                  Bank Account Number <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 164012345678"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  className={`w-full bg-white border ${errors.accountNo ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono font-semibold`}
                />
                {errors.accountNo && (
                  <span className="text-error text-[10px] mt-1 block font-semibold">{errors.accountNo}</span>
                )}
              </div>
            </div>
          </div>

          {/* Section C2: Emergency Contact */}
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-primary border-b border-neutral-100 pb-2 flex items-center gap-1.5">
              <User className="w-4 h-4 text-primary" /> Emergency Contact
            </h3>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block font-bold text-on-surface-variant uppercase mb-1">
                  Contact Name <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. FATIMAH BINTI OTHMAN"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  className={`w-full bg-white border ${errors.emergencyContactName ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none`}
                />
                {errors.emergencyContactName && (
                  <span className="text-error text-[10px] mt-1 block font-semibold">{errors.emergencyContactName}</span>
                )}
              </div>

              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">Relationship</label>
                <select
                  value={emergencyContactRelation}
                  onChange={(e) => setEmergencyContactRelation(e.target.value)}
                  className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                >
                  <option>Spouse</option>
                  <option>Parent</option>
                  <option>Sibling</option>
                  <option>Child</option>
                  <option>Friend</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-on-surface-variant uppercase mb-1">
                Emergency Contact Number <span className="text-error">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. +60172938472"
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)}
                className={`w-full bg-white border ${errors.emergencyContactPhone ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono`}
              />
              {errors.emergencyContactPhone && (
                <span className="text-error text-[10px] mt-1 block font-semibold">{errors.emergencyContactPhone}</span>
              )}
            </div>
          </div>

        </div>

        {/* Section D: Required Document Uploads */}
        <div className="pt-6 border-t border-neutral-100 space-y-4">
          <h3 className="font-bold text-sm text-primary flex items-center gap-1.5">
            <UploadCloud className="w-4 h-4 text-primary" /> Required Document Uploads
          </h3>
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            Please drag and drop or select the required corporate compliance files below. Uploading these documents is mandatory to finalize legal HR registration.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <DocumentUploader
                id="ic-front-upload"
                label="IC Front Photo / Scan *"
                sublabel="PDF, PNG, JPG (Max 5MB)"
                file={icFront}
                onFileSelect={setIcFront}
              />
              {errors.icFront && (
                <span className="text-error text-[10px] mt-1.5 block font-semibold leading-relaxed">{errors.icFront}</span>
              )}
            </div>

            <div>
              <DocumentUploader
                id="ic-back-upload"
                label="IC Back Photo / Scan *"
                sublabel="PDF, PNG, JPG (Max 5MB)"
                file={icBack}
                onFileSelect={setIcBack}
              />
              {errors.icBack && (
                <span className="text-error text-[10px] mt-1.5 block font-semibold leading-relaxed">{errors.icBack}</span>
              )}
            </div>

            <div>
              <DocumentUploader
                id="education-cert-upload"
                label="Certificate of Education *"
                sublabel="PDF, PNG, JPG (Max 5MB)"
                file={certOfEducation}
                onFileSelect={setCertOfEducation}
              />
              {errors.certOfEducation && (
                <span className="text-error text-[10px] mt-1.5 block font-semibold leading-relaxed">{errors.certOfEducation}</span>
              )}
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="pt-6 border-t border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-on-surface-variant/80 font-mono">
            <AlertCircle className="w-4 h-4 text-primary" />
            <span>Please double-check banking and NRIC profiles. These form the base ledger for Inland Revenue.</span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`font-bold py-2.5 px-6 rounded text-xs transition-opacity shadow-sm cursor-pointer flex items-center gap-2 ${
              isSubmitting 
                ? 'bg-zinc-400 text-zinc-100 cursor-not-allowed' 
                : 'bg-primary hover:opacity-95 text-white'
            }`}
          >
            <Save className="w-4 h-4" /> {isSubmitting ? 'Finalizing & Syncing Record...' : 'Finalize & Commit Onboarding Record'}
          </button>
        </div>

      </form>
    </div>
  );
}
