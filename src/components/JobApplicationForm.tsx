/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Upload, 
  Plus, 
  Trash2, 
  ChevronRight, 
  CheckCircle, 
  User, 
  Briefcase, 
  GraduationCap, 
  Languages, 
  Star, 
  DollarSign, 
  Calendar, 
  ShieldAlert,
  Loader2,
  X,
  MapPin,
  FileCheck
} from 'lucide-react';
import { getGmt8DateString } from '../lib/dateUtils';
import { formatNricOrPassport } from '../lib/employeeInput';

interface JobApplicationFormProps {
  onShowNotification: (title: string, message: string) => void;
  onApplicationSubmit?: (candidateData: any) => Promise<void>;
}

interface OtherLanguage {
  id: string;
  name: string;
  proficiency: string;
}

interface PreviousEmployer {
  id: string;
  companyName: string;
  position: string;
  period: string;
  responsibilities: string;
  reasonForLeaving: string;
}

interface Evaluator {
  id: string;
  name: string;
  designation: string;
  date: string;
}

export default function JobApplicationForm({
  onShowNotification,
  onApplicationSubmit
}: JobApplicationFormProps) {
  // Loading and Success States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Form Section 1: Application Details
  const [appDate, setAppDate] = useState(getGmt8DateString());
  const [positionApplied, setPositionApplied] = useState('');
  const [recruitmentChannel, setRecruitmentChannel] = useState('JobStreet');
  const [otherRecruitmentChannel, setOtherRecruitmentChannel] = useState('');

  // Form Section 2: Personal Information
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [nricNumber, setNricNumber] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+60');
  const [phoneNum, setPhoneNum] = useState('');
  const [residentialAddress, setResidentialAddress] = useState('');
  const [dob, setDob] = useState('1998-01-01');
  const [gender, setGender] = useState('Male');
  const [maritalStatus, setMaritalStatus] = useState('Single');

  // Form Section 3: Transportation & Mobility
  const [hasLicense, setHasLicense] = useState('Yes');
  const [transportMethod, setTransportMethod] = useState('Driving own vehicles');
  const [otherTransport, setOtherTransport] = useState('');

  // Form Section 4: Education Background
  const [highestEducation, setHighestEducation] = useState('Degree');
  const [otherEducation, setOtherEducation] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [majorOfCourses, setMajorOfCourses] = useState('');

  // Form Section 5: Language Proficiency (0-10)
  const [langEnglish, setLangEnglish] = useState({ listening: 8, speaking: 8, reading: 8, writing: 8 });
  const [langBM, setLangBM] = useState({ listening: 9, speaking: 9, reading: 9, writing: 9 });
  const [langMandarin, setLangMandarin] = useState({ listening: 0, speaking: 0, reading: 0, writing: 0 });
  const [otherLanguages, setOtherLanguages] = useState<OtherLanguage[]>([]);

  // Form Section 6: Skills & Personality Assessment
  const [speciality, setSpeciality] = useState('');
  const [interests, setInterests] = useState('');
  const [positionUnderstanding, setPositionUnderstanding] = useState('');
  const [suitabilityReason, setSuitabilityReason] = useState('');

  // Form Section 7: Employment History
  const [currentCompany, setCurrentCompany] = useState('');
  const [currentPosition, setCurrentPosition] = useState('');
  const [currentPeriod, setCurrentPeriod] = useState('');
  const [currentResponsibilities, setCurrentResponsibilities] = useState('');
  const [currentReasonForLeaving, setCurrentReasonForLeaving] = useState('');
  const [previousEmployers, setPreviousEmployers] = useState<PreviousEmployer[]>([]);

  // Form Section 8: Compensation & Availability
  const [expectedSalaryMin, setExpectedSalaryMin] = useState('');
  const [expectedSalaryMax, setExpectedSalaryMax] = useState('');
  const [currentSalary, setCurrentSalary] = useState('');
  const [noticePeriod, setNoticePeriod] = useState('');
  const [reportDate, setReportDate] = useState('');

  // Form Section 9: HR / Interviewer Evaluation (Internal Section)
  const [evaluators, setEvaluators] = useState<Evaluator[]>([
    { id: 'eval-1', name: '', designation: '', date: getGmt8DateString() }
  ]);
  const [evalTechnical, setEvalTechnical] = useState(3);
  const [evalCommunication, setEvalCommunication] = useState(3);
  const [evalCultural, setEvalCultural] = useState(3);
  const [evalLeadership, setEvalLeadership] = useState(3);
  const [overallRecommendation, setOverallRecommendation] = useState('Hire');
  const [additionalComments, setAdditionalComments] = useState('');

  // File Input Ref for photo upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Photo Upload Handler
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotoPreview(event.target.result as string);
          onShowNotification('Photo Uploaded', 'Successfully uploaded and previewed applicant photo.');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Helper to trigger file upload
  const triggerPhotoUpload = () => {
    fileInputRef.current?.click();
  };

  // Dynamic Languages helper
  const addOtherLanguage = () => {
    const newLang: OtherLanguage = {
      id: `lang-${Date.now()}`,
      name: '',
      proficiency: 'Intermediate (5-6)'
    };
    setOtherLanguages([...otherLanguages, newLang]);
  };

  const updateOtherLanguageName = (id: string, name: string) => {
    setOtherLanguages(prev => prev.map(lang => lang.id === id ? { ...lang, name } : lang));
  };

  const updateOtherLanguageProficiency = (id: string, proficiency: string) => {
    setOtherLanguages(prev => prev.map(lang => lang.id === id ? { ...lang, proficiency } : lang));
  };

  const removeOtherLanguage = (id: string) => {
    setOtherLanguages(prev => prev.filter(lang => lang.id !== id));
  };

  // Dynamic Previous Employers Helper
  const addPreviousEmployer = () => {
    const newEmp: PreviousEmployer = {
      id: `emp-${Date.now()}`,
      companyName: '',
      position: '',
      period: '',
      responsibilities: '',
      reasonForLeaving: ''
    };
    setPreviousEmployers([...previousEmployers, newEmp]);
  };

  const updatePreviousEmployer = (id: string, fields: Partial<PreviousEmployer>) => {
    setPreviousEmployers(prev => prev.map(emp => emp.id === id ? { ...emp, ...fields } : emp));
  };

  const removePreviousEmployer = (id: string) => {
    setPreviousEmployers(prev => prev.filter(emp => emp.id !== id));
  };

  // Dynamic Evaluators Helper (Max 3)
  const addEvaluator = () => {
    if (evaluators.length >= 3) {
      onShowNotification('Limit Reached', 'A maximum of 3 evaluators are allowed for internal compliance reviews.');
      return;
    }
    const newEval: Evaluator = {
      id: `eval-${Date.now()}`,
      name: '',
      designation: '',
      date: getGmt8DateString()
    };
    setEvaluators([...evaluators, newEval]);
  };

  const updateEvaluator = (id: string, fields: Partial<Evaluator>) => {
    setEvaluators(prev => prev.map(ev => ev.id === id ? { ...ev, ...fields } : ev));
  };

  const removeEvaluator = (id: string) => {
    setEvaluators(prev => prev.filter(ev => ev.id !== id));
  };

  // Form validation function
  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    // 1. Position Applied For
    if (!positionApplied.trim()) {
      newErrors.positionApplied = 'Position applied for is required.';
    }

    // 2. Full Name
    if (!fullName.trim()) {
      newErrors.fullName = 'Full Name is required.';
    } else if (fullName.trim().length < 3) {
      newErrors.fullName = 'Full Name must be at least 3 characters.';
    }

    // 3. NRIC Number
    const cleanNric = nricNumber.replace(/[^a-zA-Z0-9]/g, '');
    if (!nricNumber.trim()) {
      newErrors.nricNumber = 'NRIC or Passport number is required.';
    } else if (/^\d+$/.test(cleanNric)) {
      if (cleanNric.length !== 12) {
        newErrors.nricNumber = 'Malaysian NRIC must be exactly 12 digits (excluding hyphens).';
      }
    } else {
      if (cleanNric.length < 5 || cleanNric.length > 20) {
        newErrors.nricNumber = 'Passport number must be between 5 and 20 alphanumeric characters.';
      }
    }

    // 4. Email Address
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      newErrors.email = 'Email address is required.';
    } else if (!emailRegex.test(email.trim())) {
      newErrors.email = 'Please enter a valid email address (e.g. user@domain.com).';
    }

    // 5. Phone Number
    const cleanPhone = phoneNum.replace(/[^0-9]/g, '');
    if (!phoneNum.trim()) {
      newErrors.phoneNum = 'Contact phone number is required.';
    } else if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      newErrors.phoneNum = 'Phone number must be between 7 and 15 digits.';
    }

    // 6. Expected Salary Min
    const minSalary = parseFloat(expectedSalaryMin.replace(/,/g, ''));
    if (!expectedSalaryMin.trim()) {
      newErrors.expectedSalaryMin = 'Minimum expected salary is required.';
    } else if (isNaN(minSalary) || minSalary <= 0) {
      newErrors.expectedSalaryMin = 'Expected salary must be a positive number.';
    } else if (minSalary < 1000) {
      newErrors.expectedSalaryMin = 'Expected salary must be at least RM 1,000.';
    } else if (minSalary > 100000) {
      newErrors.expectedSalaryMin = 'Expected salary exceeds maximum allowed limit (RM 100,000).';
    }

    // 7. Expected Salary Max
    const maxSalary = parseFloat(expectedSalaryMax.replace(/,/g, ''));
    if (!expectedSalaryMax.trim()) {
      newErrors.expectedSalaryMax = 'Maximum expected salary is required.';
    } else if (isNaN(maxSalary) || maxSalary <= 0) {
      newErrors.expectedSalaryMax = 'Expected salary must be a positive number.';
    } else if (!isNaN(minSalary) && maxSalary < minSalary) {
      newErrors.expectedSalaryMax = 'Maximum expected salary cannot be lower than the minimum.';
    } else if (maxSalary > 100000) {
      newErrors.expectedSalaryMax = 'Expected salary exceeds maximum allowed limit (RM 100,000).';
    }

    // 8. Current Salary
    const currSalary = parseFloat(currentSalary.replace(/,/g, ''));
    if (!currentSalary.trim()) {
      newErrors.currentSalary = 'Current salary is required (enter 0 if unemployed).';
    } else if (isNaN(currSalary) || currSalary < 0) {
      newErrors.currentSalary = 'Current salary must be a non-negative number.';
    } else if (currSalary > 100000) {
      newErrors.currentSalary = 'Current salary exceeds maximum allowed limit (RM 100,000).';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      onShowNotification('Validation Error', 'Please correct the highlighted errors in the form.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (onApplicationSubmit) {
        await onApplicationSubmit({
          id: `CAN-${Date.now()}`,
          name: fullName,
          email: email.toLowerCase(),
          phone: `${countryCode} ${phoneNum}`,
          designation: positionApplied || 'Applicant',
          department: 'Engineering',
          entityId: '',
          stage: overallRecommendation === 'Strong Hire' || overallRecommendation === 'Hire' ? 'Offered' : 'Applied',
          progress: 0,
          dateJoined: reportDate || getGmt8DateString(),
          photoUrl: photoPreview
        });
      }

      setIsSubmitting(false);
      setIsSubmitted(true);
      onShowNotification('Application Processed', 'Job Application Form submitted and pre-screened successfully.');
    } catch (error: any) {
      setIsSubmitting(false);
      onShowNotification('Submission Failed', error.message || 'The application could not be saved.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-4">
      
      {isSubmitted ? (
        <div className="bg-white border border-neutral-border rounded-2xl p-8 text-center shadow-lg space-y-6 animate-in zoom-in-95 duration-300 text-left max-w-lg mx-auto">
          <div className="w-16 h-16 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle className="w-10 h-10" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-on-background tracking-tight">Application Submitted!</h2>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              The statutory compliant job application form has been processed and saved into the corporate applicant repository database.
            </p>
          </div>

          <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-border/40 space-y-3 text-xs font-mono">
            <div className="flex justify-between border-b pb-1.5 border-neutral-200">
              <span className="text-on-surface-variant">Applicant:</span>
              <strong className="text-on-surface font-sans">{fullName}</strong>
            </div>
            <div className="flex justify-between border-b pb-1.5 border-neutral-200">
              <span className="text-on-surface-variant">Position:</span>
              <strong className="text-primary font-sans">{positionApplied}</strong>
            </div>
            <div className="flex justify-between border-b pb-1.5 border-neutral-200">
              <span className="text-on-surface-variant">Internal Rec:</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                overallRecommendation === 'Strong Hire' || overallRecommendation === 'Hire'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}>{overallRecommendation}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Submission Date:</span>
              <span>{appDate}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setIsSubmitted(false);
                // Reset form fields
                setFullName('');
                setPositionApplied('');
                setEmail('');
                setPhoneNum('');
                setPhotoPreview(null);
                setSpeciality('');
                setInterests('');
              }}
              className="flex-1 py-2.5 bg-primary text-white hover:opacity-95 font-semibold text-xs rounded-lg transition-all shadow-xs text-center cursor-pointer"
            >
              Fill New Application
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleFormSubmit} className="space-y-8 text-left">
          
          <div className="bg-white border border-neutral-border rounded-2xl shadow-md overflow-hidden">
            
            {/* Header branding band */}
            <div className="bg-gradient-to-r from-[#1e293b] to-[#0f172a] p-6 text-white flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Malaysian Compliant Job Application Form</h2>
                <p className="text-xs text-slate-300 mt-1">Official employee onboarding & dynamic pipeline register.</p>
              </div>
              <FileCheck className="w-8 h-8 text-white/80 shrink-0" />
            </div>

            <div className="p-6 sm:p-8 space-y-8">
              
              {/* SECTION 1: APPLICATION DETAILS */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">1</div>
                  <h3 className="font-bold text-sm text-on-background uppercase tracking-wide">Application Details</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">Date Applied</label>
                    <input 
                      type="date" 
                      value={appDate}
                      onChange={(e) => setAppDate(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">
                      Position Applied For <span className="text-error">*</span>
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. Senior Software Engineer"
                      value={positionApplied}
                      onChange={(e) => setPositionApplied(e.target.value)}
                      className={`w-full bg-white border ${errors.positionApplied ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none`}
                    />
                    {errors.positionApplied && (
                      <span className="text-error text-[10px] mt-1 block font-semibold">{errors.positionApplied}</span>
                    )}
                  </div>

                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">Recruitment Channel</label>
                    <select
                      value={recruitmentChannel}
                      onChange={(e) => setRecruitmentChannel(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none font-semibold text-on-surface"
                    >
                      <option>JobStreet</option>
                      <option>Ricebowl</option>
                      <option>MyFuture Job</option>
                      <option>Facebook</option>
                      <option>LinkedIn</option>
                      <option>RED / 小红书</option>
                      <option>Recruitment Agency / Headhunter</option>
                      <option>Company Official Website</option>
                      <option>Internal Referral Program</option>
                      <option>Telegram Group</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>

                {/* Conditional Rendering logic for Other Recruitment Channel */}
                {recruitmentChannel === 'Other' && (
                  <div className="animate-in slide-in-from-top-2 duration-200 text-xs">
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">Please specify Other Channel</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Career Fair booth, campus drive, etc."
                      value={otherRecruitmentChannel}
                      onChange={(e) => setOtherRecruitmentChannel(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                )}
              </div>

              {/* SECTION 2: PERSONAL INFORMATION */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">2</div>
                  <h3 className="font-bold text-sm text-on-background uppercase tracking-wide">Personal Information</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-xs">
                  
                  {/* Photo upload block with preview thumbnail */}
                  <div className="md:col-span-1 flex flex-col items-center justify-center border border-neutral-200 rounded-lg p-4 bg-neutral-50 hover:bg-neutral-100 transition-all text-center">
                    <span className="block font-bold text-on-surface-variant uppercase mb-2 text-[10px]">Passport Photo</span>
                    
                    {photoPreview ? (
                      <div className="relative group w-28 h-32 rounded-md overflow-hidden border border-neutral-300 shadow-inner bg-white mb-3">
                        <img src={photoPreview} alt="Applicant preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setPhotoPreview(null)}
                          className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full hover:bg-red-700 transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div 
                        onClick={triggerPhotoUpload}
                        className="w-28 h-32 rounded-md border-2 border-dashed border-neutral-300 hover:border-primary flex flex-col items-center justify-center bg-white mb-3 cursor-pointer transition-all"
                      >
                        <Upload className="w-6 h-6 text-on-surface-variant/40" />
                        <span className="text-[10px] text-on-surface-variant/70 mt-1 font-semibold">Upload Photo</span>
                      </div>
                    )}

                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handlePhotoChange}
                      className="hidden" 
                      accept="image/*"
                    />
                    <button 
                      type="button" 
                      onClick={triggerPhotoUpload}
                      className="text-[10px] text-primary font-bold hover:underline"
                    >
                      Browse Photo
                    </button>
                  </div>

                  {/* Personal details grid */}
                  <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    <div className="sm:col-span-2">
                      <label className="block font-bold text-on-surface-variant uppercase mb-1">
                        Full Name as per NRIC / Passport <span className="text-error">*</span>
                      </label>
                      <input 
                        type="text" 
                        placeholder="e.g. AHMAD RAFIQ BIN KAMARUDDIN"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className={`w-full bg-white border ${errors.fullName ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none font-sans font-semibold text-on-surface`}
                      />
                      {errors.fullName && (
                        <span className="text-error text-[10px] mt-1 block font-semibold">{errors.fullName}</span>
                      )}
                    </div>

                    <div>
                      <label className="block font-bold text-on-surface-variant uppercase mb-1">
                        NRIC Number / Passport Number <span className="text-error">*</span>
                      </label>
                      <input 
                        type="text" 
                        placeholder="e.g. 980101-14-1234 or A1234567"
                        value={nricNumber}
                        onChange={(e) => setNricNumber(formatNricOrPassport(e.target.value))}
                        className={`w-full bg-white border ${errors.nricNumber ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono`}
                      />
                      {errors.nricNumber && (
                        <span className="text-error text-[10px] mt-1 block font-semibold">{errors.nricNumber}</span>
                      )}
                    </div>

                    <div>
                      <label className="block font-bold text-on-surface-variant uppercase mb-1">Nickname / Preferred Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Rafiq"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-on-surface-variant uppercase mb-1">
                        Email Address <span className="text-error">*</span>
                      </label>
                      <input 
                        type="email" 
                        placeholder="e.g. rafiq@gmail.com"
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
                      <div className="flex gap-1.5">
                        <select 
                          value={countryCode}
                          onChange={(e) => setCountryCode(e.target.value)}
                          className="bg-white border border-neutral-border rounded px-2 py-2 focus:ring-1 focus:ring-primary outline-none shrink-0 font-mono"
                        >
                          <option>+60</option>
                          <option>+65</option>
                          <option>+62</option>
                          <option>+66</option>
                        </select>
                        <input 
                          type="text" 
                          placeholder="12-345 6789"
                          value={phoneNum}
                          onChange={(e) => setPhoneNum(e.target.value)}
                          className={`w-full bg-white border ${errors.phoneNum ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono`}
                        />
                      </div>
                      {errors.phoneNum && (
                        <span className="text-error text-[10px] mt-1 block font-semibold">{errors.phoneNum}</span>
                      )}
                    </div>

                    <div>
                      <label className="block font-bold text-on-surface-variant uppercase mb-1">Date of Birth</label>
                      <input 
                        type="date" 
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-on-surface-variant uppercase mb-1">Gender</label>
                      <select 
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option>Male</option>
                        <option>Female</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-on-surface-variant uppercase mb-1">Marital Status</label>
                      <select 
                        value={maritalStatus}
                        onChange={(e) => setMaritalStatus(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option>Single</option>
                        <option>Married</option>
                        <option>Divorced</option>
                        <option>Widowed</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-bold text-on-surface-variant uppercase mb-1 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-on-surface-variant/70" /> Current Residential Area or Address
                      </label>
                      <textarea 
                        rows={2}
                        placeholder="Provide complete residential mailing address for EPF/LHDN statutory record accuracy..."
                        value={residentialAddress}
                        onChange={(e) => setResidentialAddress(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>

                  </div>

                </div>
              </div>

              {/* SECTION 3: TRANSPORTATION & MOBILITY */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">3</div>
                  <h3 className="font-bold text-sm text-on-background uppercase tracking-wide">Transportation & Mobility</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-2">Do you own a Driving License?</label>
                    <div className="flex gap-4 items-center">
                      <label className="flex items-center gap-2 font-semibold cursor-pointer select-none">
                        <input 
                          type="radio" 
                          name="license" 
                          value="Yes" 
                          checked={hasLicense === 'Yes'}
                          onChange={() => setHasLicense('Yes')}
                          className="text-primary focus:ring-primary w-4 h-4"
                        /> Yes
                      </label>
                      <label className="flex items-center gap-2 font-semibold cursor-pointer select-none">
                        <input 
                          type="radio" 
                          name="license" 
                          value="No" 
                          checked={hasLicense === 'No'}
                          onChange={() => setHasLicense('No')}
                          className="text-primary focus:ring-primary w-4 h-4"
                        /> No
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">How do you possess your own transportation</label>
                    <select
                      value={transportMethod}
                      onChange={(e) => setTransportMethod(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none font-semibold text-on-surface"
                    >
                      <option>Public Transport</option>
                      <option>Family / Friend Car Pool</option>
                      <option>Driving own vehicles</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>

                {transportMethod === 'Other' && (
                  <div className="animate-in slide-in-from-top-2 duration-200 text-xs">
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">Please specify Other Transportation</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Motorcycle, corporate shuttle, walk, etc."
                      value={otherTransport}
                      onChange={(e) => setOtherTransport(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                )}
              </div>

              {/* SECTION 4: EDUCATION BACKGROUND */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">4</div>
                  <h3 className="font-bold text-sm text-on-background uppercase tracking-wide">Education Background</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">Highest Education</label>
                    <select
                      value={highestEducation}
                      onChange={(e) => setHighestEducation(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none font-semibold text-on-surface"
                    >
                      <option>PMR/PT3</option>
                      <option>SPM/O-level/UEC</option>
                      <option>STPM/A-level</option>
                      <option>Diploma</option>
                      <option>Degree</option>
                      <option>Master Degree</option>
                      <option>PhD or Higher</option>
                      <option>Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">Name of Institution</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Universiti Malaya (UM)"
                      value={institutionName}
                      onChange={(e) => setInstitutionName(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">Major of Courses</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Bachelor of Computer Science"
                      value={majorOfCourses}
                      onChange={(e) => setMajorOfCourses(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                </div>

                {highestEducation === 'Other' && (
                  <div className="animate-in slide-in-from-top-2 duration-200 text-xs">
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">Please specify Highest Education</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Professional certificate, executive diploma, etc."
                      value={otherEducation}
                      onChange={(e) => setOtherEducation(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                )}
              </div>

              {/* SECTION 5: LANGUAGE PROFICIENCY */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">5</div>
                  <h3 className="font-bold text-sm text-on-background uppercase tracking-wide">Language Proficiency</h3>
                </div>

                <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-border/40 space-y-4">
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Provide score matrices on a <strong>scale of 0 to 10</strong> (where 0 indicates No Knowledge, and 10 indicates Complete Native Proficiency).
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono border-collapse bg-white rounded border border-neutral-border/60">
                      <thead>
                        <tr className="bg-neutral-100 text-[10px] text-on-surface-variant uppercase text-left border-b font-sans font-bold">
                          <th className="p-2 border-r">Language</th>
                          <th className="p-2 border-r text-center">Listening (0-10)</th>
                          <th className="p-2 border-r text-center">Speaking (0-10)</th>
                          <th className="p-2 border-r text-center">Reading (0-10)</th>
                          <th className="p-2 text-center">Writing (0-10)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200">
                        <tr>
                          <td className="p-2.5 font-bold font-sans border-r">English</td>
                          <td className="p-2 border-r text-center">
                            <input 
                              type="number" min="0" max="10" 
                              value={langEnglish.listening} 
                              onChange={(e) => setLangEnglish({ ...langEnglish, listening: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) })}
                              className="w-16 bg-neutral-50 rounded border text-center p-1 font-bold outline-none" 
                            />
                          </td>
                          <td className="p-2 border-r text-center">
                            <input 
                              type="number" min="0" max="10" 
                              value={langEnglish.speaking} 
                              onChange={(e) => setLangEnglish({ ...langEnglish, speaking: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) })}
                              className="w-16 bg-neutral-50 rounded border text-center p-1 font-bold outline-none" 
                            />
                          </td>
                          <td className="p-2 border-r text-center">
                            <input 
                              type="number" min="0" max="10" 
                              value={langEnglish.reading} 
                              onChange={(e) => setLangEnglish({ ...langEnglish, reading: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) })}
                              className="w-16 bg-neutral-50 rounded border text-center p-1 font-bold outline-none" 
                            />
                          </td>
                          <td className="p-2 text-center">
                            <input 
                              type="number" min="0" max="10" 
                              value={langEnglish.writing} 
                              onChange={(e) => setLangEnglish({ ...langEnglish, writing: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) })}
                              className="w-16 bg-neutral-50 rounded border text-center p-1 font-bold outline-none" 
                            />
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2.5 font-bold font-sans border-r">Bahasa Malaysia</td>
                          <td className="p-2 border-r text-center">
                            <input 
                              type="number" min="0" max="10" 
                              value={langBM.listening} 
                              onChange={(e) => setLangBM({ ...langBM, listening: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) })}
                              className="w-16 bg-neutral-50 rounded border text-center p-1 font-bold outline-none" 
                            />
                          </td>
                          <td className="p-2 border-r text-center">
                            <input 
                              type="number" min="0" max="10" 
                              value={langBM.speaking} 
                              onChange={(e) => setLangBM({ ...langBM, speaking: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) })}
                              className="w-16 bg-neutral-50 rounded border text-center p-1 font-bold outline-none" 
                            />
                          </td>
                          <td className="p-2 border-r text-center">
                            <input 
                              type="number" min="0" max="10" 
                              value={langBM.reading} 
                              onChange={(e) => setLangBM({ ...langBM, reading: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) })}
                              className="w-16 bg-neutral-50 rounded border text-center p-1 font-bold outline-none" 
                            />
                          </td>
                          <td className="p-2 text-center">
                            <input 
                              type="number" min="0" max="10" 
                              value={langBM.writing} 
                              onChange={(e) => setLangBM({ ...langBM, writing: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) })}
                              className="w-16 bg-neutral-50 rounded border text-center p-1 font-bold outline-none" 
                            />
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2.5 font-bold font-sans border-r">Mandarin</td>
                          <td className="p-2 border-r text-center">
                            <input 
                              type="number" min="0" max="10" 
                              value={langMandarin.listening} 
                              onChange={(e) => setLangMandarin({ ...langMandarin, listening: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) })}
                              className="w-16 bg-neutral-50 rounded border text-center p-1 font-bold outline-none" 
                            />
                          </td>
                          <td className="p-2 border-r text-center">
                            <input 
                              type="number" min="0" max="10" 
                              value={langMandarin.speaking} 
                              onChange={(e) => setLangMandarin({ ...langMandarin, speaking: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) })}
                              className="w-16 bg-neutral-50 rounded border text-center p-1 font-bold outline-none" 
                            />
                          </td>
                          <td className="p-2 border-r text-center">
                            <input 
                              type="number" min="0" max="10" 
                              value={langMandarin.reading} 
                              onChange={(e) => setLangMandarin({ ...langMandarin, reading: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) })}
                              className="w-16 bg-neutral-50 rounded border text-center p-1 font-bold outline-none" 
                            />
                          </td>
                          <td className="p-2 text-center">
                            <input 
                              type="number" min="0" max="10" 
                              value={langMandarin.writing} 
                              onChange={(e) => setLangMandarin({ ...langMandarin, writing: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) })}
                              className="w-16 bg-neutral-50 rounded border text-center p-1 font-bold outline-none" 
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Dynamic Other Languages Section */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-b border-neutral-200 pb-2">
                      <span className="font-bold text-xs text-on-surface uppercase tracking-wider flex items-center gap-1">
                        <Languages className="w-4 h-4 text-primary" /> Other Languages / Dialects (e.g. Hokkien, Cantonese, Tamil)
                      </span>
                      <button
                        type="button"
                        onClick={addOtherLanguage}
                        className="p-1 px-2 bg-primary hover:opacity-95 text-white font-bold text-[10px] rounded flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Language
                      </button>
                    </div>

                    {otherLanguages.length === 0 ? (
                      <p className="text-[10px] text-on-surface-variant/70 italic text-center py-2">
                        No additional languages logged yet. Click "Add Language" to detail dialects.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs animate-in fade-in duration-200">
                        {otherLanguages.map((lang) => (
                          <div key={lang.id} className="bg-white border p-3 rounded-lg flex items-center justify-between gap-2 shadow-xs">
                            <div className="flex-1 space-y-2">
                              <input 
                                type="text" 
                                placeholder="Dialect or Language Name" 
                                value={lang.name}
                                onChange={(e) => updateOtherLanguageName(lang.id, e.target.value)}
                                className="w-full bg-neutral-50 border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-sans"
                              />
                              <select
                                value={lang.proficiency}
                                onChange={(e) => updateOtherLanguageProficiency(lang.id, e.target.value)}
                                className="w-full bg-neutral-50 border border-neutral-border rounded p-1 focus:ring-1 focus:ring-primary outline-none"
                              >
                                <option>Native / Fluent (9-10)</option>
                                <option>Professional / Good (7-8)</option>
                                <option>Intermediate (5-6)</option>
                                <option>Basic Conversation (3-4)</option>
                                <option>Beginner (1-2)</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeOtherLanguage(lang.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* SECTION 6: SKILLS & PERSONALITY ASSESSMENT */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">6</div>
                  <h3 className="font-bold text-sm text-on-background uppercase tracking-wide">Skills & Personality Assessment</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">What is your speciality?</label>
                    <textarea 
                      rows={3}
                      placeholder="e.g. Full-stack cloud engineering, container orchestration, microservices ledger..."
                      value={speciality}
                      onChange={(e) => setSpeciality(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">What are your interests and hobbies?</label>
                    <textarea 
                      rows={3}
                      placeholder="e.g. Reading history, badminton, playing chess, public volunteer drives..."
                      value={interests}
                      onChange={(e) => setInterests(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">Understanding of the Position</label>
                    <textarea 
                      rows={3}
                      placeholder="Briefly state your primary objectives & role expectations..."
                      value={positionUnderstanding}
                      onChange={(e) => setPositionUnderstanding(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">Why are you suitable for this position?</label>
                    <textarea 
                      rows={3}
                      placeholder="Outline previous key achievements, problem-solving skills, etc..."
                      value={suitabilityReason}
                      onChange={(e) => setSuitabilityReason(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 7: EMPLOYMENT HISTORY */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">7</div>
                  <h3 className="font-bold text-sm text-on-background uppercase tracking-wide">Employment History</h3>
                </div>

                {/* Current/Most Recent Employer Block */}
                <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-border/40 space-y-4 text-xs">
                  <span className="font-bold text-[11px] text-primary uppercase tracking-wider block border-b pb-1">Current or Most Recent Employer</span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-bold text-on-surface-variant uppercase mb-1">Company Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Acme Tech Solutions Sdn Bhd"
                        value={currentCompany}
                        onChange={(e) => setCurrentCompany(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none font-semibold text-on-surface"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-on-surface-variant uppercase mb-1">Position Held</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Software Engineer"
                        value={currentPosition}
                        onChange={(e) => setCurrentPosition(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-on-surface-variant uppercase mb-1">Employment Period</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Jan 2021 - Present"
                        value={currentPeriod}
                        onChange={(e) => setCurrentPeriod(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-on-surface-variant uppercase mb-1">Job Scope / Responsibilities</label>
                      <textarea 
                        rows={3}
                        placeholder="Led frontend development of core HR, payroll, and e-filing systems..."
                        value={currentResponsibilities}
                        onChange={(e) => setCurrentResponsibilities(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none animate-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-on-surface-variant uppercase mb-1">Reason for Leaving</label>
                      <textarea 
                        rows={3}
                        placeholder="Seeking professional growth and looking to work on larger scale SaaS products..."
                        value={currentReasonForLeaving}
                        onChange={(e) => setCurrentReasonForLeaving(e.target.value)}
                        className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none animate-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Previous Employers List (Dynamic) */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-neutral-100 pb-2 pt-2">
                    <span className="font-bold text-xs text-on-surface uppercase tracking-wide flex items-center gap-1">
                      <Briefcase className="w-4 h-4 text-primary" /> Older Previous Employers
                    </span>
                    <button
                      type="button"
                      onClick={addPreviousEmployer}
                      className="p-1 px-2.5 bg-primary hover:opacity-95 text-white font-bold text-[10px] rounded flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Previous Employer
                    </button>
                  </div>

                  {previousEmployers.length === 0 ? (
                    <p className="text-[10px] text-on-surface-variant/70 italic text-center py-2">
                      No older employment history blocks logged. Click "Add" if you have previous corporate records.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {previousEmployers.map((emp, index) => (
                        <div key={emp.id} className="bg-neutral-50/50 p-4 rounded-xl border border-neutral-border/60 relative space-y-4 text-xs animate-in slide-in-from-top-3 duration-200">
                          
                          <div className="flex justify-between items-center border-b pb-1 border-neutral-200">
                            <span className="font-bold text-[10px] text-on-surface-variant uppercase">Previous Employer #{index + 1}</span>
                            <button
                              type="button"
                              onClick={() => removePreviousEmployer(emp.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                              <label className="block font-bold text-on-surface-variant uppercase mb-1">Company Name</label>
                              <input 
                                type="text" 
                                placeholder="e.g. Tech Services Sdn Bhd"
                                value={emp.companyName}
                                onChange={(e) => updatePreviousEmployer(emp.id, { companyName: e.target.value })}
                                className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                              />
                            </div>
                            <div>
                              <label className="block font-bold text-on-surface-variant uppercase mb-1">Position Held</label>
                              <input 
                                type="text" 
                                placeholder="e.g. Junior Web Developer"
                                value={emp.position}
                                onChange={(e) => updatePreviousEmployer(emp.id, { position: e.target.value })}
                                className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                              />
                            </div>
                            <div>
                              <label className="block font-bold text-on-surface-variant uppercase mb-1">Employment Period</label>
                              <input 
                                type="text" 
                                placeholder="e.g. Mar 2018 - Dec 2020"
                                value={emp.period}
                                onChange={(e) => updatePreviousEmployer(emp.id, { period: e.target.value })}
                                className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block font-bold text-on-surface-variant uppercase mb-1">Job Scope / Responsibilities</label>
                              <textarea 
                                rows={2}
                                placeholder="Maintained enterprise content systems, styled HTML templates..."
                                value={emp.responsibilities}
                                onChange={(e) => updatePreviousEmployer(emp.id, { responsibilities: e.target.value })}
                                className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                              />
                            </div>
                            <div>
                              <label className="block font-bold text-on-surface-variant uppercase mb-1">Reason for Leaving</label>
                              <textarea 
                                rows={2}
                                placeholder="Company downsized during the pandemic period..."
                                value={emp.reasonForLeaving}
                                onChange={(e) => updatePreviousEmployer(emp.id, { reasonForLeaving: e.target.value })}
                                className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                              />
                            </div>
                          </div>

                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 8: COMPENSATION & AVAILABILITY */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">8</div>
                  <h3 className="font-bold text-sm text-on-background uppercase tracking-wide">Compensation & Availability</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">
                      Expected Salary MYR (Min) <span className="text-error">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-on-surface-variant/70 font-mono">RM</span>
                      <input 
                        type="text" 
                        placeholder="5,500"
                        value={expectedSalaryMin}
                        onChange={(e) => setExpectedSalaryMin(e.target.value)}
                        className={`w-full bg-white border ${errors.expectedSalaryMin ? 'border-error' : 'border-neutral-border'} rounded pl-9 pr-2 py-2 focus:ring-1 focus:ring-primary outline-none font-mono font-semibold`}
                      />
                    </div>
                    {errors.expectedSalaryMin && (
                      <span className="text-error text-[10px] mt-1 block font-semibold">{errors.expectedSalaryMin}</span>
                    )}
                  </div>

                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">
                      Expected Salary MYR (Max) <span className="text-error">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-on-surface-variant/70 font-mono">RM</span>
                      <input 
                        type="text" 
                        placeholder="7,000"
                        value={expectedSalaryMax}
                        onChange={(e) => setExpectedSalaryMax(e.target.value)}
                        className={`w-full bg-white border ${errors.expectedSalaryMax ? 'border-error' : 'border-neutral-border'} rounded pl-9 pr-2 py-2 focus:ring-1 focus:ring-primary outline-none font-mono font-semibold`}
                      />
                    </div>
                    {errors.expectedSalaryMax && (
                      <span className="text-error text-[10px] mt-1 block font-semibold">{errors.expectedSalaryMax}</span>
                    )}
                  </div>

                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">
                      Current Salary MYR <span className="text-error">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-on-surface-variant/70 font-mono">RM</span>
                      <input 
                        type="text" 
                        placeholder="4,800"
                        value={currentSalary}
                        onChange={(e) => setCurrentSalary(e.target.value)}
                        className={`w-full bg-white border ${errors.currentSalary ? 'border-error' : 'border-neutral-border'} rounded pl-9 pr-2 py-2 focus:ring-1 focus:ring-primary outline-none font-mono font-semibold`}
                      />
                    </div>
                    {errors.currentSalary && (
                      <span className="text-error text-[10px] mt-1 block font-semibold">{errors.currentSalary}</span>
                    )}
                  </div>

                  <div>
                    <label className="block font-bold text-on-surface-variant uppercase mb-1">Notice Period (e.g. 1 Month)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 2 Months"
                      value={noticePeriod}
                      onChange={(e) => setNoticePeriod(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold text-on-surface-variant uppercase mb-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-on-surface-variant/70" /> Available to Report Date
                    </label>
                    <input 
                      type="date" 
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 9: HR / INTERVIEWER EVALUATION (INTERNAL SECTION) */}
              <div className="space-y-4 bg-neutral-100 p-6 rounded-2xl border border-neutral-200">
                <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 text-slate-800 flex items-center justify-center font-bold text-xs">9</div>
                  <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wide">HR / Interviewer Evaluation <span className="text-[10px] font-mono text-primary font-bold">(INTERNAL ONLY)</span></h3>
                </div>

                <p className="text-[11px] text-slate-700 leading-normal font-medium">
                  Interviewer score panel pre-populates default vetting assessments before committing records.
                </p>

                {/* Evaluator dynamic details block (Max 3) */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b border-neutral-200/50 pb-2">
                    <span className="font-bold text-[10px] text-slate-800 uppercase tracking-wide">Vetting Evaluators Panel</span>
                    {evaluators.length < 3 && (
                      <button
                        type="button"
                        onClick={addEvaluator}
                        className="p-1 px-2.5 bg-primary/95 text-white font-bold text-[9px] rounded flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Add Evaluator
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {evaluators.map((ev, idx) => (
                      <div key={ev.id} className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-neutral-300 shadow-xs relative items-end text-xs">
                        <div className="sm:col-span-2">
                          <label className="block font-bold text-slate-700 uppercase mb-0.5 text-[9px]">Evaluator #{idx + 1} Name</label>
                          <input 
                            type="text" 
                            placeholder="e.g. HR Manager Jasmine"
                            value={ev.name}
                            onChange={(e) => updateEvaluator(ev.id, { name: e.target.value })}
                            className="w-full bg-neutral-50 border border-neutral-300 rounded p-1.5 focus:ring-1 focus:ring-primary outline-none font-sans font-semibold text-on-surface"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 uppercase mb-0.5 text-[9px]">Designation</label>
                          <input 
                            type="text" 
                            placeholder="e.g. HR Vetting Specialist"
                            value={ev.designation}
                            onChange={(e) => updateEvaluator(ev.id, { designation: e.target.value })}
                            className="w-full bg-neutral-50 border border-neutral-300 rounded p-1.5 focus:ring-1 focus:ring-primary outline-none"
                          />
                        </div>

                        <div className="flex gap-2 items-center">
                          <div className="flex-1">
                            <label className="block font-bold text-slate-700 uppercase mb-0.5 text-[9px]">Date Reviewed</label>
                            <input 
                              type="date" 
                              value={ev.date}
                              onChange={(e) => updateEvaluator(ev.id, { date: e.target.value })}
                              className="w-full bg-neutral-50 border border-neutral-300 rounded p-1 focus:ring-1 focus:ring-primary outline-none font-mono text-[11px]"
                            />
                          </div>

                          {evaluators.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeEvaluator(ev.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded shrink-0 transition-all mt-3 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Score Matrix 1-5 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  
                  <div className="bg-white p-3 rounded-lg border border-neutral-300">
                    <label className="block font-bold text-slate-800 uppercase mb-1 text-[10px]">Technical Skills (1-5)</label>
                    <select
                      value={evalTechnical}
                      onChange={(e) => setEvalTechnical(parseInt(e.target.value))}
                      className="w-full bg-neutral-50 border border-neutral-300 rounded p-1.5 font-mono font-bold text-primary"
                    >
                      <option>1</option>
                      <option>2</option>
                      <option>3</option>
                      <option>4</option>
                      <option>5</option>
                    </select>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-neutral-300">
                    <label className="block font-bold text-slate-800 uppercase mb-1 text-[10px]">Communication (1-5)</label>
                    <select
                      value={evalCommunication}
                      onChange={(e) => setEvalCommunication(parseInt(e.target.value))}
                      className="w-full bg-neutral-50 border border-neutral-300 rounded p-1.5 font-mono font-bold text-primary"
                    >
                      <option>1</option>
                      <option>2</option>
                      <option>3</option>
                      <option>4</option>
                      <option>5</option>
                    </select>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-neutral-300">
                    <label className="block font-bold text-slate-800 uppercase mb-1 text-[10px]">Cultural Fit (1-5)</label>
                    <select
                      value={evalCultural}
                      onChange={(e) => setEvalCultural(parseInt(e.target.value))}
                      className="w-full bg-neutral-50 border border-neutral-300 rounded p-1.5 font-mono font-bold text-primary"
                    >
                      <option>1</option>
                      <option>2</option>
                      <option>3</option>
                      <option>4</option>
                      <option>5</option>
                    </select>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-neutral-300">
                    <label className="block font-bold text-slate-800 uppercase mb-1 text-[10px]">Leadership (1-5)</label>
                    <select
                      value={evalLeadership}
                      onChange={(e) => setEvalLeadership(parseInt(e.target.value))}
                      className="w-full bg-neutral-50 border border-neutral-300 rounded p-1.5 font-mono font-bold text-primary"
                    >
                      <option>1</option>
                      <option>2</option>
                      <option>3</option>
                      <option>4</option>
                      <option>5</option>
                    </select>
                  </div>

                </div>

                {/* Overall Recommendation & Comments */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  
                  <div className="sm:col-span-1 bg-white p-4 rounded-lg border border-neutral-300">
                    <label className="block font-bold text-slate-800 uppercase mb-1 text-[10px]">Overall Recommendation</label>
                    <select
                      value={overallRecommendation}
                      onChange={(e) => setOverallRecommendation(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-300 rounded p-1.5 font-bold font-sans text-primary"
                    >
                      <option>Strong Hire</option>
                      <option>Hire</option>
                      <option>Hold</option>
                      <option>Reject</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 bg-white p-4 rounded-lg border border-neutral-300">
                    <label className="block font-bold text-slate-800 uppercase mb-1 text-[10px]">Additional Comments / Notes</label>
                    <textarea 
                      rows={2}
                      placeholder="Candidate has high competency in DevOps infrastructure. Strong recommendation for our corporate division..."
                      value={additionalComments}
                      onChange={(e) => setAdditionalComments(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-300 rounded p-2 outline-none"
                    />
                  </div>

                </div>
              </div>

            </div>

            {/* Form Actions with Simulated Modern Spinner */}
            <div className="bg-neutral-50 p-6 border-t border-neutral-200 flex items-center justify-between">
              <span className="text-[11px] text-on-surface-variant flex items-center gap-1">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" /> Form submissions are compliant under Malaysia PDPA act.
              </span>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-primary text-white hover:opacity-95 text-xs font-bold rounded shadow-xs transition-opacity flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Processing Application...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    <span>Submit Compliant Application</span>
                  </>
                )}
              </button>
            </div>

          </div>

        </form>
      )}

    </div>
  );
}
