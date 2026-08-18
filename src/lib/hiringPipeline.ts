import {
  Candidate,
  CandidatePipelineHistory,
  CandidatePipelineStatus,
  HiringPipelineData,
} from '../types';

export const EMPTY_HIRING_PIPELINE: HiringPipelineData = {
  histories: [],
  interviews: [],
  evaluations: [],
  offers: [],
  shareLinks: [],
  shareDeliveries: [],
};

const STATUS_STAGE_MAP: Record<CandidatePipelineStatus, Candidate['stage']> = {
  applied: 'Applied',
  shortlisted: 'Applied',
  kiv: 'Applied',
  interview_scheduled: 'Interviewing',
  interview_cancelled: 'Interviewing',
  interview_no_show: 'Interviewing',
  interview_withdrew: 'Interviewing',
  interview_passed: 'Interviewing',
  offer_preparing: 'Offered',
  offer_sent: 'Offered',
  offer_accepted: 'Onboarding',
  offer_rejected: 'Offered',
  onboarding: 'Onboarding',
  rejected: 'Applied',
};

export const getBroadStageForPipelineStatus = (status: CandidatePipelineStatus): Candidate['stage'] => (
  STATUS_STAGE_MAP[status]
);

export const getPipelineStatusFromLegacyStage = (stage: Candidate['stage']): CandidatePipelineStatus => {
  if (stage === 'Interviewing') return 'interview_scheduled';
  if (stage === 'Offered') return 'offer_preparing';
  if (stage === 'Onboarding') return 'onboarding';
  return 'applied';
};

export const getCandidatePipelineStatus = (candidate: Candidate): CandidatePipelineStatus => (
  candidate.pipelineStatus || getPipelineStatusFromLegacyStage(candidate.stage)
);

export const isInterviewScheduledStatus = (status: CandidatePipelineStatus) => (
  status === 'interview_scheduled' || status === 'interview_passed'
);

export const isActiveOfferStatus = (status: CandidatePipelineStatus) => (
  status === 'offer_preparing' ||
  status === 'offer_sent' ||
  status === 'offer_accepted' ||
  status === 'offer_rejected'
);

export const getPipelineQueue = (status: CandidatePipelineStatus): 'Applied' | 'KIV' | 'Interviewing' | 'Offered' | 'Onboarding' => {
  if (status === 'kiv') return 'KIV';
  if (isInterviewScheduledStatus(status) || status.startsWith('interview_')) return 'Interviewing';
  if (isActiveOfferStatus(status)) {
    return status === 'offer_accepted' ? 'Onboarding' : 'Offered';
  }
  if (status === 'onboarding') return 'Onboarding';
  return 'Applied';
};

export const makeHiringId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const toIsoDate = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

export const toIsoDateTime = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

export const getInterviewDateTime = (scheduledDate: string, scheduledTime: string) => {
  const parsed = new Date(`${scheduledDate}T${scheduledTime || '00:00'}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const isInterviewUpcoming = (
  scheduledDate: string,
  scheduledTime: string,
  now = new Date()
) => {
  const interviewDate = getInterviewDateTime(scheduledDate, scheduledTime);
  return !!interviewDate && interviewDate.getTime() > now.getTime();
};

export const getEffectiveCandidateStatus = (
  candidate: Candidate,
  pipeline: HiringPipelineData,
  now = new Date()
): CandidatePipelineStatus => {
  const status = getCandidatePipelineStatus(candidate);
  if (status !== 'interview_scheduled') return status;
  const interview = pipeline.interviews
    .filter(item => item.candidateId === candidate.id)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  if (
    interview &&
    interview.status === 'scheduled' &&
    !isInterviewUpcoming(interview.scheduledDate, interview.scheduledTime, now)
  ) {
    return 'interview_passed';
  }
  return status;
};

export const createPipelineHistory = (
  candidateId: string,
  newStatus: CandidatePipelineStatus,
  previousStatus?: CandidatePipelineStatus,
  notes?: string,
  actorName?: string,
  createdAt = toIsoDateTime()
): CandidatePipelineHistory => ({
  id: makeHiringId('history'),
  candidateId,
  previousStatus,
  newStatus,
  eventType: `${previousStatus || 'received_submission'}_to_${newStatus}`,
  notes,
  actorName,
  createdAt,
});

export const ensureCandidatePipelineHistory = (
  candidates: Candidate[],
  pipeline: HiringPipelineData,
  actorName?: string
): HiringPipelineData => {
  const next = {
    ...EMPTY_HIRING_PIPELINE,
    ...pipeline,
    histories: [...(pipeline.histories || [])],
    interviews: [...(pipeline.interviews || [])],
    evaluations: [...(pipeline.evaluations || [])],
    offers: [...(pipeline.offers || [])],
    shareLinks: [...(pipeline.shareLinks || [])],
    shareDeliveries: [...(pipeline.shareDeliveries || [])],
  };
  const now = toIsoDateTime();

  candidates.forEach(candidate => {
    const hasHistory = next.histories.some(item => item.candidateId === candidate.id);
    if (hasHistory) return;
    const status = getCandidatePipelineStatus(candidate);
    next.histories.push(createPipelineHistory(
      candidate.id,
      status,
      undefined,
      'Candidate imported into the hiring pipeline.',
      actorName,
      now
    ));
  });

  return next;
};

export const normalizeHiringPipeline = (value: unknown): HiringPipelineData => {
  if (!value || typeof value !== 'object') return { ...EMPTY_HIRING_PIPELINE };
  const source = value as Partial<HiringPipelineData>;
  return {
    histories: Array.isArray(source.histories) ? source.histories : [],
    interviews: Array.isArray(source.interviews) ? source.interviews : [],
    evaluations: Array.isArray(source.evaluations) ? source.evaluations : [],
    offers: Array.isArray(source.offers) ? source.offers : [],
    shareLinks: Array.isArray(source.shareLinks) ? source.shareLinks : [],
    shareDeliveries: Array.isArray(source.shareDeliveries) ? source.shareDeliveries : [],
  };
};

export const getCandidateHistory = (candidateId: string, pipeline: HiringPipelineData) => (
  pipeline.histories
    .filter(item => item.candidateId === candidateId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
);

export const getActiveShareLink = (
  candidateId: string,
  kind: 'interview' | 'onboarding',
  pipeline: HiringPipelineData,
  now = new Date()
) => (
  pipeline.shareLinks
    .filter(item => (
      item.candidateId === candidateId &&
      item.kind === kind &&
      !item.invalidatedAt &&
      new Date(item.expiresAt).getTime() > now.getTime()
    ))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
);

