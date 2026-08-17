import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  ShieldCheck,
  UserRoundCheck,
  FlaskConical,
  Users,
  Search,
  CheckCircle,
  Clock,
  Sparkles,
  ExternalLink,
  Award,
} from 'lucide-react';
import { Candidate, Employee } from '../types';
import {
  HANDBOOK_MODULES,
  INITIAL_USER,
  QUIZ_QUESTIONS,
} from '../onboarding-portal/data';
import { HandbookModule, UserProfile } from '../onboarding-portal/types';
import { LanguageProvider } from '../onboarding-portal/i18n/LanguageContext';
import { LanguageSelector } from '../onboarding-portal/components/LanguageSelector';
import { HandbookView } from '../onboarding-portal/components/HandbookView';
import { QuizView } from '../onboarding-portal/components/QuizView';
import { TestOnboardingModal } from '../onboarding-portal/components/TestOnboardingModal';
import {
  createOrResumeSigningSession,
  downloadFinalizedHandbook,
  finalizeSignedHandbook,
  getOfficialHandbookTemplate,
  removeSignatureMark,
  saveSignatureMark,
  saveSigningQuizResult,
} from '../onboarding-portal/signing/signingService';
import {
  FINAL_SIGNATURE_PART_NUMBER,
  HandbookSignatureMark,
  HandbookSigningSession,
  HandbookTemplateAccessResponse,
  INITIAL_PART_NUMBERS,
} from '../onboarding-portal/signing/types';

type PortalPage = 'journey' | 'handbook' | 'quiz' | 'completion';
type ViewRole = 'employee' | 'hr-admin';

interface OnboardingPortalViewProps {
  employees: Employee[];
  candidates: Candidate[];
  currentUserName?: string | null;
  currentUserEmail?: string | null;
  currentUserRole?: string | null;
  onShowNotification: (title: string, message: string) => void;
  onUpdateCandidate?: (id: string, updates: Partial<Candidate>) => Promise<void> | void;
  onUpdateEmployee?: (id: string, updates: Partial<Employee>) => Promise<void> | void;
  embeddedEmployeeMode?: boolean;
}

const PORTAL_NAV_ITEMS: Array<{
  id: PortalPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'journey', label: 'My Onboarding', icon: LayoutDashboard },
  { id: 'handbook', label: 'Employee Handbook', icon: BookOpen },
  { id: 'quiz', label: 'Compliance Quiz', icon: GraduationCap },
  { id: 'completion', label: 'Completion Record', icon: ClipboardCheck },
];

function modulesFromSignatureMarks(
  marks: Record<number, HandbookSignatureMark>
): HandbookModule[] {
  const allInitialsComplete = INITIAL_PART_NUMBERS.every((partNumber) => marks[partNumber]);
  let firstIncompleteFound = false;

  return HANDBOOK_MODULES.map((module) => {
    const mark = marks[module.id];
    if (mark) {
      return {
        ...module,
        status: 'completed',
        completedSections: module.sectionsCount,
      };
    }

    const canStart =
      module.id === 1 ||
      (!firstIncompleteFound &&
        (module.id < FINAL_SIGNATURE_PART_NUMBER || allInitialsComplete));
    firstIncompleteFound = true;
    return {
      ...module,
      status: canStart ? 'in-progress' : 'locked',
      completedSections: 0,
    };
  });
}

