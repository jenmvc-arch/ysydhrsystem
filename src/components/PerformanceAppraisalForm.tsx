import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  Lock,
  Plus,
  Printer,
  Save,
  Send,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { Employee, EmployeePerformance, ReviewCycle } from '../types';
import EmployeeAvatar from './EmployeeAvatar';
import {
  AppraisalCompetencyRating,
  AppraisalKpiCategory,
  AppraisalKpiRow,
  AppraisalWorkflowStatus,
  buildPerformanceFromAppraisalDraft,
  calculateAppraisalScores,
  createBlankKpiRow,
  loadAppraisalDraft,
  PerformanceAppraisalDraft,
  saveAppraisalDraft,
} from '../lib/performanceAppraisalDraft';
import { useFeedback } from '../context/FeedbackContext';

interface PerformanceAppraisalFormProps {
  employee: Employee;
  reviewCycle: ReviewCycle;
  performance?: EmployeePerformance | null;
  mode: 'manager' | 'employee';
  currentUserName?: string | null;
  onBack?: () => void;
  onDraftSaved?: (draft: PerformanceAppraisalDraft) => void;
  onSavePerformance?: (performance: EmployeePerformance) => void;
  onShowNotification: (title: string, message: string) => void;
}

type DraftAction = 'save' | 'send' | 'submit' | 'agree' | 'finalise';

const inputClass = 'w-full rounded border border-neutral-border bg-white px-3 py-2 text-sm text-on-background outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-surface-container-low disabled:text-on-surface-variant';
const textareaClass = `${inputClass} min-h-20 resize-y`;
const labelClass = 'block text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant mb-1.5';

const REVIEW_TYPES = [
  'Annual Performance Review',
  'Mid-Year Review',
  'Probation Review',
  'Project-Based Review',
  'Promotion Review',
  'Other',
];

const MANAGEMENT_DECISIONS = [
  '',
  'Confirm Employment',
  'Extend Probation',
  'Do Not Confirm Employment',
  'Promote Employee',
  'Maintain Current Position',
  'Performance Improvement Plan Required',
  'Other',
];

const toNumberOrBlank = (value: string): number | '' => {
  if (value.trim() === '') return '';
  const parsed = Number(value);
  return Number.isNaN(parsed) ? '' : parsed;
};

const statusTone = (status: AppraisalWorkflowStatus) => {
  if (status === 'Finalised') return 'bg-green-100 text-green-700 border-green-200';
  if (status === 'Agreed') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'Employee Submitted' || status === 'Pending Manager Review') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (status === 'Pending Employee Input') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
};

const actionCopy: Record<DraftAction, { title: string; message: string; status?: AppraisalWorkflowStatus; syncCore?: boolean; requireValidWeight?: boolean }> = {
  save: {
    title: 'Draft Saved',
    message: 'The appraisal draft was saved locally for this browser.',
  },
  send: {
    title: 'Sent to Employee',
    message: 'The appraisal is now ready for employee self-appraisal input.',
    status: 'Pending Employee Input',
    syncCore: true,
  },
  submit: {
    title: 'Self Appraisal Submitted',
    message: 'Your self-appraisal has been submitted for manager review.',
    status: 'Employee Submitted',
    syncCore: true,
    requireValidWeight: true,
  },
  agree: {
    title: 'Review Marked Agreed',
    message: 'The appraisal has been marked as agreed and is ready for finalisation.',
    status: 'Agreed',
    syncCore: true,
    requireValidWeight: true,
  },
  finalise: {
    title: 'Appraisal Finalised',
    message: 'The appraisal has been finalised and reflected in performance analytics.',
    status: 'Finalised',
    syncCore: true,
    requireValidWeight: true,
  },
};

