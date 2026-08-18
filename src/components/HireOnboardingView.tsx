/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  FileText,
  LayoutGrid,
  Link as LinkIcon,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Send,
  Share2,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  Candidate,
  CandidateEvaluation,
  CandidateInterview,
  CandidateInterviewStatus,
  CandidateOffer,
  CandidateOfferStatus,
  CandidatePipelineStatus,
  CorporateEntity,
  Employee,
  HiringPipelineData,
} from '../types';
import JobApplicationForm from './JobApplicationForm';
import OnboardingForm from './OnboardingForm';
import { getGmt8DateString, getGmt8Timestamp } from '../lib/dateUtils';
import { getCandidateNameFromApplication } from '../lib/employeeInput';
import {
  createPipelineHistory,
  getActiveShareLink,
  getCandidateHistory,
  getCandidatePipelineStatus,
  getEffectiveCandidateStatus,
  getPipelineQueue,
  isInterviewUpcoming,
  makeHiringId,
  toIsoDateTime,
} from '../lib/hiringPipeline';
import {
  getHireOnboardingSectionFromPath,
  getPathForHireOnboardingSection,
  HireOnboardingSection,
} from '../lib/appRoutes';
import { useFeedback } from '../context/FeedbackContext';

const OnboardingPortalView = React.lazy(() => import('./OnboardingPortalView'));

type PipelineQueue = 'Applied' | 'KIV' | 'Interviewing' | 'Offered' | 'Onboarding';
type InterviewView = 'upcoming' | 'passed';
type OfferFilter = 'all' | CandidateOfferStatus;

interface HireOnboardingViewProps {
  entities: CorporateEntity[];
  onShowNotification: (title: string, message: string) => void;
  onAddEmployee?: (newEmployee: Employee) => Promise<void>;
  employees: Employee[];
  candidates: Candidate[];
  hiringPipeline: HiringPipelineData;
  onAddCandidate: (newCandidate: Candidate) => Promise<void>;
  onUpdateCandidate: (id: string, updates: Partial<Candidate>) => Promise<void>;
  onSaveHiringPipeline: (pipeline: HiringPipelineData) => Promise<void>;
  onDeleteCandidate: (id: string) => Promise<void>;
  onUpdateEmployee?: (id: string, updates: Partial<Employee>) => Promise<void>;
  currentUserName?: string | null;
  currentUserEmail?: string | null;
  currentUserRole?: string | null;
}

type ReasonModalState = {
  candidateId: string;
  title: string;
  status: CandidatePipelineStatus;
  confirmLabel: string;
};

type ScheduleModalState = {
  candidateId: string;
  interviewId?: string;
};

type EvaluationModalState = {
  candidateId: string;
};

const QUEUES: PipelineQueue[] = ['Applied', 'KIV', 'Interviewing', 'Offered', 'Onboarding'];

const INITIAL_PIPELINE_DATA: HiringPipelineData = {
  histories: [],
  interviews: [],
  evaluations: [],
  offers: [],
  shareLinks: [],
  shareDeliveries: [],
};

const statusLabel = (status: CandidatePipelineStatus) => {
  const labels: Record<CandidatePipelineStatus, string> = {
    applied: 'Applied',
    shortlisted: 'Shortlisted',
    kiv: 'KIV',
    interview_scheduled: 'Interview Scheduled',
    interview_cancelled: 'Interview Cancelled',
    interview_no_show: 'Candidate No-show',
    interview_withdrew: 'Candidate Withdrew',
    interview_passed: 'Interview Date Passed',
    offer_preparing: 'Offer Preparing',
    offer_sent: 'Offer Sent',
    offer_accepted: 'Offer Accepted',
    offer_rejected: 'Offer Rejected',
    onboarding: 'Onboarding',
    rejected: 'Rejected',
  };
  return labels[status];
};