function OnboardingPortalContent({
  employees,
  candidates,
  currentUserName,
  currentUserEmail,
  currentUserRole,
  onShowNotification,
  onUpdateCandidate,
  onUpdateEmployee,
  embeddedEmployeeMode = false,
}: OnboardingPortalViewProps) {
  // Role View Mode: default to HR Admin if currentUserRole is admin/hr, else employee
  const [viewRole, setViewRole] = useState<ViewRole>(() => {
    if (embeddedEmployeeMode) return 'employee';
    const r = (currentUserRole || '').toLowerCase();
    if (r.includes('admin') || r.includes('hr') || r.includes('manager')) {
      return 'hr-admin';
    }
    return 'employee';
  });

  const [activePage, setActivePage] = useState<PortalPage>('journey');
  const [selectedCandidateId, setSelectedCandidateId] = useState(candidates[0]?.id || '');
  const [signatureMarks, setSignatureMarks] = useState<
    Record<number, HandbookSignatureMark>
  >({});
  const [modules, setModules] = useState<HandbookModule[]>(() =>
    modulesFromSignatureMarks({})
  );
  const [quizResult, setQuizResult] = useState<{ score: number; grade: string } | null>(
    null
  );
  const [signingSession, setSigningSession] = useState<HandbookSigningSession | null>(
    null
  );
  const [isSigningSaving, setIsSigningSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [handbookTemplate, setHandbookTemplate] =
    useState<HandbookTemplateAccessResponse | null>(null);

  // Test Onboarding Modal state
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [adminCandidateSearch, setAdminCandidateSearch] = useState('');

  useEffect(() => {
    if (embeddedEmployeeMode && viewRole !== 'employee') {
      setViewRole('employee');
    }
  }, [embeddedEmployeeMode, viewRole]);

  useEffect(() => {
    if (
      candidates.length > 0 &&
      !candidates.some((candidate) => candidate.id === selectedCandidateId)
    ) {
      setSelectedCandidateId(candidates[0].id);
    }
  }, [candidates, selectedCandidateId]);

  const user = useMemo<UserProfile>(() => {
    const matchedEmployee = employees.find(
      (employee) =>
        employee.email.toLowerCase() === String(currentUserEmail || '').toLowerCase()
    );

    return {
      ...INITIAL_USER,
      id: matchedEmployee?.id || currentUserEmail || 'HR-ADMIN',
      name: matchedEmployee?.name || currentUserName || 'HR Administrator',
      email: matchedEmployee?.email || currentUserEmail || 'hr@redpoint.com.my',
      role: viewRole,
      avatarUrl: matchedEmployee?.avatarUrl || '/redpoint-logo.png',
      department: matchedEmployee?.department || 'Human Resources',
      joinDate: matchedEmployee?.dateOfJoined || INITIAL_USER.joinDate,
    };
  }, [currentUserEmail, currentUserName, employees, viewRole]);

  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) || candidates[0];
  const linkedEmployee = employees.find(
    (employee) =>
      employee.email.toLowerCase() === selectedCandidate?.email.toLowerCase()
  );
  const journeyName = selectedCandidate?.name || linkedEmployee?.name || user.name;
  const journeyDepartment =
    selectedCandidate?.department || linkedEmployee?.department || user.department;
  const journeyPosition =
    selectedCandidate?.designation || linkedEmployee?.designation || 'Specialist';
  const journeyId = selectedCandidate?.id || linkedEmployee?.id || 'EMP-ONBOARDING';

  const signingSubjectType: 'employee' | 'candidate' = linkedEmployee
    ? 'employee'
    : selectedCandidate
      ? 'candidate'
      : 'employee';
  const signingSubjectId = linkedEmployee?.id || selectedCandidate?.id || user.id;
  const signingSubjectEmail =
    linkedEmployee?.email || selectedCandidate?.email || user.email;
  const signingEntityId =
    linkedEmployee?.entityId || selectedCandidate?.entityId || null;

  useEffect(() => {
    let cancelled = false;
    setSignatureMarks({});
    setModules(modulesFromSignatureMarks({}));
    setQuizResult(null);
    setSigningSession(null);
    setSigningError(null);

    void createOrResumeSigningSession({
      subjectType: signingSubjectType,
      subjectId: signingSubjectId,
      subjectEmail: signingSubjectEmail,
      entityId: signingEntityId,
    })
      .then(({ session, marks }) => {
        if (cancelled) return;
        setSigningSession(session);
        setSignatureMarks(marks);
        setModules(modulesFromSignatureMarks(marks));
        if (
          session.quizScorePercent !== null &&
          session.quizScorePercent !== undefined &&
          session.quizGrade
        ) {
          setQuizResult({
            score: session.quizScorePercent,
            grade: session.quizGrade,
          });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSigningError(
          error instanceof Error ? error.message : 'Secure handbook signing is unavailable.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [signingEntityId, signingSubjectEmail, signingSubjectId, signingSubjectType, selectedCandidateId]);

  useEffect(() => {
    let cancelled = false;
    setHandbookTemplate(null);
    if (!signingSession) return () => {
      cancelled = true;
    };

    void getOfficialHandbookTemplate(signingSession)
      .then((template) => {
        if (!cancelled) setHandbookTemplate(template);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSigningError(
          error instanceof Error ? error.message : 'The official handbook could not be loaded.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [signingSession?.id]);

  const profileComplete = Boolean(selectedCandidate || linkedEmployee);
  const onboardingFormProgress = selectedCandidate?.progress ?? (linkedEmployee ? 100 : 0);
  const completedModules = modules.filter((module) => module.status === 'completed').length;
  const handbookPercent =
    modules.length > 0 ? Math.round((completedModules / modules.length) * 100) : 0;
  const overallProgress = Math.round(
    (profileComplete ? 25 : 0) +
      onboardingFormProgress * 0.25 +
      handbookPercent * 0.25 +
      (quizResult ? 25 : 0)
  );
  const partInitialDataUrls = Object.fromEntries(
    INITIAL_PART_NUMBERS.flatMap((partNumber) => {
      const imageDataUrl = signatureMarks[partNumber]?.imageDataUrl;
      return imageDataUrl ? [[partNumber, imageDataUrl]] : [];
    })
  ) as Record<number, string>;
  const finalSignatureDataUrl =
    signatureMarks[FINAL_SIGNATURE_PART_NUMBER]?.imageDataUrl || null;
  const completionReady =
    INITIAL_PART_NUMBERS.every((partNumber) => signatureMarks[partNumber]) &&
    Boolean(finalSignatureDataUrl) &&
    Boolean(quizResult) &&
    Boolean(signingSession?.quizPassed);

  const handleAcknowledgeModule = (moduleId: number) => {
    setModules((currentModules) =>
      currentModules.map((module) => {
        if (module.id === moduleId) {
          return {
            ...module,
            status: 'completed',
            completedSections: module.sectionsCount,
          };
        }
        if (module.id === moduleId + 1 && module.status === 'locked') {
          return { ...module, status: 'in-progress' };
        }
        return module;
      })
    );
  };

  const saveMark = async (
    partNumber: number,
    kind: 'initial' | 'final_signature',
    imageDataUrl: string
  ) => {
    let currentSession = signingSession;
    if (!currentSession) {
      const res = await createOrResumeSigningSession({
        subjectType: signingSubjectType,
        subjectId: signingSubjectId,
        subjectEmail: signingSubjectEmail,
        entityId: signingEntityId,
      });
      currentSession = res.session;
      setSigningSession(res.session);
    }
    setIsSigningSaving(true);
    try {
      const savedMark = await saveSignatureMark({
        session: currentSession,
        partNumber,
        kind,
        imageDataUrl,
      });
      setSignatureMarks((currentMarks) => {
        const nextMarks = { ...currentMarks, [partNumber]: savedMark };
        setModules(modulesFromSignatureMarks(nextMarks));
        return nextMarks;
      });
      setSigningError(null);

      // Update candidate progress if available
      if (selectedCandidate && onUpdateCandidate) {
        const nextProgress = Math.min(100, Math.max(selectedCandidate.progress, overallProgress));
        onUpdateCandidate(selectedCandidate.id, { progress: nextProgress });
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'The handwritten mark could not be saved.';
      setSigningError(message);
      onShowNotification('Signature Not Saved', message);
      throw error;
    } finally {
      setIsSigningSaving(false);
    }
  };

  const clearMark = async (partNumber: number) => {
    const mark = signatureMarks[partNumber];
    if (!mark) return;
    let currentSession = signingSession;
    if (!currentSession) {
      const res = await createOrResumeSigningSession({
        subjectType: signingSubjectType,
        subjectId: signingSubjectId,
        subjectEmail: signingSubjectEmail,
        entityId: signingEntityId,
      });
      currentSession = res.session;
      setSigningSession(res.session);
    }
    setIsSigningSaving(true);
    try {
      await removeSignatureMark(currentSession, mark);
      setSignatureMarks((currentMarks) => {
        const nextMarks = { ...currentMarks };
        delete nextMarks[partNumber];
        setModules(modulesFromSignatureMarks(nextMarks));
        return nextMarks;
      });
      setSigningError(null);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'The signature mark could not be removed.';
      setSigningError(message);
      onShowNotification('Signature Clear Failed', message);
    } finally {
      setIsSigningSaving(false);
    }
  };

  const handleQuizComplete = (score: number, grade: string) => {
    setQuizResult({ score, grade });
    let currentSession = signingSession;
    if (!currentSession) {
      createOrResumeSigningSession({
        subjectType: signingSubjectType,
        subjectId: signingSubjectId,
        subjectEmail: signingSubjectEmail,
        entityId: signingEntityId,
      }).then((res) => {
        setSigningSession(res.session);
        return saveSigningQuizResult(res.session, score, grade);
      }).then((updatedSession) => {
        setSigningSession(updatedSession);
        setSigningError(null);
      }).catch(() => undefined);
      return;
    }

    setIsSigningSaving(true);
    saveSigningQuizResult(currentSession, score, grade)
      .then((updatedSession) => {
        setSigningSession(updatedSession);
        setSigningError(null);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'The quiz result could not be recorded.';
        setSigningError(message);
        onShowNotification('Quiz Sync Failed', message);
      })
      .finally(() => setIsSigningSaving(false));
  };

  const handleDownloadCompletionRecord = async () => {
    if (!completionReady || !quizResult) {
      onShowNotification(
        'Record Not Ready',
        signingError ||
          'Complete all handbook acknowledgements and the compliance quiz first.'
      );
      return;
    }
    let currentSession = signingSession;
    if (!currentSession) {
      const res = await createOrResumeSigningSession({
        subjectType: signingSubjectType,
        subjectId: signingSubjectId,
        subjectEmail: signingSubjectEmail,
        entityId: signingEntityId,
      });
      currentSession = res.session;
      setSigningSession(res.session);
    }

    setIsFinalizing(true);
    try {
      const markEntries = Object.entries(signatureMarks) as Array<
        [string, HandbookSignatureMark]
      >;
      const marksDataUrls = Object.fromEntries(
        markEntries.map(([k, v]) => [k, v.imageDataUrl || ''])
      );
      const markTimestamps = Object.fromEntries(
        markEntries.map(([k, v]) => [k, v.capturedAt])
      );
      const result = await finalizeSignedHandbook(currentSession, marksDataUrls, {
        name: journeyName,
        department: journeyDepartment,
        position: journeyPosition,
        id: journeyId,
      }, markTimestamps);
      downloadFinalizedHandbook(result.downloadUrl, journeyName, result.revision);
      setSigningSession((prev) =>
        prev
          ? {
              ...prev,
              status: 'finalized',
              finalPdfSha256: result.sha256,
            }
          : prev
      );
      onShowNotification(
        'Completion Record Generated',
        `The signed onboarding record for ${journeyName} has been archived and downloaded.`
      );
    } catch (error: unknown) {
      onShowNotification(
        'Finalization Failed',
        error instanceof Error ? error.message : 'The signed handbook could not be finalized.'
      );
    } finally {
      setIsFinalizing(false);
    }
  };

  const filteredCandidates = candidates.filter((c) => {
    if (!adminCandidateSearch.trim()) return true;
    const q = adminCandidateSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.department.toLowerCase().includes(q) ||
      c.designation.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-w-0 space-y-6 text-left">
      {/* ========================================================================= */}
      {/* ROLE SWITCHER & PORTAL HEADER */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-4 border-b border-neutral-border pb-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-black text-on-background">Onboarding Portal</h2>
          <p className="mt-1 max-w-2xl text-xs sm:text-sm text-on-surface-variant">
            {viewRole === 'employee'
              ? 'Complete your official 7-day handbook orientation, digital signatures, and compliance assessment.'
              : 'Audit candidate onboarding journeys, inspect compliance signatures, and run simulated test onboarding workflows.'}
          </p>
        </div>

        {/* View Mode Toggle & Utility Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View Role Switcher Buttons */}
          {!embeddedEmployeeMode && (
            <div className="inline-flex rounded-lg border border-neutral-border bg-white p-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewRole('employee')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  viewRole === 'employee'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-neutral-50'
                }`}
              >
                <UserRoundCheck className="w-3.5 h-3.5" />
                <span>Employee View</span>
              </button>

              <button
                type="button"
                onClick={() => setViewRole('hr-admin')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  viewRole === 'hr-admin'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-neutral-50'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>HR Admin View</span>
              </button>
            </div>
          )}

          {/* Test Onboarding Action Button */}
          {!embeddedEmployeeMode && (
            <button
              type="button"
              onClick={() => setIsTestModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold border border-purple-200 bg-purple-50 text-purple-900 rounded-lg hover:bg-purple-100 transition-all cursor-pointer shadow-2xs"
              title="Open Onboarding Simulation and Audit Sandbox"
            >
              <FlaskConical className="w-3.5 h-3.5 text-purple-700 animate-pulse" />
              <span>Test Onboarding</span>
            </button>
          )}

          {/* Candidate Switcher Dropdown */}
          {!embeddedEmployeeMode && candidates.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-bold text-on-surface">
              <span className="sr-only">Employee journey</span>
              <select
                value={selectedCandidate?.id || ''}
                onChange={(event) => setSelectedCandidateId(event.target.value)}
                className="h-9 max-w-52 rounded-md border border-neutral-border bg-white px-2 text-xs font-semibold outline-none focus:border-primary cursor-pointer"
                aria-label="Employee journey"
              >
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.department})
                  </option>
                ))}
              </select>
            </label>
          )}

          <LanguageSelector variant="compact" />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* HR ADMIN EXECUTIVE AUDIT OVERVIEW BAR (Visible in HR Admin View) */}
      {/* ========================================================================= */}
      {!embeddedEmployeeMode && viewRole === 'hr-admin' && (
        <div className="p-4 sm:p-5 rounded-xl border border-primary/20 bg-primary/5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary text-white shadow-xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-on-surface">
                  HR Admin & Compliance Audit Center
                </h3>
                <p className="text-xs text-on-surface-variant">
                  Inspecting candidate journey for: <strong className="text-primary">{journeyName}</strong> ({journeyDepartment} • {journeyPosition})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsTestModalOpen(true)}
                className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Launch Test Simulation</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-white rounded-lg border border-neutral-border">
              <p className="text-[11px] font-bold text-on-surface-variant">Total Pipeline</p>
              <p className="text-lg font-black text-on-surface mt-1">{candidates.length} Candidates</p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-neutral-border">
              <p className="text-[11px] font-bold text-on-surface-variant">Handbook Status</p>
              <p className="text-lg font-black text-primary mt-1">
                {completedModules}/15 Parts ({handbookPercent}%)
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-neutral-border">
              <p className="text-[11px] font-bold text-on-surface-variant">Quiz Result</p>
              <p className="text-lg font-black text-emerald-700 mt-1">
                {quizResult ? `${quizResult.score}% (${quizResult.grade})` : 'Pending'}
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-neutral-border">
              <p className="text-[11px] font-bold text-on-surface-variant">Final Sign-off</p>
              <p className="text-lg font-black text-on-surface mt-1">
                {finalSignatureDataUrl ? '✅ Captured' : '⏳ Pending'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PORTAL NAVIGATION TABS */}
      {/* ========================================================================= */}
      <div
        className="grid gap-1 rounded-lg border border-neutral-border bg-white p-1 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Onboarding Portal sections"
      >
        {PORTAL_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActivePage(item.id)}
              className={`flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-on-surface-variant hover:bg-neutral-50 hover:text-on-surface'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* PORTAL PAGE CONTENT */}
      {/* ========================================================================= */}
      <div className="min-w-0">
        {/* TAB 1: MY ONBOARDING JOURNEY OVERVIEW */}
        {activePage === 'journey' && (
          <div className="space-y-6">
            <div className="flex flex-col gap-5 border-b border-neutral-border pb-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold text-primary">{journeyDepartment}</p>
                <h3 className="mt-1 text-2xl font-bold text-on-background">
                  {journeyName}
                </h3>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {selectedCandidate
                    ? `${selectedCandidate.stage} stage • ${selectedCandidate.designation}`
                    : 'Employee onboarding record'}
                </p>
              </div>
              <div className="w-full max-w-sm">
                <div className="mb-2 flex items-center justify-between text-xs font-bold">
                  <span className="text-on-surface-variant">Overall completion</span>
                  <span className="text-primary font-black">{overallProgress}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <JourneyStep
                icon={UserRoundCheck}
                title="Employee profile"
                detail={
                  profileComplete
                    ? 'Identity and employment profile registered.'
                    : 'Employee profile has not been registered.'
                }
                complete={profileComplete}
              />
              <JourneyStep
                icon={FileCheck2}
                title="Onboarding form"
                detail={`${onboardingFormProgress}% of statutory and employment details completed.`}
                complete={onboardingFormProgress >= 100}
              />
              <JourneyStep
                icon={BookOpen}
                title="Employee handbook"
                detail={`${completedModules} of ${modules.length} handbook parts acknowledged.`}
                complete={completedModules === modules.length}
                actionLabel={completedModules === modules.length ? 'Review handbook' : 'Continue handbook'}
                onAction={() => setActivePage('handbook')}
              />
              <JourneyStep
                icon={GraduationCap}
                title="Compliance quiz"
                detail={
                  quizResult
                    ? `${quizResult.score}% (${quizResult.grade})`
                    : 'Assessment has not been completed.'
                }
                complete={Boolean(quizResult)}
                actionLabel={quizResult ? 'Review quiz' : 'Take quiz'}
                onAction={() => setActivePage('quiz')}
              />
            </div>

            {/* HR Admin Candidate Management List (if in HR admin view) */}
            {!embeddedEmployeeMode && viewRole === 'hr-admin' && (
              <div className="mt-8 bg-white rounded-xl border border-neutral-border p-5 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-on-surface">Candidate Pipeline Onboarding Status</h4>
                    <p className="text-xs text-on-surface-variant">Select any candidate below to audit their handbook signatures and quiz records.</p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={adminCandidateSearch}
                      onChange={(e) => setAdminCandidateSearch(e.target.value)}
                      placeholder="Filter candidates..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-border rounded-lg focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-border bg-neutral-50 text-on-surface-variant font-bold">
                        <th className="py-2.5 px-3">Candidate</th>
                        <th className="py-2.5 px-3">Department</th>
                        <th className="py-2.5 px-3">Stage</th>
                        <th className="py-2.5 px-3">Progress</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-border">
                      {filteredCandidates.map((cand) => (
                        <tr
                          key={cand.id}
                          className={`hover:bg-neutral-50 transition-colors ${
                            cand.id === selectedCandidateId ? 'bg-primary/5 font-semibold' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <p className="font-bold text-on-surface">{cand.name}</p>
                            <p className="text-[11px] text-on-surface-variant">{cand.email}</p>
                          </td>
                          <td className="py-2.5 px-3 text-on-surface">{cand.department}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-on-surface">
                              {cand.stage}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-neutral-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-primary h-full rounded-full"
                                  style={{ width: `${cand.progress || 0}%` }}
                                />
                              </div>
                              <span className="text-[11px] text-on-surface-variant">{cand.progress || 0}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCandidateId(cand.id);
                                onShowNotification('Switched Candidate', `Now viewing onboarding record for ${cand.name}`);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-primary border border-primary/30 rounded-md hover:bg-primary/10 transition-colors cursor-pointer"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: EMPLOYEE HANDBOOK WITH 7-DAY BRIEFING WORKFLOW */}
        {activePage === 'handbook' && (
          <HandbookView
            modules={modules}
            onAcknowledgeModule={handleAcknowledgeModule}
            onOpenAiAssistant={() => undefined}
            partInitials={partInitialDataUrls}
            finalSignatureDataUrl={finalSignatureDataUrl}
            isSigningLocked={
              signingSession?.status === 'finalized' ||
              isSigningSaving ||
              isFinalizing
            }
            onSavePartInitial={(moduleId, signature) =>
              saveMark(moduleId, 'initial', signature)
            }
            onClearPartInitial={clearMark}
            onSaveFinalSignature={(signature) =>
              saveMark(FINAL_SIGNATURE_PART_NUMBER, 'final_signature', signature)
            }
            onClearFinalSignature={() => clearMark(FINAL_SIGNATURE_PART_NUMBER)}
            onDownloadFullHandbook={() => {
              void handleDownloadCompletionRecord();
            }}
            officialHandbookUrl={handbookTemplate?.downloadUrl || null}
            officialHandbookVersion={handbookTemplate?.version || signingSession?.templateVersion}
            officialHandbookPageCount={handbookTemplate?.pageCount}
            employeeName={journeyName}
            employeeId={journeyId}
            employeeDepartment={journeyDepartment}
            employeePosition={journeyPosition}
            viewRole={viewRole}
            onShowNotification={onShowNotification}
          />
        )}

        {/* TAB 3: COMPLIANCE QUIZ WITH ROLE-BASED MASKING & LINEAR PROGRESSION */}
        {activePage === 'quiz' && (
          <QuizView
            questions={QUIZ_QUESTIONS}
            onCompleteQuiz={handleQuizComplete}
            viewRole={viewRole}
            onShowNotification={onShowNotification}
            employeeName={journeyName}
            employeeId={journeyId}
            department={journeyDepartment}
            position={journeyPosition}
            partInitials={partInitialDataUrls}
            finalSignatureDataUrl={finalSignatureDataUrl}
            onDownloadSignedHandbook={() => {
              void handleDownloadCompletionRecord();
            }}
          />
        )}

        {/* TAB 4: COMPLETION RECORD */}
        {activePage === 'completion' && (
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="border-b border-neutral-border pb-5">
              <p className="text-xs font-bold text-primary">Final Record</p>
              <h3 className="mt-1 text-2xl font-bold text-on-background">
                Completion Record
              </h3>
              <p className="mt-1 text-sm text-on-surface-variant">
                Generate the official signed handbook and quiz record after all
                prerequisites are complete.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <RequirementStatus
                label="Handbook"
                value={`${completedModules}/${modules.length}`}
                complete={completedModules === modules.length}
              />
              <RequirementStatus
                label="Compliance Quiz"
                value={quizResult ? `${quizResult.score}%` : 'Pending'}
                complete={Boolean(quizResult)}
              />
              <RequirementStatus
                label="Digital Signature"
                value={finalSignatureDataUrl ? 'Captured' : 'Pending'}
                complete={Boolean(finalSignatureDataUrl)}
              />
            </div>

            <div className="flex flex-col gap-4 border-y border-neutral-border py-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                    completionReady
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-neutral-100 text-on-surface-variant'
                  }`}
                >
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-on-surface">
                    {completionReady ? 'Record ready for download' : 'Requirements pending'}
                  </p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {completionReady
                      ? `All onboarding requirements for ${journeyName} are complete.`
                      : 'Finish the handbook acknowledgements and compliance quiz to unlock the record.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleDownloadCompletionRecord();
                }}
                disabled={!completionReady || isSigningSaving || isFinalizing}
                className="flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-on-surface-variant cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Download signed record</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TEST ONBOARDING MODAL (Simulation & Audit Tutorial) */}
      {/* ========================================================================= */}
      {!embeddedEmployeeMode && (
        <TestOnboardingModal
          isOpen={isTestModalOpen}
          onClose={() => setIsTestModalOpen(false)}
          onShowNotification={onShowNotification}
        />
      )}
    </div>
  );
}

interface JourneyStepProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  complete: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

function JourneyStep({
  icon: Icon,
  title,
  detail,
  complete,
  actionLabel,
  onAction,
}: JourneyStepProps) {
  return (
    <div className="flex min-h-28 items-start gap-4 rounded-lg border border-neutral-border bg-white p-4">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
          complete
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-primary-container/20 text-primary'
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-on-surface">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{detail}</p>
          </div>
          {complete ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <Clock3 className="h-4 w-4 shrink-0 text-amber-600" />
          )}
        </div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-3 flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
          >
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function RequirementStatus({
  label,
  value,
  complete,
}: {
  label: string;
  value: string;
  complete: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-border bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-on-surface-variant">{label}</p>
        {complete ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <Clock3 className="h-4 w-4 text-amber-600" />
        )}
      </div>
      <p className="mt-3 text-lg font-bold text-on-surface">{value}</p>
    </div>
  );
}

export default function OnboardingPortalView(props: OnboardingPortalViewProps) {
  return (
    <LanguageProvider>
      <OnboardingPortalContent {...props} />
    </LanguageProvider>
  );
}
