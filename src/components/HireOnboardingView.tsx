/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  UserPlus, 
  CheckSquare, 
  Briefcase, 
  MapPin, 
  ArrowRight, 
  CheckCircle, 
  ChevronRight, 
  Plus, 
  Clock, 
  Mail, 
  Phone,
  Compass,
  FileBadge,
  FileText,
  LayoutGrid,
  UserCheck,
  Share2,
  Link as LinkIcon,
  BookOpen
} from 'lucide-react';
import { CorporateEntity, Candidate, Employee } from '../types';
import JobApplicationForm from './JobApplicationForm';
import OnboardingForm from './OnboardingForm';
import { getGmt8DateString } from '../lib/dateUtils';
import { getCandidateNameFromApplication } from '../lib/employeeInput';
import {
  getHireOnboardingSectionFromPath,
  getPathForHireOnboardingSection,
  HireOnboardingSection
} from '../lib/appRoutes';

const OnboardingPortalView = React.lazy(() => import('./OnboardingPortalView'));

interface OnboardingTask {
  id: string;
  title: string;
  completed: boolean;
  category: 'Compliance' | 'IT Setup' | 'Training' | 'Admin';
}

interface HireOnboardingViewProps {
  entities: CorporateEntity[];
  onShowNotification: (title: string, message: string) => void;
  onAddEmployee?: (newEmployee: Employee) => Promise<void>;
  employees: Employee[];
  candidates: Candidate[];
  onAddCandidate: (newCandidate: Candidate) => Promise<void>;
  onUpdateCandidate: (id: string, updates: Partial<Candidate>) => Promise<void>;
  onUpdateEmployee?: (id: string, updates: Partial<Employee>) => Promise<void>;
  currentUserName?: string | null;
  currentUserEmail?: string | null;
  currentUserRole?: string | null;
}

const INITIAL_ONBOARDING_TASKS: OnboardingTask[] = [
  { id: 'T-01', title: 'Submit signed Letter of Offer', completed: true, category: 'Compliance' },
  { id: 'T-02', title: 'Upload LHDN Tax & KWSP EPF Credentials', completed: true, category: 'Compliance' },
  { id: 'T-03', title: 'Configure corporate GSuite email address', completed: true, category: 'IT Setup' },
  { id: 'T-04', title: 'Ship company Macbook & accessories', completed: false, category: 'IT Setup' },
  { id: 'T-05', title: 'Complete first-week security training module', completed: false, category: 'Training' },
  { id: 'T-06', title: 'Conduct HR statutory compliance walkthrough', completed: false, category: 'Admin' }
];