const Section = ({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="overflow-hidden rounded-lg border border-[#e0bfbc] bg-white shadow-sm">
    <div className="flex flex-col gap-2 bg-primary px-5 py-3 text-white md:flex-row md:items-center md:justify-between">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {aside}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

export default function PerformanceAppraisalForm({
  employee,
  reviewCycle,
  performance,
  mode,
  currentUserName,
  onBack,
  onDraftSaved,
  onSavePerformance,
  onShowNotification,
}: PerformanceAppraisalFormProps) {
  const { confirmAction } = useFeedback();
  const [draft, setDraft] = useState<PerformanceAppraisalDraft>(() =>
    loadAppraisalDraft(employee, reviewCycle, performance, currentUserName || '')
  );

  useEffect(() => {
    setDraft(loadAppraisalDraft(employee, reviewCycle, performance, currentUserName || ''));
  }, [employee.id, reviewCycle.id, performance?.reviewStatus, currentUserName]);

  const scores = useMemo(() => calculateAppraisalScores(draft), [draft]);
  const isManagerMode = mode === 'manager';
  const isFinalised = draft.status === 'Finalised';
  const canManagerEdit = isManagerMode && !isFinalised;
  const canEmployeeEdit = mode === 'employee' && !isFinalised;
  const canEditSelfFields = isManagerMode ? !isFinalised : canEmployeeEdit;
  const canEditManagerFields = canManagerEdit;
  const canEditSetup = canManagerEdit;
  const canEditEmployeeInformation = canEditSetup || canEmployeeEdit;
  const canEditKpiDefinition = canEditSetup || canEmployeeEdit;
  const canEditReviewMeta = canEditSetup || canEmployeeEdit;
  const employeeSubmitLabel = draft.status === 'Employee Submitted'
    ? 'Update Self Appraisal'
    : draft.status === 'Agreed'
      ? 'Revise Self Appraisal'
      : 'Submit Self Appraisal';

  const persistDraft = (nextDraft: PerformanceAppraisalDraft, action: DraftAction) => {
    const copy = actionCopy[action];
    const nextScores = calculateAppraisalScores(nextDraft);
    if (copy.requireValidWeight && !nextScores.isKpiWeightValid) {
      onShowNotification(
        'KPI Weight Incomplete',
        `KPI weight must equal 100% before this action. Current total is ${nextScores.kpiWeightTotal.toFixed(1)}%.`
      );
      return;
    }

    const savedDraft = saveAppraisalDraft(nextDraft);
    setDraft(savedDraft);
    onDraftSaved?.(savedDraft);

    if (copy.syncCore && onSavePerformance) {
      onSavePerformance(buildPerformanceFromAppraisalDraft(savedDraft, performance));
    }

    onShowNotification(copy.title, copy.message);
  };

  const runAction = (action: DraftAction) => {
    const copy = actionCopy[action];
    const nextDraft = copy.status ? { ...draft, status: copy.status } : draft;
    persistDraft(nextDraft, action);
  };

  const updateDraft = (updates: Partial<PerformanceAppraisalDraft>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
  };

  const updateQualitative = (updates: Partial<PerformanceAppraisalDraft['qualitative']>) => {
    setDraft((prev) => ({
      ...prev,
      qualitative: { ...prev.qualitative, ...updates },
    }));
  };

  const updateManagement = (updates: Partial<PerformanceAppraisalDraft['management']>) => {
    setDraft((prev) => ({
      ...prev,
      management: { ...prev.management, ...updates },
    }));
  };

  const updateEmployeeInfo = (updates: Partial<PerformanceAppraisalDraft['employeeInfo']>) => {
    setDraft((prev) => ({
      ...prev,
      employeeInfo: { ...prev.employeeInfo, ...updates },
    }));
  };

  const updateSignatures = (updates: Partial<PerformanceAppraisalDraft['signatures']>) => {
    setDraft((prev) => ({
      ...prev,
      signatures: { ...prev.signatures, ...updates },
    }));
  };

  const updateKpiCategory = (categoryId: string, updater: (category: AppraisalKpiCategory) => AppraisalKpiCategory) => {
    setDraft((prev) => ({
      ...prev,
      kpiCategories: prev.kpiCategories.map((category) => (
        category.id === categoryId ? updater(category) : category
      )),
    }));
  };

  const updateKpiRow = (
    categoryId: string,
    rowId: string,
    updater: (row: AppraisalKpiRow) => AppraisalKpiRow
  ) => {
    updateKpiCategory(categoryId, (category) => ({
      ...category,
      rows: category.rows.map((row) => (row.id === rowId ? updater(row) : row)),
    }));
  };

  const updateCompetency = (
    competencyId: string,
    updater: (competency: AppraisalCompetencyRating) => AppraisalCompetencyRating
  ) => {
    setDraft((prev) => ({
      ...prev,
      competencies: prev.competencies.map((competency) => (
        competency.id === competencyId ? updater(competency) : competency
      )),
    }));
  };

  const addKpiCategory = () => {
    setDraft((prev) => ({
      ...prev,
      kpiCategories: [
        ...prev.kpiCategories,
        {
          id: `kpi-category-${Date.now()}`,
          name: 'New KPI Category',
          rows: [createBlankKpiRow()],
        },
      ],
    }));
  };

  const removeKpiCategory = async (categoryId: string) => {
    await confirmAction({
      title: 'Remove KPI Category',
      message: 'Remove this KPI category and all rows? This action cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Remove Category',
      onConfirm: () => {
        setDraft((prev) => ({
          ...prev,
          kpiCategories: prev.kpiCategories.filter((category) => category.id !== categoryId),
        }));
      },
    });
  };

  const addKpiRow = (categoryId: string) => {
    updateKpiCategory(categoryId, (category) => ({
      ...category,
      rows: [...category.rows, createBlankKpiRow()],
    }));
  };

  const removeKpiRow = (categoryId: string, rowId: string) => {
    updateKpiCategory(categoryId, (category) => ({
      ...category,
      rows: category.rows.filter((row) => row.id !== rowId),
    }));
  };

  const getKpiRowPercent = (row: AppraisalKpiRow) => {
    const activeScore = Number(row.agreedScore || row.appraiseeScore || 0);
    return ((activeScore / 5) * Number(row.weight || 0)).toFixed(1);
  };

  const renderActionButtons = () => (
    <div className="appraisal-no-print flex flex-wrap items-center justify-end gap-2">
      {onBack && (
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded border border-neutral-border bg-white px-3 py-2 text-xs font-bold text-on-surface transition-colors hover:bg-surface-container"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
      )}
      <button
        onClick={() => runAction('save')}
        className="inline-flex items-center gap-2 rounded border border-primary bg-white px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/5"
      >
        <Save className="h-3.5 w-3.5" />
        Save Draft
      </button>
      {isManagerMode && !isFinalised && (
        <button
          onClick={() => runAction('send')}
          className="inline-flex items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100"
        >
          <Send className="h-3.5 w-3.5" />
          Send to Employee
        </button>
      )}
      {mode === 'employee' && canEmployeeEdit && (
        <button
          onClick={() => runAction('submit')}
          className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-primary-container"
        >
          <Send className="h-3.5 w-3.5" />
          {employeeSubmitLabel}
        </button>
      )}
      {isManagerMode && !isFinalised && (
        <button
          onClick={() => runAction('agree')}
          className="inline-flex items-center gap-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          <UserCheck className="h-3.5 w-3.5" />
          Mark Agreed
        </button>
      )}
      {isManagerMode && !isFinalised && (
        <button
          onClick={() => runAction('finalise')}
          className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-primary-container"
        >
          <FileCheck2 className="h-3.5 w-3.5" />
          Finalise
        </button>
      )}
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded border border-neutral-border bg-surface-container px-3 py-2 text-xs font-bold text-on-surface transition-colors hover:bg-surface-container-high"
      >
        <Printer className="h-3.5 w-3.5" />
        Print / PDF
      </button>
    </div>
  );

  return (
    <div className="space-y-6 text-left">
      <div className="rounded-xl border border-neutral-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <EmployeeAvatar employee={employee} className="h-14 w-14 rounded-2xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-on-background">Performance & Appraisal</h1>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.25em] ${statusTone(draft.status)}`}>
                  {draft.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-on-surface-variant">
                {employee.name} - {employee.designation} - {reviewCycle.name}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {mode === 'manager'
                  ? 'Admin/manager draft view with KPI setup, agreed scoring, verification, and finalisation.'
                  : 'Employee self-appraisal view with evidence, self scores, and acknowledgement.'}
              </p>
            </div>
          </div>
          {renderActionButtons()}
        </div>
      </div>

      {!scores.isKpiWeightValid && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-bold">KPI weight validation</p>
            <p className="mt-0.5 text-xs">
              Save draft is allowed, but submit/finalise actions require total KPI weight to equal 100%. Current total: {scores.kpiWeightTotal.toFixed(1)}%.
            </p>
          </div>
        </div>
      )}

      <Section title="1. Employee Information">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label>
            <span className={labelClass}>Employee Name</span>
            <input
              value={draft.employeeInfo.employeeName}
              disabled={!canEditEmployeeInformation}
              onChange={(event) => updateEmployeeInfo({ employeeName: event.target.value })}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Employee ID / IC</span>
            <input
              value={draft.employeeInfo.employeeIdOrIc}
              disabled={!canEditEmployeeInformation}
              onChange={(event) => updateEmployeeInfo({ employeeIdOrIc: event.target.value })}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Position Title</span>
            <input
              value={draft.employeeInfo.positionTitle}
              disabled={!canEditEmployeeInformation}
              onChange={(event) => updateEmployeeInfo({ positionTitle: event.target.value })}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Department</span>
            <input
              value={draft.employeeInfo.department}
              disabled={!canEditEmployeeInformation}
              onChange={(event) => updateEmployeeInfo({ department: event.target.value })}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Appraiser Name</span>
            <input
              value={draft.appraiserName}
              disabled={!canEditSetup}
              onChange={(event) => updateDraft({ appraiserName: event.target.value })}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Review Period</span>
            <input value={reviewCycle.period} disabled className={inputClass} />
          </label>
          <label>
            <span className={labelClass}>Review Type</span>
            <select
              value={draft.reviewType}
              disabled={!canEditReviewMeta}
              onChange={(event) => updateDraft({ reviewType: event.target.value })}
              className={inputClass}
            >
              {REVIEW_TYPES.map((reviewType) => (
                <option key={reviewType} value={reviewType}>{reviewType}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Review From</span>
            <input
              type="month"
              value={draft.reviewFrom}
              disabled={!canEditReviewMeta}
              onChange={(event) => updateDraft({ reviewFrom: event.target.value })}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Review To</span>
            <input
              type="month"
              value={draft.reviewTo}
              disabled={!canEditReviewMeta}
              onChange={(event) => updateDraft({ reviewTo: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className="md:col-span-2 xl:col-span-3">
            <span className={labelClass}>Review Purposes & Descriptions</span>
            <textarea
              value={draft.reviewPurpose}
              disabled={!canEditReviewMeta}
              onChange={(event) => updateDraft({ reviewPurpose: event.target.value })}
              className={textareaClass}
            />
          </label>
        </div>
      </Section>

      <Section title="Scoring Scale">
        <div className="grid gap-3 md:grid-cols-5">
          {[
            ['5.0', 'Outstanding', 'Consistently exceeds targets and delivers measurable additional value.'],
            ['4.0-4.5', 'Exceeds', 'Frequently exceeds agreed targets or required performance standard.'],
            ['3.0-3.5', 'Meets', 'Achieves agreed targets and performs the role satisfactorily.'],
            ['2.0-2.5', 'Partially Meets', 'Achieves some requirements, but improvement is required.'],
            ['1.0-1.5', 'Does Not Meet', 'Fails to achieve most requirements or has repeated gaps.'],
          ].map(([score, title, body]) => (
            <div key={score} className="rounded border border-neutral-border bg-surface-container-low p-3 text-xs">
              <p className="font-bold text-primary">{score}: {title}</p>
              <p className="mt-1 leading-5 text-on-surface-variant">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="2. Key Performance Indicators (KPIs) - 60%"
        aside={<span className="text-sm font-normal">Total Weight: {scores.kpiWeightTotal.toFixed(1)}%</span>}
      >
        <div className="space-y-5">
          {draft.kpiCategories.map((category) => (
            <div key={category.id} className="overflow-hidden rounded-lg border border-[#e0bfbc] bg-white">
              <div className="flex flex-col gap-2 bg-[#f2e8d8] px-4 py-3 md:flex-row md:items-center md:justify-between">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">KPI category name</span>
                  <input
                    value={category.name}
                    disabled={!canEditSetup}
                    onChange={(event) => updateKpiCategory(category.id, (current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded border border-transparent bg-white/70 px-3 py-2 text-sm font-bold uppercase tracking-[0.08em] text-primary outline-none focus:border-primary disabled:bg-transparent"
                  />
                </label>
                {canEditSetup && (
                  <button
                    onClick={() => removeKpiCategory(category.id)}
                    className="inline-flex items-center gap-1.5 rounded border border-primary/20 bg-white px-3 py-2 text-xs font-bold text-primary hover:bg-primary/5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove Category
                  </button>
                )}
              </div>

              <div className="divide-y divide-neutral-border">
                {category.rows.map((row) => (
                  <div key={row.id} className="space-y-4 p-4">
                    <div className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr_0.45fr_0.5fr_0.5fr_0.45fr]">
                      <label>
                        <span className={labelClass}>Key Result Area</span>
                        <textarea
                          value={row.kra}
                          disabled={!canEditKpiDefinition}
                          onChange={(event) => updateKpiRow(category.id, row.id, (current) => ({ ...current, kra: event.target.value }))}
                          className={textareaClass}
                        />
                      </label>
                      <label>
                        <span className={labelClass}>Expected Outcome</span>
                        <textarea
                          value={row.outcome}
                          disabled={!canEditKpiDefinition}
                          onChange={(event) => updateKpiRow(category.id, row.id, (current) => ({ ...current, outcome: event.target.value }))}
                          className={textareaClass}
                        />
                      </label>
                      <label>
                        <span className={labelClass}>Weight %</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={row.weight}
                          disabled={!canEditKpiDefinition}
                          onChange={(event) => updateKpiRow(category.id, row.id, (current) => ({ ...current, weight: Number(event.target.value || 0) }))}
                          className={`${inputClass} text-center`}
                        />
                      </label>
                      <label>
                        <span className={labelClass}>Appraisee</span>
                        <input
                          type="number"
                          step={0.5}
                          min={1}
                          max={5}
                          value={row.appraiseeScore}
                          disabled={!canEditSelfFields}
                          onChange={(event) => updateKpiRow(category.id, row.id, (current) => ({ ...current, appraiseeScore: toNumberOrBlank(event.target.value) }))}
                          className={`${inputClass} text-center`}
                          placeholder="-"
                        />
                      </label>
                      <label>
                        <span className={labelClass}>Agreed</span>
                        <input
                          type="number"
                          step={0.5}
                          min={1}
                          max={5}
                          value={row.agreedScore}
                          disabled={!canEditManagerFields}
                          onChange={(event) => updateKpiRow(category.id, row.id, (current) => ({ ...current, agreedScore: toNumberOrBlank(event.target.value) }))}
                          className={`${inputClass} text-center font-bold text-primary`}
                          placeholder={mode === 'employee' ? 'Pending' : '-'}
                        />
                      </label>
                      <div>
                        <span className={labelClass}>Calc.</span>
                        <div className="rounded border border-neutral-border bg-surface-container-low px-3 py-2 text-center text-sm font-bold text-on-background">
                          {getKpiRowPercent(row)}%
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-neutral-border bg-surface-container-low p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary">Evidence & Verification</p>
                        {canEditKpiDefinition && category.rows.length > 1 && (
                          <button
                            onClick={() => removeKpiRow(category.id, row.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-container"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove Row
                          </button>
                        )}
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <label>
                          <span className={labelClass}>Actual Achievement / Result</span>
                          <textarea
                            value={row.evidence.achievement}
                            disabled={!canEditSelfFields}
                            onChange={(event) => updateKpiRow(category.id, row.id, (current) => ({
                              ...current,
                              evidence: { ...current.evidence, achievement: event.target.value, status: event.target.value ? 'Submitted' : current.evidence.status },
                            }))}
                            className={textareaClass}
                            placeholder="Describe work completed and results achieved."
                          />
                        </label>
                        <label>
                          <span className={labelClass}>Manager Verification / Comment</span>
                          <textarea
                            value={row.evidence.managerVerification}
                            disabled={!canEditManagerFields}
                            onChange={(event) => updateKpiRow(category.id, row.id, (current) => ({
                              ...current,
                              evidence: { ...current.evidence, managerVerification: event.target.value },
                            }))}
                            className={textareaClass}
                            placeholder={mode === 'employee' ? 'Manager verification will appear here after review.' : 'Confirm achievement and scoring basis.'}
                          />
                        </label>
                        <label>
                          <span className={labelClass}>Evidence Type</span>
                          <select
                            value={row.evidence.evidenceType}
                            disabled={!canEditSelfFields}
                            onChange={(event) => updateKpiRow(category.id, row.id, (current) => ({
                              ...current,
                              evidence: { ...current.evidence, evidenceType: event.target.value as AppraisalKpiRow['evidence']['evidenceType'] },
                            }))}
                            className={inputClass}
                          >
                            <option>Analytics</option>
                            <option>Document</option>
                            <option>Approval</option>
                            <option>Other</option>
                          </select>
                        </label>
                        <label>
                          <span className={labelClass}>Evidence Link</span>
                          <input
                            value={row.evidence.evidenceLink}
                            disabled={!canEditSelfFields}
                            onChange={(event) => updateKpiRow(category.id, row.id, (current) => ({
                              ...current,
                              evidence: { ...current.evidence, evidenceLink: event.target.value },
                            }))}
                            className={inputClass}
                            placeholder="https://link-to-evidence"
                          />
                        </label>
                        <label>
                          <span className={labelClass}>Completion %</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={row.evidence.completionPercent}
                            disabled={!canEditSelfFields}
                            onChange={(event) => updateKpiRow(category.id, row.id, (current) => ({
                              ...current,
                              evidence: { ...current.evidence, completionPercent: toNumberOrBlank(event.target.value) },
                            }))}
                            className={inputClass}
                          />
                        </label>
                        <label>
                          <span className={labelClass}>Evidence Status</span>
                          <select
                            value={row.evidence.status}
                            disabled={!canEditManagerFields}
                            onChange={(event) => updateKpiRow(category.id, row.id, (current) => ({
                              ...current,
                              evidence: { ...current.evidence, status: event.target.value as AppraisalKpiRow['evidence']['status'] },
                            }))}
                            className={inputClass}
                          >
                            <option>Not Added</option>
                            <option>Submitted</option>
                            <option>Verified</option>
                            <option>Revision Req.</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {canEditKpiDefinition && (
                <button
                  onClick={() => addKpiRow(category.id)}
                  className="appraisal-no-print flex w-full items-center justify-center gap-2 border-t border-neutral-border bg-surface-container-low px-4 py-3 text-xs font-bold text-primary transition-colors hover:bg-surface-container"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add KPI Item
                </button>
              )}
            </div>
          ))}

          {canEditSetup && (
            <button
              onClick={addKpiCategory}
              className="appraisal-no-print inline-flex items-center gap-2 rounded bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary-container"
            >
              <Plus className="h-3.5 w-3.5" />
              Add KPI Category
            </button>
          )}
        </div>
      </Section>

      <Section title="3. Competency & Behavioural Assessment - 40%">
        <div className="space-y-4">
          {draft.competencies.map((competency) => (
            <div key={competency.id} className="overflow-hidden rounded-lg border border-neutral-border bg-white">
              <div className="grid gap-3 border-b border-neutral-border bg-surface-container-low p-4 lg:grid-cols-[1.5fr_0.55fr_0.55fr] lg:items-center">
                <div>
                  <h3 className="font-bold text-primary">{competency.name}</h3>
                  <p className="mt-1 text-xs leading-5 text-on-surface-variant">{competency.description}</p>
                </div>
                <label>
                  <span className={labelClass}>Appraisee Rating</span>
                  <input
                    type="number"
                    step={0.5}
                    min={1}
                    max={5}
                    value={competency.appraiseeRating}
                    disabled={!canEditSelfFields}
                    onChange={(event) => updateCompetency(competency.id, (current) => ({
                      ...current,
                      appraiseeRating: toNumberOrBlank(event.target.value),
                    }))}
                    className={`${inputClass} text-center`}
                    placeholder="-"
                  />
                </label>
                <label>
                  <span className={labelClass}>Agreed Rating</span>
                  <input
                    type="number"
                    step={0.5}
                    min={1}
                    max={5}
                    value={competency.agreedRating}
                    disabled={!canEditManagerFields}
                    onChange={(event) => updateCompetency(competency.id, (current) => ({
                      ...current,
                      agreedRating: toNumberOrBlank(event.target.value),
                    }))}
                    className={`${inputClass} text-center font-bold text-primary`}
                    placeholder={mode === 'employee' ? 'Pending' : '-'}
                  />
                </label>
              </div>
              <div className="grid gap-4 bg-white p-4 lg:grid-cols-3">
                <label>
                  <span className={labelClass}>Appraisee Comment</span>
                  <textarea
                    value={competency.appraiseeComment}
                    disabled={!canEditSelfFields}
                    onChange={(event) => updateCompetency(competency.id, (current) => ({
                      ...current,
                      appraiseeComment: event.target.value,
                    }))}
                    className={textareaClass}
                  />
                </label>
                <label>
                  <span className={labelClass}>Manager Comment</span>
                  <textarea
                    value={competency.managerComment}
                    disabled={!canEditManagerFields}
                    onChange={(event) => updateCompetency(competency.id, (current) => ({
                      ...current,
                      managerComment: event.target.value,
                    }))}
                    className={textareaClass}
                    placeholder={mode === 'employee' ? 'Manager comments will appear here after review.' : ''}
                  />
                </label>
                <label>
                  <span className={labelClass}>Supporting Example</span>
                  <textarea
                    value={competency.supportingExample}
                    disabled={!canEditSelfFields && !canEditManagerFields}
                    onChange={(event) => updateCompetency(competency.id, (current) => ({
                      ...current,
                      supportingExample: event.target.value,
                    }))}
                    className={textareaClass}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="4. Summary and Evaluation">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-neutral-border bg-surface-container-low p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">KPI Raw Score</p>
            <p className="mt-2 text-2xl font-bold text-primary">{scores.kpiRawPercent.toFixed(2)}%</p>
            <p className="mt-1 text-xs text-on-surface-variant">Weighted: {scores.kpiWeightedPoints.toFixed(2)} / 60</p>
          </div>
          <div className="rounded-lg border border-neutral-border bg-surface-container-low p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">Competency Raw Score</p>
            <p className="mt-2 text-2xl font-bold text-primary">{scores.competencyRawPercent.toFixed(2)}%</p>
            <p className="mt-1 text-xs text-on-surface-variant">Weighted: {scores.competencyWeightedPoints.toFixed(2)} / 40</p>
          </div>
          <div className="rounded-lg border border-neutral-border bg-[#f2e8d8] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">Total Points</p>
            <p className="mt-2 text-2xl font-bold text-primary">{scores.totalPoints.toFixed(2)}</p>
            <p className="mt-1 text-xs text-on-surface-variant">Out of 100</p>
          </div>
          <div className="rounded-lg border border-neutral-border bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant">Final Level</p>
            <p className="mt-2 text-lg font-bold text-primary">{scores.tierLabel}</p>
            <p className="mt-1 text-xs text-on-surface-variant">Rating sync: {scores.finalRating || 'Not rated'} / 5</p>
          </div>
        </div>
      </Section>

      <Section title="5. Qualitative Comments & Development">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className={labelClass}>Employee Overall Comment</span>
            <textarea
              value={draft.qualitative.employeeOverallComment}
              disabled={!canEditSelfFields}
              onChange={(event) => updateQualitative({ employeeOverallComment: event.target.value })}
              className={textareaClass}
              placeholder="Summarise achievements, constraints, support needed, and growth areas."
            />
          </label>
          <label>
            <span className={labelClass}>Key Strengths</span>
            <textarea
              value={draft.qualitative.keyStrengths}
              disabled={!canEditManagerFields}
              onChange={(event) => updateQualitative({ keyStrengths: event.target.value })}
              className={textareaClass}
            />
          </label>
          <label>
            <span className={labelClass}>Main Areas for Improvement</span>
            <textarea
              value={draft.qualitative.improvementAreas}
              disabled={!canEditManagerFields}
              onChange={(event) => updateQualitative({ improvementAreas: event.target.value })}
              className={textareaClass}
            />
          </label>
          <label>
            <span className={labelClass}>Support & Training Required</span>
            <textarea
              value={draft.qualitative.supportTraining}
              disabled={!canEditManagerFields}
              onChange={(event) => updateQualitative({ supportTraining: event.target.value })}
              className={textareaClass}
            />
          </label>
          <label>
            <span className={labelClass}>Next Review Objectives</span>
            <textarea
              value={draft.qualitative.nextObjectives}
              disabled={!canEditManagerFields}
              onChange={(event) => updateQualitative({ nextObjectives: event.target.value })}
              className={textareaClass}
              placeholder="One goal per line for analytics sync."
            />
          </label>
          <label className="md:col-span-2">
            <span className={labelClass}>Manager Overall Feedback</span>
            <textarea
              value={draft.qualitative.managerOverallComment}
              disabled={!canEditManagerFields}
              onChange={(event) => updateQualitative({ managerOverallComment: event.target.value })}
              className={textareaClass}
              placeholder={mode === 'employee' ? 'Manager feedback will appear here after review.' : 'Final manager feedback for the employee.'}
            />
          </label>
        </div>
      </Section>

      {isManagerMode && (
        <Section title="6. Management Usage Only">
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className={labelClass}>Management Decision</span>
              <select
                value={draft.management.decision}
                disabled={!canEditManagerFields}
                onChange={(event) => updateManagement({ decision: event.target.value })}
                className={inputClass}
              >
                {MANAGEMENT_DECISIONS.map((decision) => (
                  <option key={decision || 'empty'} value={decision}>
                    {decision || '-- Select Decision --'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelClass}>Effective Date</span>
              <input
                type="date"
                value={draft.management.effectiveDate}
                disabled={!canEditManagerFields}
                onChange={(event) => updateManagement({ effectiveDate: event.target.value })}
                className={inputClass}
              />
            </label>
            {draft.management.decision === 'Promote Employee' && (
              <label className="md:col-span-2">
                <span className={labelClass}>New Position</span>
                <input
                  value={draft.management.newPosition}
                  disabled={!canEditManagerFields}
                  onChange={(event) => updateManagement({ newPosition: event.target.value })}
                  className={inputClass}
                />
              </label>
            )}
            {draft.management.decision === 'Extend Probation' && (
              <label>
                <span className={labelClass}>New Probation End Date</span>
                <input
                  type="date"
                  value={draft.management.newProbationEndDate}
                  disabled={!canEditManagerFields}
                  onChange={(event) => updateManagement({ newProbationEndDate: event.target.value })}
                  className={inputClass}
                />
              </label>
            )}
            <label className="md:col-span-2">
              <span className={labelClass}>Reason / Notes</span>
              <textarea
                value={draft.management.decision === 'Other' ? draft.management.other : draft.management.reason}
                disabled={!canEditManagerFields}
                onChange={(event) => updateManagement(
                  draft.management.decision === 'Other'
                    ? { other: event.target.value }
                    : { reason: event.target.value }
                )}
                className={textareaClass}
              />
            </label>
          </div>
        </Section>
      )}

      <Section title={isManagerMode ? '7. Acknowledgement & Signatures' : '6. Acknowledgement & Signatures'}>
        <div className="mb-5 rounded-lg border border-neutral-border bg-surface-container-low p-4 text-sm leading-6 text-on-surface-variant">
          I acknowledge that this appraisal has been reviewed and discussed with me. Acknowledgement confirms receipt and discussion, not necessarily agreement with every rating or comment.
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label>
            <span className={labelClass}>Appraisee Signature</span>
            <input
              value={draft.signatures.appraiseeName}
              disabled={!canEditSelfFields}
              onChange={(event) => updateSignatures({ appraiseeName: event.target.value })}
              className={inputClass}
              placeholder={employee.name}
            />
          </label>
          <label>
            <span className={labelClass}>Appraisee Date</span>
            <input
              type="date"
              value={draft.signatures.appraiseeDate}
              disabled={!canEditSelfFields}
              onChange={(event) => updateSignatures({ appraiseeDate: event.target.value })}
              className={inputClass}
            />
          </label>
          <div className="hidden md:block" />
          <label>
            <span className={labelClass}>Appraiser Signature</span>
            <input
              value={draft.signatures.appraiserName}
              disabled={!canEditManagerFields}
              onChange={(event) => updateSignatures({ appraiserName: event.target.value })}
              className={inputClass}
              placeholder={draft.appraiserName}
            />
          </label>
          <label>
            <span className={labelClass}>Appraiser Date</span>
            <input
              type="date"
              value={draft.signatures.appraiserDate}
              disabled={!canEditManagerFields}
              onChange={(event) => updateSignatures({ appraiserDate: event.target.value })}
              className={inputClass}
            />
          </label>
          <div className="flex items-center gap-2 rounded border border-neutral-border bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
            <Lock className="h-4 w-4 text-primary" />
            {mode === 'employee' ? 'Manager signature is read-only for employees.' : 'Manager and HR acknowledgement area.'}
          </div>
          <label>
            <span className={labelClass}>HR Reviewer</span>
            <input
              value={draft.signatures.hrReviewerName}
              disabled={!canEditManagerFields}
              onChange={(event) => updateSignatures({ hrReviewerName: event.target.value })}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>HR Reviewer Date</span>
            <input
              type="date"
              value={draft.signatures.hrReviewerDate}
              disabled={!canEditManagerFields}
              onChange={(event) => updateSignatures({ hrReviewerDate: event.target.value })}
              className={inputClass}
            />
          </label>
          <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Last local save: {draft.updatedAt ? new Date(draft.updatedAt).toLocaleString() : 'Not saved yet'}
          </div>
        </div>
      </Section>

      <div className="appraisal-no-print sticky bottom-0 z-10 rounded-xl border border-neutral-border bg-white/95 p-3 shadow-[0_-10px_30px_rgba(53,24,18,0.08)] backdrop-blur">
        {renderActionButtons()}
      </div>
    </div>
  );
}
