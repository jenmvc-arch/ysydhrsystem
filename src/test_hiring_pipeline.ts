import assert from 'node:assert/strict';
import {
  Candidate,
  HiringPipelineData,
} from './types';
import {
  createPipelineHistory,
  ensureCandidatePipelineHistory,
  getBroadStageForPipelineStatus,
  getCandidatePipelineStatus,
  getEffectiveCandidateStatus,
  getPipelineQueue,
  isInterviewUpcoming,
  normalizeHiringPipeline,
} from './lib/hiringPipeline';

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: 'CAN-1',
  name: 'Aisha Tan',
  email: 'aisha@example.com',
  phone: '+60 12 000 0000',
  designation: 'HR Specialist',
  department: 'Human Resources',
  entityId: 'YSYD',
  stage: 'Applied',
  progress: 0,
  dateJoined: '2026-08-18',
  ...overrides,
});

const emptyPipeline: HiringPipelineData = {
  histories: [],
  interviews: [],
  evaluations: [],
  offers: [],
  shareLinks: [],
  shareDeliveries: [],
};

assert.equal(getCandidatePipelineStatus(candidate()), 'applied');
assert.equal(getCandidatePipelineStatus(candidate({ stage: 'Interviewing' })), 'interview_scheduled');
assert.equal(getBroadStageForPipelineStatus('offer_accepted'), 'Onboarding');
assert.equal(getPipelineQueue('kiv'), 'KIV');
assert.equal(getPipelineQueue('offer_sent'), 'Offered');
assert.equal(getPipelineQueue('onboarding'), 'Onboarding');
assert.equal(isInterviewUpcoming('2026-08-19', '09:00', new Date('2026-08-18T09:00:00')), true);
assert.equal(isInterviewUpcoming('2026-08-17', '09:00', new Date('2026-08-18T09:00:00')), false);

const history = createPipelineHistory('CAN-1', 'applied', undefined, 'Received submission', 'HR');
const withHistory = ensureCandidatePipelineHistory([candidate()], emptyPipeline, 'HR');
assert.equal(withHistory.histories.length, 1);
assert.equal(withHistory.histories[0].newStatus, 'applied');
assert.equal(history.eventType, 'received_submission_to_applied');

const passedInterview = {
  id: 'INT-1',
  candidateId: 'CAN-1',
  scheduledDate: '2026-08-17',
  scheduledTime: '09:00',
  status: 'scheduled' as const,
  createdAt: '2026-08-17T01:00:00.000Z',
  updatedAt: '2026-08-17T01:00:00.000Z',
};
assert.equal(
  getEffectiveCandidateStatus(
    candidate({ pipelineStatus: 'interview_scheduled', stage: 'Interviewing' }),
    { ...emptyPipeline, interviews: [passedInterview] },
    new Date('2026-08-18T09:00:00')
  ),
  'interview_passed'
);

const normalized = normalizeHiringPipeline({ histories: [history], interviews: 'invalid' });
assert.equal(normalized.histories.length, 1);
assert.equal(normalized.interviews.length, 0);

console.log('Hiring pipeline tests passed.');