export default function HireOnboardingView({
  entities,
  onShowNotification,
  onAddEmployee,
  employees,
  candidates,
  onAddCandidate,
  onUpdateCandidate,
  onUpdateEmployee,
  currentUserName,
  currentUserEmail,
  currentUserRole
}: HireOnboardingViewProps) {
  const [tasks, setTasks] = useState<OnboardingTask[]>(INITIAL_ONBOARDING_TASKS);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [activeTab, setActiveTab] = useState<HireOnboardingSection>(() => (
    getHireOnboardingSectionFromPath(window.location.pathname)
  ));

  const navigateToSection = (section: HireOnboardingSection, replace = false) => {
    setActiveTab(section);
    const nextPath = getPathForHireOnboardingSection(section);
    if (window.location.pathname !== nextPath || window.location.search) {
      window.history[replace ? 'replaceState' : 'pushState']({ section }, '', nextPath);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getHireOnboardingSectionFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
    setCandRole(current => current || rls[0] || '');
    setCandDept(current => depts.includes(current) ? current : (depts[0] || ''));
  }, []);

  const handleApplicationSubmit = async (formData: any) => {
    const newCandidate: Candidate = {
      id: formData.id || `CAN-${Date.now()}`,
      name: getCandidateNameFromApplication(formData),
      email: formData.email,
      phone: formData.phone,
      designation: formData.designation,
      department: formData.department || availableDepartments[0] || 'Human Resources',
      entityId: formData.entityId || entities[0]?.id || '',
      stage: formData.stage || 'Applied',
      progress: Number(formData.progress || 0),
      dateJoined: formData.dateJoined || getGmt8DateString()
    };

    await onAddCandidate(newCandidate);
    setSelectedCandidateId(newCandidate.id);
    navigateToSection('pipeline');
    onShowNotification(
      'Applicant Registered', 
      `Direct application for ${newCandidate.name} has been added to the hiring pipeline.`
    );
  };

  const handleOnboardingComplete = async (newEmployee: Employee) => {
    if (!onAddEmployee) throw new Error('Employee enrollment is unavailable.');
    await onAddEmployee(newEmployee);
    navigateToSection('pipeline');
  };

  const handleOnboardingStageAdvance = async (candidateId: string, stage: 'Applied' | 'Interviewing' | 'Offered' | 'Onboarding') => {
    await onUpdateCandidate(candidateId, { stage, progress: 100 });
  };

  // Candidate Create Form States
  const [candName, setCandName] = useState('');
  const [candEmail, setCandEmail] = useState('');
  const [candPhone, setCandPhone] = useState('');
  const [candRole, setCandRole] = useState('');
  const [candDept, setCandDept] = useState('Engineering');
  const [candEntity, setCandEntity] = useState(entities[0]?.id || '');
  const [isSavingCandidate, setIsSavingCandidate] = useState(false);
  const [candErrors, setCandErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (entities.length > 0 && (!candEntity || candEntity !== entities[0].id)) {
      setCandEntity(entities[0].id);
    }
  }, [entities]);

  const selectedCandidate = candidates.find(c => c.id === selectedCandidateId) || candidates[0];

  const validateCandidate = () => {
    const errs: { [key: string]: string } = {};
    if (!candName.trim()) {
      errs.candName = 'Full Name is required.';
    } else if (candName.trim().length < 3) {
      errs.candName = 'Full Name must be at least 3 characters.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!candEmail.trim()) {
      errs.candEmail = 'Email address is required.';
    } else if (!emailRegex.test(candEmail.trim())) {
      errs.candEmail = 'Please enter a valid email address.';
    }

    if (!candPhone.trim()) {
      errs.candPhone = 'Contact phone number is required.';
    }

    if (!candRole.trim()) {
      errs.candRole = 'Job designation role is required.';
    }

    setCandErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreateCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCandidate()) {
      onShowNotification('Validation Error', 'Please correct the highlighted fields.');
      return;
    }

    setIsSavingCandidate(true);
    try {
      const newCandidate: Candidate = {
        id: `CAN-${Date.now()}`,
        name: candName,
        email: candEmail,
        phone: candPhone,
        designation: candRole,
        department: candDept,
        entityId: candEntity || entities[0]?.id || '',
        stage: 'Applied',
        progress: 0,
        dateJoined: getGmt8DateString()
      };

      await onAddCandidate(newCandidate);
      setSelectedCandidateId(newCandidate.id);
      
      setCandName('');
      setCandEmail('');
      setCandPhone('');
      setCandRole('');
      setCandErrors({});

      onShowNotification(
        'Candidate Added', 
        `Successfully entered ${newCandidate.name} into the hiring pipeline.`
      );
    } catch (err: any) {
      onShowNotification('Save Error', `Failed to register candidate: ${err.message || err}`);
    } finally {
      setIsSavingCandidate(false);
    }
  };

  const handlePromoteStage = async (candidateId: string) => {
    const c = candidates.find(cand => cand.id === candidateId);
    if (c) {
      let nextStage: 'Applied' | 'Interviewing' | 'Offered' | 'Onboarding' = 'Applied';
      if (c.stage === 'Applied') nextStage = 'Interviewing';
      else if (c.stage === 'Interviewing') nextStage = 'Offered';
      else if (c.stage === 'Offered') nextStage = 'Onboarding';
      else if (c.stage === 'Onboarding') {
        onShowNotification('Already Onboarding', 'Candidate has reached the active onboarding phase.');
        return;
      }

      try {
        await onUpdateCandidate(candidateId, { stage: nextStage });
        onShowNotification(
          'Hiring Stage Advanced',
          `Advanced ${c.name} to the "${nextStage}" phase.`
        );
      } catch (error: any) {
        onShowNotification('Stage Update Failed', error.message || 'The candidate stage could not be saved.');
      }
    }
  };

  const handleToggleTask = async (taskId: string) => {
    const updatedTasks = tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, completed: !t.completed };
      }
      return t;
    });
    // Recompute percentage progress for selected candidate
    const completedCount = updatedTasks.filter(t => t.completed).length;
    const percentage = Math.round((completedCount / updatedTasks.length) * 100);

    try {
      await onUpdateCandidate(selectedCandidateId, { progress: percentage });
      setTasks(updatedTasks);
    } catch (error: any) {
      onShowNotification('Task Update Failed', error.message || 'The onboarding progress could not be saved.');
    }
  };

  const activeEntityName = entities.find(e => e.id === selectedCandidate?.entityId)?.name || 'Acme Tech';

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-200 text-left">
      <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-neutral-200/50 pb-4 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-on-background tracking-tight">Hire & Onboarding</h1>
          <p className="text-on-surface-variant mt-1">
            Manage recruitment pipelines and guide newly hired staff through the structured statutory and IT setup process.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start md:self-auto">
          <div className="flex flex-wrap gap-1 border border-neutral-border rounded-lg p-1 bg-white">
            <button
              onClick={() => navigateToSection('pipeline')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-md transition-all ${
                activeTab === 'pipeline'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-on-surface hover:bg-neutral-50'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Hiring Pipeline
            </button>
            <button
              onClick={() => navigateToSection('application-form')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-md transition-all ${
                activeTab === 'application-form'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-on-surface hover:bg-neutral-50'
              }`}
            >
              <FileText className="w-4 h-4" />
              Job Application Form
            </button>
            <button
              onClick={() => navigateToSection('onboarding-form')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-md transition-all ${
                activeTab === 'onboarding-form'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-on-surface hover:bg-neutral-50'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              Onboarding Form
            </button>
            <button
              onClick={() => navigateToSection('onboarding-portal')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-md transition-all ${
                activeTab === 'onboarding-portal'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-on-surface hover:bg-neutral-50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Onboarding Portal
            </button>
          </div>

          <button
            onClick={() => {
              const link = `${window.location.origin}/?form=job-apply`;
              navigator.clipboard.writeText(link);
              onShowNotification('Application Link Copied', 'Public job application form URL copied to clipboard.');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-neutral-border rounded-md bg-white text-on-surface hover:bg-neutral-50 cursor-pointer transition-all"
            title="Copy public job application form link"
          >
            <Share2 className="w-3.5 h-3.5 text-primary animate-pulse" />
            Share Apply Link
          </button>
        </div>
      </div>

      {activeTab === 'onboarding-portal' ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <React.Suspense
            fallback={
              <div className="flex min-h-64 items-center justify-center border-y border-neutral-border text-sm font-semibold text-on-surface-variant">
                Loading Onboarding Portal...
              </div>
            }
          >
            <OnboardingPortalView
              employees={employees}
              candidates={candidates}
              currentUserName={currentUserName}
              currentUserEmail={currentUserEmail}
              currentUserRole={currentUserRole}
              onShowNotification={onShowNotification}
              onUpdateCandidate={onUpdateCandidate}
              onUpdateEmployee={onUpdateEmployee}
            />
          </React.Suspense>
        </div>
      ) : activeTab === 'application-form' ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <JobApplicationForm 
            onApplicationSubmit={handleApplicationSubmit}
            onShowNotification={onShowNotification}
          />
        </div>
      ) : activeTab === 'onboarding-form' ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <OnboardingForm 
            candidates={candidates}
            entities={entities}
            onOnboardingComplete={handleOnboardingComplete}
            onShowNotification={onShowNotification}
            onAdvanceCandidateStage={handleOnboardingStageAdvance}
          />
        </div>
      ) : (
        <>
          {/* Candidate Pipeline Columns (Applied, Interviewing, Offered, Onboarding) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {(['Applied', 'Interviewing', 'Offered', 'Onboarding'] as const).map(stage => {
          const stageCandidates = candidates.filter(c => c.stage === stage);
          return (
            <div key={stage} className="bg-neutral-50 border border-neutral-border rounded-lg p-3 space-y-3 flex flex-col justify-start">
              <div className="flex justify-between items-center border-b border-neutral-200/50 pb-2">
                <span className="font-bold text-[11px] text-on-surface-variant uppercase tracking-wider">{stage}</span>
                <span className="text-[10px] font-bold font-mono text-primary bg-primary-container/10 px-1.5 py-0.5 rounded-full">
                  {stageCandidates.length}
                </span>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto max-h-[220px]">
                {stageCandidates.length === 0 ? (
                  <div className="text-[10px] text-on-surface-variant/60 text-center py-6 italic">
                    No records
                  </div>
                ) : (
                  stageCandidates.map(cand => {
                    const isSelected = cand.id === selectedCandidateId;
                    return (
                      <div
                        key={cand.id}
                        onClick={() => setSelectedCandidateId(cand.id)}
                        className={`p-2.5 rounded border text-xs text-left cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-white border-primary shadow-xs ring-1 ring-primary/20' 
                            : 'bg-white border-neutral-border hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="font-bold text-on-surface hover:text-primary transition-colors truncate pr-1">{cand.name}</div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const link = `${window.location.origin}/?form=onboarding&candidateId=${cand.id}`;
                              navigator.clipboard.writeText(link);
                              onShowNotification('Onboarding Link Copied', `Onboarding link for ${cand.name} copied.`);
                            }}
                            className="p-1 hover:bg-neutral-100 text-on-surface-variant hover:text-primary rounded shrink-0 cursor-pointer transition-colors"
                            title="Copy candidate onboarding link"
                          >
                            <LinkIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-[10px] text-on-surface-variant truncate mt-0.5">{cand.designation}</div>
                        
                        {stage === 'Onboarding' ? (
                          <div className="mt-2 space-y-1">
                            <div className="flex justify-between text-[9px] font-semibold text-on-surface-variant">
                              <span>Checklist</span>
                              <span className="font-mono">{cand.progress}%</span>
                            </div>
                            <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-green-600 h-full transition-all duration-300" style={{ width: `${cand.progress}%` }} />
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 flex justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePromoteStage(cand.id);
                              }}
                              className="px-1.5 py-0.5 bg-neutral-100 hover:bg-neutral-200 border text-[9px] font-bold rounded flex items-center gap-0.5 text-on-surface-variant cursor-pointer"
                              title="Advance hiring phase"
                            >
                              Advance <ArrowRight className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Left hand: Add prospective candidates */}
        <div className="lg:col-span-5 bg-white border border-neutral-border rounded-lg p-5 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-primary flex items-center gap-2 pb-2 border-b border-neutral-100">
            <Plus className="w-4 h-4" /> Log Prospective / Selected Candidate
          </h2>

          <form onSubmit={handleCreateCandidate} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-on-surface-variant uppercase mb-1">
                Full Name <span className="text-error">*</span>
              </label>
              <input 
                type="text" 
                placeholder="e.g. Tan Boon Heong"
                value={candName}
                onChange={(e) => setCandName(e.target.value)}
                className={`w-full bg-white border ${candErrors.candName ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none`}
              />
              {candErrors.candName && (
                <span className="text-error text-[10px] mt-1 block font-semibold">{candErrors.candName}</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">
                  Email Address <span className="text-error">*</span>
                </label>
                <input 
                  type="email" 
                  placeholder="e.g. tan@domain.com"
                  value={candEmail}
                  onChange={(e) => setCandEmail(e.target.value)}
                  className={`w-full bg-white border ${candErrors.candEmail ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none`}
                />
                {candErrors.candEmail && (
                  <span className="text-error text-[10px] mt-1 block font-semibold">{candErrors.candEmail}</span>
                )}
              </div>
              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">
                  Contact Phone <span className="text-error">*</span>
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. +60 17-293 8472"
                  value={candPhone}
                  onChange={(e) => setCandPhone(e.target.value)}
                  className={`w-full bg-white border ${candErrors.candPhone ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none`}
                />
                {candErrors.candPhone && (
                  <span className="text-error text-[10px] mt-1 block font-semibold">{candErrors.candPhone}</span>
                )}
              </div>
            </div>

            <div>
              <label className="block font-bold text-on-surface-variant uppercase mb-1">
                Job Designation Role <span className="text-error">*</span>
              </label>
              <select 
                value={candRole}
                onChange={(e) => setCandRole(e.target.value)}
                className={`w-full bg-white border ${candErrors.candRole ? 'border-error' : 'border-neutral-border'} rounded p-2 focus:ring-1 focus:ring-primary outline-none font-semibold text-primary`}
              >
                {(() => {
                  const rolesToRender = [...availableRoles];
                  if (candRole && !rolesToRender.includes(candRole)) {
                    rolesToRender.push(candRole);
                  }
                  return rolesToRender.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ));
                })()}
              </select>
              {candErrors.candRole && (
                <span className="text-error text-[10px] mt-1 block font-semibold">{candErrors.candRole}</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">Department</label>
                <select 
                  value={candDept}
                  onChange={(e) => setCandDept(e.target.value)}
                  className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none font-semibold text-primary"
                >
                  {(() => {
                    const deptsToRender = [...availableDepartments];
                    if (candDept && !deptsToRender.includes(candDept)) {
                      deptsToRender.push(candDept);
                    }
                    return deptsToRender.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ));
                  })()}
                </select>
              </div>

              <div style={{ display: 'none' }}>
                <label className="block font-bold text-on-surface-variant uppercase mb-1">Assigned Subsidiary</label>
                <select 
                  value={candEntity}
                  onChange={(e) => setCandEntity(e.target.value)}
                  className="w-full bg-white border border-neutral-border rounded p-2 focus:ring-1 focus:ring-primary outline-none animate-none"
                >
                  {entities.map(ent => (
                    <option key={ent.id} value={ent.id}>{ent.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-primary hover:opacity-95 text-white font-semibold py-2 rounded text-xs transition-opacity shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" /> Register Candidate Account
            </button>
          </form>
        </div>

        {/* Right hand: Comprehensive Onboarding Checklist */}
        <div className="lg:col-span-7 bg-white border border-neutral-border rounded-lg p-5 shadow-sm flex flex-col justify-between">
          
          <div className="space-y-4">
            
            {/* Header profile of selected candidate */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Candidate Profile</span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                    selectedCandidate?.stage === 'Onboarding' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {selectedCandidate?.stage}
                  </span>
                </div>
                <h3 className="font-bold text-base text-on-background">{selectedCandidate?.name}</h3>
                
                <div className="flex flex-wrap items-center gap-3 text-[10px] text-on-surface-variant font-mono">
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-on-surface-variant/70" /> {selectedCandidate?.email}</span>
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-on-surface-variant/70" /> {selectedCandidate?.phone}</span>
                </div>
              </div>

              <div className="text-right text-xs shrink-0 font-mono bg-neutral-50 p-2.5 rounded border border-neutral-border/30">
                <div className="text-on-surface-variant text-[10px] font-semibold">Assigned Company</div>
                <div className="font-bold text-primary mt-0.5">{activeEntityName}</div>
              </div>
            </div>

            {selectedCandidate?.stage === 'Onboarding' ? (
              <div className="space-y-3.5 animate-in fade-in duration-300">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-primary" /> Core Compliance & Setup Tasks
                  </span>
                  <span className="text-xs font-bold text-primary font-mono">{selectedCandidate.progress}% Completed</span>
                </div>

                {/* Checklist tasks */}
                <div className="space-y-2">
                  {tasks.map(task => (
                    <div 
                      key={task.id}
                      onClick={() => handleToggleTask(task.id)}
                      className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 cursor-pointer transition-all ${
                        task.completed 
                          ? 'bg-green-50/20 border-green-200 text-on-surface-variant' 
                          : 'bg-white border-neutral-border hover:border-primary/50 text-on-surface'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                          task.completed 
                            ? 'bg-green-600 border-green-600' 
                            : 'border-neutral-border bg-white'
                        }`}>
                          {task.completed && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <span className={task.completed ? 'line-through text-on-surface-variant/70 font-medium' : 'font-bold'}>{task.title}</span>
                      </div>

                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono ${
                        task.category === 'Compliance' 
                          ? 'bg-blue-100 text-blue-700' 
                          : task.category === 'IT Setup' 
                          ? 'bg-purple-100 text-purple-700' 
                          : task.category === 'Training'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-neutral-100 text-neutral-700'
                      }`}>
                        {task.category}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-neutral-200 rounded-lg p-8 text-center text-xs text-on-surface-variant leading-relaxed py-12 flex flex-col items-center justify-center gap-3">
                <Compass className="w-10 h-10 text-on-surface-variant/30" />
                <div>
                  <span className="block font-bold text-on-surface">Compliance Checklist Locked</span>
                  <span className="block mt-0.5">Please click "Advance" on the candidate card above to move this profile into the active "Onboarding" phase first.</span>
                </div>
              </div>
            )}

          </div>

          <div className="mt-6 pt-3 border-t border-neutral-100 flex items-center justify-between text-[11px] font-bold text-on-surface-variant font-mono">
            <span>Onboarding Pipeline Total: <strong>{candidates.filter(c => c.stage === 'Onboarding').length}</strong></span>
            <span className="flex items-center gap-1 text-primary"><FileBadge className="w-3.5 h-3.5 text-primary" /> LHDN / SOCSO Compliant checklist</span>
          </div>
        </div>

      </div>
      </>)}
    </div>
  );
}