const statusClass = (status: CandidatePipelineStatus) => {
  if (status === 'kiv') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'rejected' || status === 'offer_rejected' || status === 'interview_cancelled') {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  if (status === 'offer_accepted' || status === 'onboarding') return 'bg-green-50 text-green-700 border-green-200';
  if (status.startsWith('interview')) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (status.startsWith('offer')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  return 'bg-neutral-50 text-on-surface-variant border-neutral-border';
};

const formatDate = (value?: string) => {
  if (!value) return 'Not set';
  const date = new Date(`${value.length === 10 ? `${value}T00:00:00` : value}`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const formatDateTime = (date: string, time: string) => (
  `${formatDate(date)} at ${time || 'Time not set'}`
);

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-border bg-white p-5 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-neutral-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-on-background">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-on-surface-variant">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-neutral-100"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function HireOnboardingView({
  entities,
  onShowNotification,
  onAddEmployee,
  employees,
  candidates,
  hiringPipeline,
  onAddCandidate,
  onUpdateCandidate,
  onSaveHiringPipeline,
  onDeleteCandidate,
  onUpdateEmployee,
  currentUserName,
  currentUserEmail,
  currentUserRole,
}: HireOnboardingViewProps) {
  const { confirmAction, showError, showSuccess, showWarning } = useFeedback();
  const [activeTab, setActiveTab] = useState<HireOnboardingSection>(() => (
    getHireOnboardingSectionFromPath(window.location.pathname)
  ));
  const [activeQueue, setActiveQueue] = useState<PipelineQueue>('Applied');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [interviewView, setInterviewView] = useState<InterviewView>('upcoming');
  const [offerFilter, setOfferFilter] = useState<OfferFilter>('all');
  const [isSavingCandidate, setIsSavingCandidate] = useState(false);
  const [candidateForm, setCandidateForm] = useState({
    name: '',
    email: '',
    phone: '',
    designation: '',
    department: '',
    entityId: entities[0]?.id || '',
  });
  const [scheduleModal, setScheduleModal] = useState<ScheduleModalState | null>(null);
  const [reasonModal, setReasonModal] = useState<ReasonModalState | null>(null);
  const [evaluationModal, setEvaluationModal] = useState<EvaluationModalState | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [scheduleDraft, setScheduleDraft] = useState({
    date: getGmt8DateString(),
    time: '09:00',
    meetingLink: '',
    notes: '',
  });
  const [evaluationDraft, setEvaluationDraft] = useState({
    evaluatorName: currentUserName || '',
    evaluatorDesignation: currentUserRole || 'HR Administrator',
    evaluationDate: getGmt8DateString(),
    technicalScore: 0,
    communicationScore: 0,
    culturalFitScore: 0,
    leadershipScore: 0,
    overallRecommendation: 'offer' as 'kiv' | 'reject' | 'offer',
    additionalComments: '',
  });

  const navigateToSection = (section: HireOnboardingSection, replace = false) => {
    setActiveTab(section);
    const nextPath = getPathForHireOnboardingSection(section);
    if (window.location.pathname !== nextPath || window.location.search) {
      window.history[replace ? 'replaceState' : 'pushState']({ section }, '', nextPath);
    }
  };

  useEffect(() => {
    const handlePopState = () => setActiveTab(getHireOnboardingSectionFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!candidateForm.department) {
      setCandidateForm(current => ({ ...current, department: 'Human Resources' }));
    }
  }, [candidateForm.department]);

  useEffect(() => {
    if (entities.length > 0 && !candidateForm.entityId) {
      setCandidateForm(current => ({ ...current, entityId: entities[0].id }));
    }
  }, [candidateForm.entityId, entities]);

  const pipeline = useMemo(() => ({
    ...INITIAL_PIPELINE_DATA,
    ...hiringPipeline,
    histories: hiringPipeline?.histories || [],
    interviews: hiringPipeline?.interviews || [],
    evaluations: hiringPipeline?.evaluations || [],
    offers: hiringPipeline?.offers || [],
    shareLinks: hiringPipeline?.shareLinks || [],
    shareDeliveries: hiringPipeline?.shareDeliveries || [],
  }), [hiringPipeline]);

  const effectiveStatusFor = (candidate: Candidate) => getEffectiveCandidateStatus(candidate, pipeline);

  const selectedCandidate = candidates.find(candidate => candidate.id === selectedCandidateId)
    || candidates[0]
    || null;

  const selectedStatus = selectedCandidate ? effectiveStatusFor(selectedCandidate) : null;
  const selectedInterview = selectedCandidate
    ? pipeline.interviews
      .filter(item => item.candidateId === selectedCandidate.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
    : undefined;
  const selectedOffer = selectedCandidate
    ? pipeline.offers.find(item => item.candidateId === selectedCandidate.id)
    : undefined;
  const selectedEvaluation = selectedCandidate
    ? pipeline.evaluations.find(item => item.candidateId === selectedCandidate.id)
    : undefined;

  const queuedCandidates = useMemo(() => {
    const queue = candidates.filter(candidate => getPipelineQueue(effectiveStatusFor(candidate)) === activeQueue);
    if (activeQueue === 'Interviewing') {
      return queue.filter(candidate => {
        const interview = pipeline.interviews
          .filter(item => item.candidateId === candidate.id)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
        const upcoming = interview && interview.status === 'scheduled'
          ? isInterviewUpcoming(interview.scheduledDate, interview.scheduledTime)
          : false;
        return interviewView === 'upcoming' ? upcoming : !upcoming;
      });
    }
    if (activeQueue === 'Offered' && offerFilter !== 'all') {
      return queue.filter(candidate => {
        const offer = pipeline.offers.find(item => item.candidateId === candidate.id);
        return offer?.status === offerFilter;
      });
    }
    return queue;
  }, [activeQueue, candidates, interviewView, offerFilter, pipeline]);

  const queueCounts = useMemo(() => ({
    Applied: candidates.filter(candidate => ['applied', 'shortlisted'].includes(effectiveStatusFor(candidate))).length,
    KIV: candidates.filter(candidate => effectiveStatusFor(candidate) === 'kiv').length,
    Interviewing: candidates.filter(candidate => getPipelineQueue(effectiveStatusFor(candidate)) === 'Interviewing').length,
    Offered: candidates.filter(candidate => getPipelineQueue(effectiveStatusFor(candidate)) === 'Offered').length,
    Onboarding: candidates.filter(candidate => getPipelineQueue(effectiveStatusFor(candidate)) === 'Onboarding').length,
  }), [candidates, pipeline]);

  useEffect(() => {
    if (selectedCandidateId && candidates.some(candidate => candidate.id === selectedCandidateId)) return;
    setSelectedCandidateId(candidates[0]?.id || '');
  }, [candidates, selectedCandidateId]);

  const persistPipeline = async (next: HiringPipelineData) => {
    try {
      await onSaveHiringPipeline(next);
    } catch (error: any) {
      showError('Pipeline Save Failed', error.message || 'The hiring pipeline could not be saved.');
      throw error;
    }
  };

  const transitionCandidate = async (
    candidate: Candidate,
    nextStatus: CandidatePipelineStatus,
    options: {
      notes?: string;
      rejectionReason?: string;
      interviewStatus?: CandidateInterviewStatus;
    } = {}
  ) => {
    const previousStatus = effectiveStatusFor(candidate);
    const now = toIsoDateTime();
    const nextCandidate: Partial<Candidate> = {
      pipelineStatus: nextStatus,
      pipelineUpdatedAt: now,
      stage: undefined,
      kivNotes: nextStatus === 'kiv' ? options.notes || candidate.kivNotes : undefined,
      rejectionReason: nextStatus === 'rejected' || nextStatus === 'offer_rejected'
        ? options.rejectionReason || options.notes
        : undefined,
    };
    const nextHistory = createPipelineHistory(
      candidate.id,
      nextStatus,
      previousStatus,
      options.notes,
      currentUserName || 'HR Administrator',
      now
    );
    const nextInterviews = options.interviewStatus && selectedInterview?.candidateId === candidate.id
      ? pipeline.interviews.map(interview => interview.id === selectedInterview.id
        ? {
          ...interview,
          status: options.interviewStatus!,
          cancellationReason: options.notes,
          updatedAt: now,
        }
        : interview)
      : pipeline.interviews;

    try {
      await onUpdateCandidate(candidate.id, nextCandidate);
      await persistPipeline({
        ...pipeline,
        histories: [...pipeline.histories, nextHistory],
        interviews: nextInterviews,
      });
      showSuccess('Pipeline Updated', `${candidate.name} is now ${statusLabel(nextStatus)}.`);
    } catch (_error) {
      // The shared persistence layer already reports the actionable error.
    }
  };

  const handleShortlist = async () => {
    if (!selectedCandidate) return;
    await transitionCandidate(selectedCandidate, 'shortlisted');
  };

  const openReasonModal = (
    status: CandidatePipelineStatus,
    title: string,
    confirmLabel: string
  ) => {
    if (!selectedCandidate) return;
    setReasonText('');
    setReasonModal({ candidateId: selectedCandidate.id, status, title, confirmLabel });
  };

  const submitReasonModal = async () => {
    if (!reasonModal) return;
    const candidate = candidates.find(item => item.id === reasonModal.candidateId);
    if (!candidate) return;
    const status = reasonModal.status;
    const requiresReason = ['rejected', 'interview_cancelled', 'interview_no_show', 'interview_withdrew'].includes(status);
    if (requiresReason && !reasonText.trim()) {
      showWarning('Reason Required', 'Please add a short reason before saving this decision.');
      return;
    }
    setReasonModal(null);
    if (status === 'offer_rejected') {
      try {
        await updateOfferStatus(candidate, 'rejected', reasonText.trim());
      } catch (_error) {
        // Persistence layer reports the failure.
      }
      return;
    }
    await transitionCandidate(candidate, status, {
      notes: reasonText.trim() || undefined,
      rejectionReason: reasonText.trim() || undefined,
      interviewStatus: status === 'interview_cancelled'
        ? 'cancelled'
        : status === 'interview_no_show'
          ? 'no_show'
          : status === 'interview_withdrew'
            ? 'withdrew'
            : undefined,
    });
  };

  const openScheduleModal = (candidate: Candidate, interview?: CandidateInterview) => {
    setScheduleDraft({
      date: interview?.scheduledDate || getGmt8DateString(),
      time: interview?.scheduledTime || '09:00',
      meetingLink: interview?.meetingLink || '',
      notes: interview?.notes || '',
    });
    setScheduleModal({ candidateId: candidate.id, interviewId: interview?.id });
  };

  const submitScheduleModal = async () => {
    if (!scheduleModal) return;
    const candidate = candidates.find(item => item.id === scheduleModal.candidateId);
    if (!candidate || !scheduleDraft.date || !scheduleDraft.time) {
      showWarning('Interview Details Required', 'Choose both an interview date and time.');
      return;
    }
    const scheduled = new Date(`${scheduleDraft.date}T${scheduleDraft.time}`);
    if (Number.isNaN(scheduled.getTime())) {
      showWarning('Invalid Interview Date', 'The selected date and time are not valid.');
      return;
    }
    const now = toIsoDateTime();
    const interview: CandidateInterview = {
      id: scheduleModal.interviewId || makeHiringId('interview'),
      candidateId: candidate.id,
      scheduledDate: scheduleDraft.date,
      scheduledTime: scheduleDraft.time,
      meetingLink: scheduleDraft.meetingLink.trim(),
      notes: scheduleDraft.notes.trim(),
      status: 'scheduled',
      createdAt: scheduleModal.interviewId
        ? selectedInterview?.createdAt || now
        : now,
      updatedAt: now,
    };
    const previousStatus = effectiveStatusFor(candidate);
    const eventType = scheduleModal.interviewId ? 'interview_rescheduled' : 'interview_scheduled';
    try {
      await onUpdateCandidate(candidate.id, {
        pipelineStatus: 'interview_scheduled',
        pipelineUpdatedAt: now,
        stage: undefined,
      });
      await persistPipeline({
        ...pipeline,
        interviews: [
          ...pipeline.interviews.filter(item => item.id !== interview.id),
          interview,
        ],
        histories: [
          ...pipeline.histories,
          createPipelineHistory(
            candidate.id,
            'interview_scheduled',
            previousStatus,
            `${eventType}: ${formatDateTime(interview.scheduledDate, interview.scheduledTime)}`,
            currentUserName || 'HR Administrator',
            now
          ),
        ],
      });
      setScheduleModal(null);
      showSuccess(
        scheduleModal.interviewId ? 'Interview Rescheduled' : 'Interview Scheduled',
        `${candidate.name}'s interview has been saved.`
      );
    } catch (_error) {
      // Persistence layer reports the failure.
    }
  };

  const openEvaluationModal = (candidate: Candidate) => {
    const evaluation = pipeline.evaluations.find(item => item.candidateId === candidate.id);
    setEvaluationDraft({
      evaluatorName: evaluation?.evaluatorName || currentUserName || '',
      evaluatorDesignation: evaluation?.evaluatorDesignation || currentUserRole || 'HR Administrator',
      evaluationDate: evaluation?.evaluationDate || getGmt8DateString(),
      technicalScore: evaluation?.technicalScore || 0,
      communicationScore: evaluation?.communicationScore || 0,
      culturalFitScore: evaluation?.culturalFitScore || 0,
      leadershipScore: evaluation?.leadershipScore || 0,
      overallRecommendation: evaluation?.overallRecommendation || 'offer',
      additionalComments: evaluation?.additionalComments || '',
    });
    setEvaluationModal({ candidateId: candidate.id });
  };

  const submitEvaluationModal = async () => {
    if (!evaluationModal) return;
    const candidate = candidates.find(item => item.id === evaluationModal.candidateId);
    if (!candidate || !evaluationDraft.evaluatorName.trim() || !evaluationDraft.evaluationDate) {
      showWarning('Evaluation Details Required', 'Evaluator name and evaluation date are required.');
      return;
    }
    const now = toIsoDateTime();
    const evaluation: CandidateEvaluation = {
      id: pipeline.evaluations.find(item => item.candidateId === candidate.id)?.id || makeHiringId('evaluation'),
      candidateId: candidate.id,
      evaluatorName: evaluationDraft.evaluatorName.trim(),
      evaluatorDesignation: evaluationDraft.evaluatorDesignation.trim(),
      evaluationDate: evaluationDraft.evaluationDate,
      technicalScore: Number(evaluationDraft.technicalScore),
      communicationScore: Number(evaluationDraft.communicationScore),
      culturalFitScore: Number(evaluationDraft.culturalFitScore),
      leadershipScore: Number(evaluationDraft.leadershipScore),
      overallRecommendation: evaluationDraft.overallRecommendation,
      additionalComments: evaluationDraft.additionalComments.trim(),
      updatedAt: now,
    };
    const nextStatus: CandidatePipelineStatus = (
      evaluation.overallRecommendation === 'offer'
        ? 'offer_preparing'
        : evaluation.overallRecommendation === 'kiv'
          ? 'kiv'
          : 'rejected'
    );
    const nextOffer = nextStatus === 'offer_preparing'
      ? {
        id: pipeline.offers.find(item => item.candidateId === candidate.id)?.id || makeHiringId('offer'),
        candidateId: candidate.id,
        status: 'preparing' as CandidateOfferStatus,
        statusUpdatedAt: now,
        responseNotes: '',
        rejectionReason: '',
      }
      : undefined;
    try {
      await onUpdateCandidate(candidate.id, {
        pipelineStatus: nextStatus,
        pipelineUpdatedAt: now,
        stage: undefined,
        rejectionReason: nextStatus === 'rejected' ? evaluation.additionalComments : undefined,
      });
      await persistPipeline({
        ...pipeline,
        evaluations: [
          ...pipeline.evaluations.filter(item => item.candidateId !== candidate.id),
          evaluation,
        ],
        offers: nextOffer
          ? [...pipeline.offers.filter(item => item.candidateId !== candidate.id), nextOffer]
          : pipeline.offers,
        histories: [
          ...pipeline.histories,
          createPipelineHistory(
            candidate.id,
            nextStatus,
            effectiveStatusFor(candidate),
            `Evaluation recommendation: ${evaluation.overallRecommendation}.`,
            currentUserName || 'HR Administrator',
            now
          ),
        ],
      });
      setEvaluationModal(null);
      showSuccess('Evaluation Saved', `${candidate.name}'s interview evaluation is recorded.`);
    } catch (_error) {
      // Persistence layer reports the failure.
    }
  };

  const updateOfferStatus = async (candidate: Candidate, status: CandidateOfferStatus, notes?: string) => {
    const now = toIsoDateTime();
    const nextStatus: CandidatePipelineStatus = (
      status === 'preparing'
        ? 'offer_preparing'
        : status === 'sent'
          ? 'offer_sent'
          : status === 'accepted'
            ? 'offer_accepted'
            : 'offer_rejected'
    );
    const offer: CandidateOffer = {
      id: pipeline.offers.find(item => item.candidateId === candidate.id)?.id || makeHiringId('offer'),
      candidateId: candidate.id,
      status,
      statusUpdatedAt: now,
      responseNotes: notes,
      rejectionReason: status === 'rejected' ? notes : undefined,
    };
    await onUpdateCandidate(candidate.id, {
      pipelineStatus: nextStatus,
      pipelineUpdatedAt: now,
      stage: undefined,
      rejectionReason: status === 'rejected' ? notes : undefined,
    });
    await persistPipeline({
      ...pipeline,
      offers: [...pipeline.offers.filter(item => item.candidateId !== candidate.id), offer],
      histories: [
        ...pipeline.histories,
        createPipelineHistory(
          candidate.id,
          nextStatus,
          effectiveStatusFor(candidate),
          notes,
          currentUserName || 'HR Administrator',
          now
        ),
      ],
    });
    showSuccess('Offer Updated', `${candidate.name}'s offer is now ${statusLabel(nextStatus)}.`);
  };

  const handleOfferAction = async (status: CandidateOfferStatus) => {
    if (!selectedCandidate) return;
    if (status === 'rejected') {
      openReasonModal('offer_rejected', 'Reject Offer', 'Reject Offer');
      return;
    }
    const title = status === 'sent' ? 'Mark Offer Sent' : 'Accept Offer';
    const message = status === 'sent'
      ? `Confirm that the offer for ${selectedCandidate.name} has been sent.`
      : `Confirm that ${selectedCandidate.name} accepted the offer.`;
    const confirmed = await confirmAction({
      title,
      message,
      tone: status === 'accepted' ? 'info' : 'warning',
      confirmLabel: status === 'sent' ? 'Mark Offer Sent' : 'Accept Offer',
      onConfirm: () => updateOfferStatus(selectedCandidate, status),
    });
    if (!confirmed) return;
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_error) {
      return false;
    }
  };

  const generateShareLink = async (candidate: Candidate, kind: 'interview' | 'onboarding', regenerate = false) => {
    const activeLink = getActiveShareLink(candidate.id, kind, pipeline);
    if (activeLink && !regenerate) {
      await copyText(activeLink.url);
      showSuccess('Link Copied', `${kind === 'interview' ? 'Interview' : 'Onboarding'} link copied to clipboard.`);
      return activeLink;
    }
    const now = new Date();
    const expires = new Date(now);
    expires.setDate(expires.getDate() + (kind === 'interview' ? 7 : 30));
    const token = makeHiringId('token').replace(/[^a-zA-Z0-9]/g, '');
    const url = `${window.location.origin}/?form=${kind === 'interview' ? 'interview' : 'onboarding'}&candidateId=${encodeURIComponent(candidate.id)}&token=${token}`;
    const link = {
      id: makeHiringId('share'),
      candidateId: candidate.id,
      kind,
      token,
      url,
      expiresAt: expires.toISOString(),
      createdAt: now.toISOString(),
    };
    const nextLinks = pipeline.shareLinks
      .map(item => item.candidateId === candidate.id && item.kind === kind && !item.invalidatedAt
        ? { ...item, invalidatedAt: now.toISOString() }
        : item);
    await persistPipeline({
      ...pipeline,
      shareLinks: [...nextLinks, link],
    });
    await copyText(url);
    showSuccess('Share Link Ready', `${kind === 'interview' ? 'Interview' : 'Onboarding'} link generated and copied.`);
    return link;
  };

  const recordDelivery = async (
    candidate: Candidate,
    kind: 'interview' | 'onboarding',
    channel: 'email' | 'whatsapp' | 'native'
  ) => {
    const link = await generateShareLink(candidate, kind);
    if (!link) return;
    const delivery = {
      id: makeHiringId('delivery'),
      shareLinkId: link.id,
      candidateId: candidate.id,
      channel,
      handoffStatus: 'completed' as const,
      createdAt: toIsoDateTime(),
    };
    const hasLinkInCurrentSnapshot = pipeline.shareLinks.some(item => item.id === link.id);
    const nextShareLinks = hasLinkInCurrentSnapshot
      ? pipeline.shareLinks
      : [
        ...pipeline.shareLinks.map(item => item.candidateId === candidate.id && item.kind === kind && !item.invalidatedAt
          ? { ...item, invalidatedAt: toIsoDateTime() }
          : item),
        link,
      ];
    await persistPipeline({
      ...pipeline,
      shareLinks: nextShareLinks,
      shareDeliveries: [...pipeline.shareDeliveries, delivery],
    });
    if (channel === 'email') {
      window.open(`mailto:${candidate.email}?subject=${encodeURIComponent(`${kind === 'interview' ? 'Interview' : 'Onboarding'} details`)}&body=${encodeURIComponent(link.url)}`, '_blank');
    } else if (channel === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(link.url)}`, '_blank');
    } else if (navigator.share) {
      await navigator.share({ title: `${kind === 'interview' ? 'Interview' : 'Onboarding'} details`, url: link.url }).catch(() => undefined);
    }
  };

  const handleDelete = async (candidate: Candidate) => {
    const confirmed = await confirmAction({
      title: 'Delete Candidate',
      message: `Are you sure you want to delete ${candidate.name}? This action cannot be undone.`,
      tone: 'danger',
      confirmLabel: 'Delete Candidate',
      onConfirm: () => onDeleteCandidate(candidate.id),
    });
    if (confirmed) {
      setSelectedCandidateId('');
      showSuccess('Candidate Deleted', `${candidate.name} was removed from the hiring pipeline.`);
    }
  };

  const handleApplicationSubmit = async (formData: any) => {
    const now = toIsoDateTime();
    const newCandidate: Candidate = {
      id: formData.id || `CAN-${Date.now()}`,
      name: getCandidateNameFromApplication(formData),
      email: formData.email,
      phone: formData.phone,
      designation: formData.designation,
      department: formData.department || 'Human Resources',
      entityId: formData.entityId || entities[0]?.id || '',
      stage: 'Applied',
      progress: 0,
      dateJoined: formData.dateJoined || getGmt8DateString(),
      pipelineStatus: 'applied',
      receivedAt: now,
      appliedAt: getGmt8DateString(),
      pipelineUpdatedAt: now,
    };
    await onAddCandidate(newCandidate);
    setSelectedCandidateId(newCandidate.id);
    navigateToSection('pipeline');
    onShowNotification('Applicant Registered', `${newCandidate.name} has been added to Applied.`);
  };

  const handleOnboardingComplete = async (newEmployee: Employee) => {
    if (!onAddEmployee) throw new Error('Employee enrollment is unavailable.');
    await onAddEmployee(newEmployee);
    navigateToSection('pipeline');
  };

  const handleCreateCandidate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!candidateForm.name.trim() || !candidateForm.email.trim() || !candidateForm.designation.trim()) {
      showWarning('Candidate Details Required', 'Name, email, and designation are required.');
      return;
    }
    setIsSavingCandidate(true);
    try {
      const now = toIsoDateTime();
      const candidate: Candidate = {
        id: `CAN-${Date.now()}`,
        name: candidateForm.name.trim(),
        email: candidateForm.email.trim(),
        phone: candidateForm.phone.trim(),
        designation: candidateForm.designation.trim(),
        department: candidateForm.department.trim() || 'Human Resources',
        entityId: candidateForm.entityId || entities[0]?.id || '',
        stage: 'Applied',
        progress: 0,
        dateJoined: getGmt8DateString(),
        pipelineStatus: 'applied',
        receivedAt: now,
        appliedAt: getGmt8DateString(),
        pipelineUpdatedAt: now,
      };
      await onAddCandidate(candidate);
      setSelectedCandidateId(candidate.id);
      setCandidateForm(current => ({
        ...current,
        name: '',
        email: '',
        phone: '',
        designation: '',
      }));
      showSuccess('Candidate Added', `${candidate.name} is now in Applied.`);
    } catch (error: any) {
      showError('Candidate Save Failed', error.message || 'The candidate could not be saved.');
    } finally {
      setIsSavingCandidate(false);
    }
  };

  const renderActions = () => {
    if (!selectedCandidate || !selectedStatus) return null;
    const candidate = selectedCandidate;
    if (selectedStatus === 'applied') {
      return (
        <>
          <ActionButton onClick={handleShortlist} icon={<Check className="h-4 w-4" />}>Shortlist</ActionButton>
          <ActionButton onClick={() => openReasonModal('kiv', 'Move Candidate to KIV', 'Move to KIV')} icon={<Clock3 className="h-4 w-4" />} tone="warning">KIV</ActionButton>
          <ActionButton onClick={() => openReasonModal('rejected', 'Reject Candidate', 'Reject Candidate')} icon={<XCircle className="h-4 w-4" />} tone="danger">Reject</ActionButton>
        </>
      );
    }
    if (selectedStatus === 'shortlisted') {
      return (
        <>
          <ActionButton onClick={() => openScheduleModal(candidate)} icon={<CalendarDays className="h-4 w-4" />}>Schedule Interview</ActionButton>
          <ActionButton onClick={() => openReasonModal('kiv', 'Move Candidate to KIV', 'Move to KIV')} icon={<Clock3 className="h-4 w-4" />} tone="warning">KIV</ActionButton>
          <ActionButton onClick={() => openReasonModal('rejected', 'Reject Candidate', 'Reject Candidate')} icon={<XCircle className="h-4 w-4" />} tone="danger">Reject</ActionButton>
        </>
      );
    }
    if (selectedStatus === 'kiv') {
      return <ActionButton onClick={() => transitionCandidate(candidate, 'applied')} icon={<RefreshCw className="h-4 w-4" />}>Resume Applied</ActionButton>;
    }
    if (selectedStatus === 'interview_scheduled') {
      return (
        <>
          <ActionButton onClick={() => openScheduleModal(candidate, selectedInterview)} icon={<CalendarDays className="h-4 w-4" />}>Change Date & Time</ActionButton>
          <ActionButton onClick={() => openReasonModal('interview_cancelled', 'Cancel Interview', 'Cancel Interview')} icon={<XCircle className="h-4 w-4" />} tone="danger">Cancel</ActionButton>
          <ActionButton onClick={() => openReasonModal('interview_no_show', 'Record Candidate No-show', 'Record No-show')} icon={<MoreHorizontal className="h-4 w-4" />} tone="warning">No-show</ActionButton>
          <ActionButton onClick={() => openReasonModal('interview_withdrew', 'Record Candidate Withdrawal', 'Record Withdrawal')} icon={<Users className="h-4 w-4" />} tone="warning">Withdrew</ActionButton>
          <ActionButton onClick={() => openReasonModal('kiv', 'Move Interview Candidate to KIV', 'Move to KIV')} icon={<Clock3 className="h-4 w-4" />} tone="warning">KIV</ActionButton>
        </>
      );
    }
    if (selectedStatus === 'interview_passed') {
      return <ActionButton onClick={() => openEvaluationModal(candidate)} icon={<ClipboardCheck className="h-4 w-4" />}>Open Interview Evaluation</ActionButton>;
    }
    if (selectedStatus === 'offer_preparing') {
      return <ActionButton onClick={() => handleOfferAction('sent')} icon={<Send className="h-4 w-4" />}>Mark Offer Sent</ActionButton>;
    }
    if (selectedStatus === 'offer_sent') {
      return (
        <>
          <ActionButton onClick={() => handleOfferAction('accepted')} icon={<CheckCircle2 className="h-4 w-4" />}>Offer Accepted</ActionButton>
          <ActionButton onClick={() => handleOfferAction('rejected')} icon={<XCircle className="h-4 w-4" />} tone="danger">Offer Rejected</ActionButton>
        </>
      );
    }
    if (selectedStatus === 'offer_accepted' || selectedStatus === 'onboarding') {
      return (
        <>
          <ActionButton onClick={() => { void generateShareLink(candidate, 'onboarding'); }} icon={<LinkIcon className="h-4 w-4" />}>Generate Onboarding Link</ActionButton>
          <ActionButton onClick={() => navigateToSection('onboarding-portal')} icon={<BookOpen className="h-4 w-4" />}>Open Onboarding Portal</ActionButton>
        </>
      );
    }
    return null;
  };

  const renderCandidateFacingLinks = () => {
    if (!selectedCandidate || !selectedInterview) return null;
    const candidate = selectedCandidate;
    const interviewLink = getActiveShareLink(candidate.id, 'interview', pipeline);
    return (
      <div className="mt-5 rounded-xl border border-neutral-border bg-neutral-50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">Candidate-facing links</h3>
            <p className="mt-1 text-[11px] text-on-surface-variant">Internal evaluation and HR audit details are never included.</p>
          </div>
          <LinkIcon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={() => { void generateShareLink(candidate, 'interview'); }} icon={<Copy className="h-3.5 w-3.5" />}>Copy Interview Link</ActionButton>
          <ActionButton onClick={() => { void generateShareLink(candidate, 'interview', true); }} icon={<RefreshCw className="h-3.5 w-3.5" />}>Regenerate</ActionButton>
          <ActionButton onClick={() => recordDelivery(candidate, 'interview', 'email')} icon={<Mail className="h-3.5 w-3.5" />}>Email</ActionButton>
          <ActionButton onClick={() => recordDelivery(candidate, 'interview', 'whatsapp')} icon={<MessageCircle className="h-3.5 w-3.5" />}>WhatsApp</ActionButton>
        </div>
        {interviewLink && (
          <p className="mt-3 truncate text-[10px] font-mono text-on-surface-variant">
            Active until {formatDate(interviewLink.expiresAt)}: {interviewLink.url}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 text-left animate-in fade-in duration-200">
      <header className="flex flex-col gap-4 border-b border-neutral-200/70 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">People Operations</p>
          <h1 className="text-3xl font-bold tracking-tight text-on-background">Hire & Onboarding</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
            Manage Applied submissions, KIV decisions, interviews, offers, secure candidate handoffs, and onboarding progress.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl border border-neutral-border bg-white p-1">
            <NavButton active={activeTab === 'pipeline'} onClick={() => navigateToSection('pipeline')} icon={<LayoutGrid className="h-4 w-4" />}>Pipeline</NavButton>
            <NavButton active={activeTab === 'application-form'} onClick={() => navigateToSection('application-form')} icon={<FileText className="h-4 w-4" />}>Application Form</NavButton>
            <NavButton active={activeTab === 'onboarding-form'} onClick={() => navigateToSection('onboarding-form')} icon={<UserCheck className="h-4 w-4" />}>Employee Enrollment</NavButton>
            <NavButton active={activeTab === 'onboarding-portal'} onClick={() => navigateToSection('onboarding-portal')} icon={<BookOpen className="h-4 w-4" />}>Onboarding Portal</NavButton>
          </div>
          <button
            type="button"
            onClick={async () => {
              const copied = await copyText(`${window.location.origin}/?form=job-apply`);
              if (copied) showSuccess('Application Link Copied', 'Public application form URL copied to clipboard.');
              else showError('Copy Failed', 'The application link could not be copied.');
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-border bg-white px-3 py-2 text-xs font-bold text-on-surface transition hover:bg-neutral-50"
          >
            <Share2 className="h-4 w-4 text-primary" /> Share Apply Link
          </button>
        </div>
      </header>

      {activeTab === 'application-form' ? (
        <JobApplicationForm onApplicationSubmit={handleApplicationSubmit} onShowNotification={onShowNotification} />
      ) : activeTab === 'onboarding-form' ? (
        <OnboardingForm
          candidates={candidates}
          entities={entities}
          onOnboardingComplete={handleOnboardingComplete}
          onShowNotification={onShowNotification}
          onAdvanceCandidateStage={(id) => onUpdateCandidate(id, {
            stage: 'Onboarding',
            pipelineStatus: 'onboarding',
            progress: 100,
          })}
        />
      ) : activeTab === 'onboarding-portal' ? (
        <React.Suspense
          fallback={<div className="flex min-h-64 items-center justify-center rounded-2xl border border-neutral-border bg-white text-sm font-semibold text-on-surface-variant">Loading Onboarding Portal...</div>}
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
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <SummaryCard label="Applied" value={queueCounts.Applied} detail="New submissions and shortlisted" icon={<Users className="h-5 w-5" />} />
            <SummaryCard label="KIV" value={queueCounts.KIV} detail="Awaiting a future decision" icon={<Clock3 className="h-5 w-5" />} />
            <SummaryCard label="Pending Interviews" value={candidates.filter(candidate => {
              const status = effectiveStatusFor(candidate);
              return status === 'interview_scheduled' && pipeline.interviews.some(item => item.candidateId === candidate.id && item.status === 'scheduled');
            }).length} detail="Upcoming interview sessions" icon={<CalendarDays className="h-5 w-5" />} />
            <SummaryCard label="Pending Offers" value={candidates.filter(candidate => ['offer_preparing', 'offer_sent'].includes(effectiveStatusFor(candidate))).length} detail="Preparing or sent" icon={<Send className="h-5 w-5" />} />
          </section>

          <section className="rounded-2xl border border-neutral-border bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center gap-2 px-2">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Pipeline Navigation</span>
              <span className="h-px flex-1 bg-neutral-100" />
              <span className="hidden text-[11px] text-on-surface-variant md:inline">Explicit lifecycle states keep decisions auditable.</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {QUEUES.map(queue => (
                <button
                  key={queue}
                  type="button"
                  onClick={() => setActiveQueue(queue)}
                  className={`flex min-w-[120px] items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                    activeQueue === queue
                      ? 'border-primary bg-primary text-white shadow-sm'
                      : 'border-neutral-border bg-white text-on-surface hover:border-primary/50'
                  }`}
                >
                  <span className="text-xs font-bold">{queue}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeQueue === queue ? 'bg-white/20 text-white' : 'bg-neutral-100 text-on-surface-variant'}`}>{queueCounts[queue]}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-xs text-blue-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p><strong>System notice:</strong> Applied submissions are reviewed before interview scheduling. Interviewing is split automatically by scheduled date and time. KIV and rejected decisions remain auditable in candidate history.</p>
            </div>
          </div>

          {activeQueue === 'Interviewing' && (
            <div className="flex flex-wrap gap-2">
              <FilterButton active={interviewView === 'upcoming'} onClick={() => setInterviewView('upcoming')}>Upcoming Interview</FilterButton>
              <FilterButton active={interviewView === 'passed'} onClick={() => setInterviewView('passed')}>Passed Interview</FilterButton>
            </div>
          )}
          {activeQueue === 'Offered' && (
            <div className="flex flex-wrap gap-2">
              {(['all', 'preparing', 'sent', 'rejected'] as OfferFilter[]).map(filter => (
                <React.Fragment key={filter}>
                  <FilterButton active={offerFilter === filter} onClick={() => setOfferFilter(filter)}>
                    {filter === 'all' ? 'All Offers' : statusLabel(`offer_${filter}` as CandidatePipelineStatus)}
                  </FilterButton>
                </React.Fragment>
              ))}
            </div>
          )}

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.6fr)]">
            <div className="flex min-h-[620px] flex-col rounded-2xl border border-neutral-border bg-white shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b border-neutral-100 p-4">
                <div>
                  <h2 className="text-base font-bold text-on-background">{activeQueue} Queue</h2>
                  <p className="mt-1 text-xs text-on-surface-variant">Select a candidate to open the detail workspace.</p>
                </div>
                <button type="button" className="rounded-lg border border-neutral-border p-2 text-on-surface-variant hover:bg-neutral-50" onClick={() => setSelectedCandidateId(candidates[0]?.id || '')} title="Refresh selection">
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {queuedCandidates.length === 0 ? (
                  <div className="flex h-full min-h-56 flex-col items-center justify-center gap-3 text-center text-xs text-on-surface-variant">
                    <Users className="h-9 w-9 text-neutral-300" />
                    <p>No candidates in this queue.</p>
                  </div>
                ) : queuedCandidates.map(candidate => {
                  const status = effectiveStatusFor(candidate);
                  const interview = pipeline.interviews
                    .filter(item => item.candidateId === candidate.id)
                    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
                  const offer = pipeline.offers.find(item => item.candidateId === candidate.id);
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setSelectedCandidateId(candidate.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selectedCandidate?.id === candidate.id
                          ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/20'
                          : 'border-neutral-border bg-white hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-on-background">{candidate.name}</p>
                          <p className="mt-1 truncate text-[11px] text-on-surface-variant">{candidate.department} · {candidate.designation}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-bold ${statusClass(status)}`}>{statusLabel(status)}</span>
                      </div>
                      {interview && status.startsWith('interview') && (
                        <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-blue-700">
                          <CalendarDays className="h-3.5 w-3.5" /> {formatDateTime(interview.scheduledDate, interview.scheduledTime)}
                        </p>
                      )}
                      {offer && getPipelineQueue(status) === 'Offered' && (
                        <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-indigo-700">
                          <Send className="h-3.5 w-3.5" /> Offer {offer.status}
                        </p>
                      )}
                      {getPipelineQueue(status) === 'Onboarding' && (
                        <div className="mt-2">
                          <div className="mb-1 flex justify-between text-[10px] font-semibold text-on-surface-variant">
                            <span>Onboarding progress</span><span>{candidate.progress}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                            <div className="h-full rounded-full bg-green-600" style={{ width: `${Math.min(100, Math.max(0, candidate.progress))}%` }} />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-border bg-white p-5 shadow-sm">
              {!selectedCandidate ? (
                <div className="flex min-h-[620px] flex-col items-center justify-center gap-3 text-center text-sm text-on-surface-variant">
                  <Users className="h-10 w-10 text-neutral-300" />
                  <p>Select a candidate from the queue to view details.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-4 border-b border-neutral-100 pb-5 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Candidate Detail Workspace</span>
                        <span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${statusClass(selectedStatus || 'applied')}`}>{statusLabel(selectedStatus || 'applied')}</span>
                      </div>
                      <h2 className="text-2xl font-bold text-on-background">{selectedCandidate.name}</h2>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                        <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{selectedCandidate.email}</span>
                        <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{selectedCandidate.phone || 'No phone'}</span>
                        <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{selectedCandidate.department} · {selectedCandidate.designation}</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => handleDelete(selectedCandidate)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <DetailStat label="Applied" value={formatDate(selectedCandidate.appliedAt || selectedCandidate.dateJoined)} />
                    <DetailStat label="Assigned company" value={entities.find(entity => entity.id === selectedCandidate.entityId)?.name || 'Not assigned'} />
                    <DetailStat label="Pipeline updated" value={formatDate(selectedCandidate.pipelineUpdatedAt)} />
                  </div>

                  <div className="mt-6">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Queue-specific actions</h3>
                    <div className="flex flex-wrap gap-2">{renderActions()}</div>
                  </div>

                  {selectedInterview && selectedStatus && selectedStatus.startsWith('interview') && (
                    <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Interview record</p>
                          <p className="mt-1 text-sm font-bold text-on-background">{formatDateTime(selectedInterview.scheduledDate, selectedInterview.scheduledTime)}</p>
                          <p className="mt-1 text-xs text-on-surface-variant">{selectedInterview.meetingLink || 'No meeting link added.'}</p>
                        </div>
                        <span className="rounded-full border border-blue-200 bg-white px-2 py-1 text-[10px] font-bold text-blue-700">{selectedInterview.status}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionButton onClick={() => recordDelivery(selectedCandidate, 'interview', 'email')} icon={<Mail className="h-3.5 w-3.5" />}>Email Details</ActionButton>
                        <ActionButton onClick={() => recordDelivery(selectedCandidate, 'interview', 'whatsapp')} icon={<MessageCircle className="h-3.5 w-3.5" />}>WhatsApp</ActionButton>
                      </div>
                    </div>
                  )}

                  {selectedStatus === 'offer_accepted' || selectedStatus === 'onboarding' ? (
                    <div className="mt-5 rounded-xl border border-green-100 bg-green-50/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-green-700">Onboarding handoff</p>
                          <p className="mt-1 text-sm font-bold text-on-background">Offer accepted and candidate-facing onboarding can begin.</p>
                          <p className="mt-1 text-xs text-on-surface-variant">Internal evaluations, HR notes, offer history, and pipeline decisions stay private.</p>
                        </div>
                        <BookOpen className="h-5 w-5 text-green-700" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionButton onClick={() => { void generateShareLink(selectedCandidate, 'onboarding'); }} icon={<Copy className="h-3.5 w-3.5" />}>Generate & Copy</ActionButton>
                        <ActionButton onClick={() => { void generateShareLink(selectedCandidate, 'onboarding', true); }} icon={<RefreshCw className="h-3.5 w-3.5" />}>Regenerate</ActionButton>
                        <ActionButton onClick={() => recordDelivery(selectedCandidate, 'onboarding', 'email')} icon={<Mail className="h-3.5 w-3.5" />}>Email</ActionButton>
                        <ActionButton onClick={() => recordDelivery(selectedCandidate, 'onboarding', 'whatsapp')} icon={<MessageCircle className="h-3.5 w-3.5" />}>WhatsApp</ActionButton>
                      </div>
                    </div>
                  ) : null}

                  {renderCandidateFacingLinks()}

                  <div className="mt-6">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Audit trail</h3>
                    <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-neutral-border bg-neutral-50 p-3">
                      {getCandidateHistory(selectedCandidate.id, pipeline).length === 0 ? (
                        <p className="p-3 text-xs text-on-surface-variant">No history recorded yet.</p>
                      ) : getCandidateHistory(selectedCandidate.id, pipeline).map(history => (
                        <div key={history.id} className="flex items-start gap-3 rounded-lg bg-white p-3">
                          <div className="mt-0.5 rounded-full bg-primary/10 p-1.5 text-primary"><Check className="h-3 w-3" /></div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-on-background">{statusLabel(history.newStatus)}</p>
                            <p className="mt-0.5 text-[11px] text-on-surface-variant">{history.notes || 'Status transition recorded.'}</p>
                            <p className="mt-1 text-[10px] font-mono text-on-surface-variant/70">{formatDate(history.createdAt)} · {history.actorName || 'HR Administrator'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
            <div className="rounded-2xl border border-neutral-border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 border-b border-neutral-100 pb-3">
                <UserPlus className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-base font-bold text-on-background">Add Candidate</h2>
                  <p className="text-xs text-on-surface-variant">Manual intake is recorded as Applied.</p>
                </div>
              </div>
              <form className="space-y-3" onSubmit={handleCreateCandidate}>
                <Field label="Full name"><input value={candidateForm.name} onChange={event => setCandidateForm(current => ({ ...current, name: event.target.value }))} className="Input" placeholder="Candidate name" /></Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Email"><input type="email" value={candidateForm.email} onChange={event => setCandidateForm(current => ({ ...current, email: event.target.value }))} className="Input" placeholder="name@example.com" /></Field>
                  <Field label="Phone"><input value={candidateForm.phone} onChange={event => setCandidateForm(current => ({ ...current, phone: event.target.value }))} className="Input" placeholder="+60..." /></Field>
                </div>
                <Field label="Designation"><input value={candidateForm.designation} onChange={event => setCandidateForm(current => ({ ...current, designation: event.target.value }))} className="Input" placeholder="Job designation" /></Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Department"><input value={candidateForm.department} onChange={event => setCandidateForm(current => ({ ...current, department: event.target.value }))} className="Input" /></Field>
                  <Field label="Company entity">
                    <select value={candidateForm.entityId} onChange={event => setCandidateForm(current => ({ ...current, entityId: event.target.value }))} className="Input">
                      {entities.map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
                    </select>
                  </Field>
                </div>
                <button type="submit" disabled={isSavingCandidate} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
                  {isSavingCandidate ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {isSavingCandidate ? 'Saving...' : 'Register Candidate'}
                </button>
              </form>
            </div>
            <div className="rounded-2xl border border-neutral-border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-on-background">Pipeline Rules</h2>
                  <p className="mt-1 text-xs text-on-surface-variant">Valid actions are exposed only for the current lifecycle state.</p>
                </div>
                <ClipboardCheck className="h-5 w-5 text-primary" />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <RuleCard title="Applied" text="Shortlist, schedule after shortlisting, KIV, reject, or delete." />
                <RuleCard title="Interviewing" text="Upcoming sessions can be rescheduled or closed. Passed dates open evaluation." />
                <RuleCard title="Offered" text="Offer acceptance is blocked until the offer is marked as sent." />
                <RuleCard title="Onboarding" text="Accepted candidates receive expiring secure handoff links and progress tracking." />
              </div>
            </div>
          </section>
        </>
      )}

      {reasonModal && (
        <Modal title={reasonModal.title} subtitle="This decision will be written to the candidate audit trail." onClose={() => setReasonModal(null)}>
          <label className="block text-xs font-bold text-on-surface-variant">
            Reason / notes
            <textarea value={reasonText} onChange={event => setReasonText(event.target.value)} className="Input mt-1 min-h-28 resize-y" placeholder="Add a short internal note..." />
          </label>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setReasonModal(null)} className="ButtonSecondary">Cancel</button>
            <button type="button" onClick={() => void submitReasonModal()} className={`ButtonPrimary ${reasonModal.status === 'rejected' || reasonModal.status === 'offer_rejected' ? '!bg-red-600' : ''}`}>{reasonModal.confirmLabel}</button>
          </div>
        </Modal>
      )}

      {scheduleModal && (
        <Modal title={scheduleModal.interviewId ? 'Change Interview Date & Time' : 'Schedule Interview'} subtitle="The interview record is reused when a session is rescheduled." onClose={() => setScheduleModal(null)}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Date"><input type="date" value={scheduleDraft.date} onChange={event => setScheduleDraft(current => ({ ...current, date: event.target.value }))} className="Input" /></Field>
            <Field label="Time"><input type="time" value={scheduleDraft.time} onChange={event => setScheduleDraft(current => ({ ...current, time: event.target.value }))} className="Input" /></Field>
          </div>
          <div className="mt-4 space-y-4">
            <Field label="Interview link"><input value={scheduleDraft.meetingLink} onChange={event => setScheduleDraft(current => ({ ...current, meetingLink: event.target.value }))} className="Input" placeholder="https://..." /></Field>
            <Field label="Notes"><textarea value={scheduleDraft.notes} onChange={event => setScheduleDraft(current => ({ ...current, notes: event.target.value }))} className="Input min-h-28" placeholder="Interview instructions or notes..." /></Field>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setScheduleModal(null)} className="ButtonSecondary">Cancel</button>
            <button type="button" onClick={() => void submitScheduleModal()} className="ButtonPrimary">Save Interview</button>
          </div>
        </Modal>
      )}

      {evaluationModal && (
        <Modal title="Interview Evaluation" subtitle="Internal HR evaluation. This information is not shared with candidates." onClose={() => setEvaluationModal(null)}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Evaluator name"><input value={evaluationDraft.evaluatorName} onChange={event => setEvaluationDraft(current => ({ ...current, evaluatorName: event.target.value }))} className="Input" /></Field>
            <Field label="Evaluator designation"><input value={evaluationDraft.evaluatorDesignation} onChange={event => setEvaluationDraft(current => ({ ...current, evaluatorDesignation: event.target.value }))} className="Input" /></Field>
            <Field label="Evaluation date"><input type="date" value={evaluationDraft.evaluationDate} onChange={event => setEvaluationDraft(current => ({ ...current, evaluationDate: event.target.value }))} className="Input" /></Field>
            <Field label="Overall recommendation">
              <select value={evaluationDraft.overallRecommendation} onChange={event => setEvaluationDraft(current => ({ ...current, overallRecommendation: event.target.value as 'kiv' | 'reject' | 'offer' }))} className="Input">
                <option value="offer">Offer</option><option value="kiv">KIV</option><option value="reject">Reject</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ['technicalScore', 'Technical'],
              ['communicationScore', 'Communication'],
              ['culturalFitScore', 'Cultural fit'],
              ['leadershipScore', 'Leadership'],
            ] as const).map(([key, label]) => (
              <React.Fragment key={key}>
                <Field label={`${label} / 5`}>
                  <input type="number" min="0" max="5" step="0.5" value={evaluationDraft[key]} onChange={event => setEvaluationDraft(current => ({ ...current, [key]: Number(event.target.value) }))} className="Input" />
                </Field>
              </React.Fragment>
            ))}
          </div>
          <Field label="Additional comments">
            <textarea value={evaluationDraft.additionalComments} onChange={event => setEvaluationDraft(current => ({ ...current, additionalComments: event.target.value }))} className="Input mt-4 min-h-28" placeholder="Evaluation summary..." />
          </Field>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setEvaluationModal(null)} className="ButtonSecondary">Cancel</button>
            <button type="button" onClick={() => void submitEvaluationModal()} className="ButtonPrimary">Save Evaluation</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${active ? 'bg-primary text-white shadow-sm' : 'text-on-surface hover:bg-neutral-50'}`}>
      {icon}{children}
    </button>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${active ? 'border-primary bg-primary text-white' : 'border-neutral-border bg-white text-on-surface-variant hover:border-primary/50'}`}>{children}</button>;
}

function SummaryCard({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</p>
          <p className="mt-2 text-3xl font-bold text-on-background">{value}</p>
        </div>
        <span className="rounded-xl bg-primary/10 p-2 text-primary">{icon}</span>
      </div>
      <p className="mt-2 text-[11px] text-on-surface-variant">{detail}</p>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-neutral-border bg-neutral-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</p><p className="mt-1 truncate text-xs font-semibold text-on-background">{value}</p></div>;
}

function RuleCard({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-neutral-border p-3"><p className="text-xs font-bold text-on-background">{title}</p><p className="mt-1 text-[11px] leading-5 text-on-surface-variant">{text}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-bold text-on-surface-variant">{label}{children}</label>;
}

function ActionButton({
  onClick,
  icon,
  children,
  tone = 'default',
}: {
  onClick: () => void | Promise<void>;
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const className = tone === 'danger'
    ? 'border-red-200 text-red-700 hover:bg-red-50'
    : tone === 'warning'
      ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
      : 'border-neutral-border text-on-surface hover:border-primary/50 hover:bg-neutral-50';
  return <button type="button" onClick={() => void onClick()} className={`inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-xs font-bold transition ${className}`}>{icon}{children}</button>;
}
