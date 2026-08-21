import assert from 'node:assert/strict';
import {
  buildAppraisalPdf,
  formatAppraisalTimestamp,
  getAppraisalPdfBranding,
  sanitizeAppraisalFilename,
} from './lib/appraisalPdfExport';
import {
  calculateAppraisalScores,
  createDefaultAppraisalDraft,
  PerformanceAppraisalDraft,
} from './lib/performanceAppraisalDraft';
import type { Employee, ReviewCycle } from './types';

const employee = {
  id: 'jane.doe@example.com',
  entityId: 'Red Point Sdn. Bhd.',
  name: 'Jane Doe / Finance',
  email: 'jane.doe@example.com',
  designation: 'Senior Finance Manager',
  department: 'Finance',
  status: 'Active',
  bankName: '',
  accountNo: '',
  basicSalary: 0,
  housingAllowance: 0,
  transportAllowance: 0,
  overtime: 0,
  performanceBonus: 0,
  epfRateEmployee: 11,
  epfRateEmployer: 13,
  socsoEmployee: 0,
  socsoEmployer: 0,
  eisEmployee: 0,
  eisEmployer: 0,
  taxPcb: 0,
  unpaidLeave: 0,
  hrdCorp: 0,
  nricPassport: '900101-14-1234',
  nationality: 'Malaysian',
} as Employee;

const reviewCycle = {
  id: 'annual-2026',
  name: 'Annual Review 2026',
  period: '2026',
} as ReviewCycle;

const createPopulatedDraft = (): PerformanceAppraisalDraft => {
  const draft = createDefaultAppraisalDraft(employee, reviewCycle, null, 'Manager One');
  return {
    ...draft,
    status: 'Agreed',
    reviewFrom: '2026-01',
    reviewTo: '2026-12',
    projectName: 'Finance Transformation',
    projectClient: 'Red Point Group',
    updatedAt: '2026-08-21T08:15:30.000Z',
    kpiCategories: Array.from({ length: 4 }, (_, categoryIndex) => ({
      id: `category-${categoryIndex}`,
      name: `Category ${categoryIndex + 1}`,
      rows: Array.from({ length: 5 }, (_, rowIndex) => ({
        id: `row-${categoryIndex}-${rowIndex}`,
        kra: `KRA ${categoryIndex + 1}.${rowIndex + 1}`,
        outcome: `Outcome for category ${categoryIndex + 1}, item ${rowIndex + 1}, with measurable delivery expectations.`,
        weight: 5,
        appraiseeScore: 4,
        agreedScore: 4.5,
        evidence: {
          achievement: `Delivered result ${rowIndex + 1} with supporting evidence and reconciliation notes for the review period.`,
          managerVerification: 'Verified against monthly reporting and approved by the manager.',
          evidenceType: 'Analytics',
          evidenceLink: 'https://example.test/evidence',
          completionPercent: 100,
          status: 'Verified',
        },
      })),
    })),
    competencies: draft.competencies.map((competency, index) => ({
      ...competency,
      appraiseeRating: 4,
      agreedRating: 4.5,
      appraiseeComment: `Employee comment ${index + 1} describing the demonstrated behaviour.`,
      managerComment: `Manager comment ${index + 1} confirming the assessment.`,
      supportingExample: 'Led a cross-functional improvement initiative.',
    })),
    qualitative: {
      employeeOverallComment: 'This year included meaningful improvements in close quality and reporting speed.',
      keyStrengths: 'Reliable delivery, clear stakeholder communication, and careful financial controls.',
      improvementAreas: 'Continue building delegation and automation skills.',
      supportTraining: 'Advanced data visualisation and leadership coaching.',
      nextObjectives: 'Automate monthly close reporting\nBuild team capability through mentoring',
      managerOverallComment: 'Strong contribution and consistent ownership across the review cycle.',
    },
    management: {
      decision: 'Promote Employee',
      effectiveDate: '2027-01-01',
      newPosition: 'Finance Operations Lead',
      newProbationEndDate: '',
      reason: 'Promotion is supported by sustained results and broader leadership responsibilities.',
      other: '',
    },
    signatures: {
      appraiseeName: 'Jane Doe',
      appraiseeDate: '2026-08-21',
      appraiserName: 'Manager One',
      appraiserDate: '2026-08-21',
      hrReviewerName: 'HR Reviewer',
      hrReviewerDate: '2026-08-21',
    },
  };
};

const generatedAt = new Date('2026-08-21T06:15:30.000Z');
assert.equal(formatAppraisalTimestamp(generatedAt), '2026-08-21 14:15:30 GMT+8');
assert.equal(sanitizeAppraisalFilename('Jane Doe / Finance: 2026'), 'Jane_Doe_Finance_2026');
assert.equal(sanitizeAppraisalFilename('///'), 'Appraisal');

const originalDocument = (globalThis as any).document;
const originalWindow = (globalThis as any).window;
(globalThis as any).document = {};
(globalThis as any).window = {
  getComputedStyle: () => ({
    getPropertyValue: (name: string) => ({
      '--color-primary': '#825500',
      '--color-primary-container': '#f4a300',
      '--color-inverse-surface': '#2c3134',
      '--color-surface-container-low': '#eff4f8',
      '--color-background': '#f5fafe',
      '--color-neutral-border': '#d9dee2',
      '--color-on-background': '#171c1f',
      '--color-on-surface-variant': '#524533',
    }[name] || ''),
  }),
};
const liveBranding = getAppraisalPdfBranding('YSYD Sdn. Bhd.');
assert.equal(liveBranding.companyName, 'YSYD Sdn. Bhd.');
assert.deepEqual(liveBranding.branding.primary, [130, 85, 0]);
assert.deepEqual(liveBranding.branding.accent, [244, 163, 0]);
assert.deepEqual(liveBranding.branding.dark, [44, 49, 52]);
(globalThis as any).document = originalDocument;
(globalThis as any).window = originalWindow;

const populatedDraft = createPopulatedDraft();
const managerResult = buildAppraisalPdf({
  draft: populatedDraft,
  scores: calculateAppraisalScores(populatedDraft),
  mode: 'manager',
  companyName: 'YSYD Sdn. Bhd.',
  branding: {
    primary: [130, 85, 0],
    accent: [244, 163, 0],
    dark: [44, 49, 52],
    surface: [239, 244, 248],
    background: [245, 250, 254],
    border: [217, 222, 226],
    ink: [23, 28, 31],
    muted: [82, 69, 51],
  },
  generatedAt,
});
assert.ok(managerResult.bytes.length > 1000);
assert.equal(new TextDecoder('latin1').decode(managerResult.bytes.slice(0, 5)), '%PDF-');
assert.match(managerResult.filename, /^SANDBOX_REVIEW_COPY_Jane_Doe_Finance_Annual_Performance_Review_2026_08_21_141530\.pdf$/);
assert.ok(managerResult.bytes.length > 30000, 'populated appraisal should produce a substantial PDF');
const managerPdfText = new TextDecoder('latin1').decode(managerResult.bytes);
assert.match(managerPdfText, /Management Usage Only/);
assert.match(managerPdfText, /Promote Employee/);
assert.match(managerPdfText, /YSYD Sdn\. Bhd\./);
assert.match(managerPdfText, /GENERATED AT/);
assert.match(managerPdfText, /LAST SAVED AT/);

const employeeResult = buildAppraisalPdf({
  draft: populatedDraft,
  scores: calculateAppraisalScores(populatedDraft),
  mode: 'employee',
  generatedAt,
});
const employeePdfText = new TextDecoder('latin1').decode(employeeResult.bytes);
assert.ok(!employeePdfText.includes('Management Usage Only'));
assert.ok(!employeePdfText.includes('Promote Employee'));
assert.match(employeePdfText, /SANDBOX REVIEW COPY/);
assert.ok(employeeResult.bytes.length < managerResult.bytes.length);

console.log('Appraisal PDF exporter tests passed.');
