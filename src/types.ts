/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AppTab =
  | 'dashboard'
  | 'employee-portal'
  | 'payroll'
  | 'payroll-mockup'
  | 'payslip-viewer'
  | 'performance'
  | 'directory'
  | 'reports'
  | 'settings'
  | 'help'
  | 'entities'
  | 'tax-settings'
  | 'leave-management'
  | 'work-shift-groups'
  | 'forms-directory'
  | 'hire-onboarding'
  | 'department-role'
  | 'socso-config';

export interface CorporateEntity {
  id: string; // Mapped to name (company name) - ENT ID removed from DB
  name: string;
  registrationNumber: string; // e.g. SSM / Co ROC No
  address: string;
  taxReferenceNo: string;
  epfReferenceNo: string;
  socsoReferenceNo: string;
  currency: string; // e.g. RM, USD
  isActive: boolean;
  logoUrl?: string;
  theme?: 'theme1' | 'theme2' | 'theme3';
  googleScriptUrl?: string;
  enableLindung24?: boolean;
}

export interface Dependant {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  dob: string; // YYYY-MM-DD
  isDisabled?: boolean;
  inTertiaryEducation?: boolean;
  isOver18?: boolean;
}

export interface CareerHistoryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'Status Change' | 'Promotion' | 'Department Transfer' | 'Salary Revision' | 'Hired' | 'Employment Type Change' | 'Subsidiary Transfer';
  previousValue: string;
  newValue: string;
  notes: string;
}

export interface PayslipDescriptionOverrides {
  basicSalary?: string;
  allowanceGeneral?: string;
  allowanceTransport?: string;
  allowanceParking?: string;
  allowanceMeal?: string;
  allowanceAccommodation?: string;
  allowancePhone?: string;
  overtime?: string;
  unpaidLeave?: string;
  incompleteMonthDeduction?: string;
  deductionInLieu?: string;
  deductionCp38?: string;
  deductionOthers?: string;
  epfEmployee?: string;
  socsoEmployee?: string;
  lindung24Employee?: string;
  eisEmployee?: string;
  taxPcb?: string;
}

export type PayrollDocumentType = 'Payslip' | 'Payment Voucher';

export type ContractStatutoryTreatment = 'with_statutory' | 'without_statutory';

export type PayrollPayoutKind = 'regular' | 'bonus' | 'incentive_commission' | 'claim_reimbursement';

export type PayrollLineNotes = Record<string, string>;

export interface PayrollDocumentDisplaySettings {
  showDesignation?: boolean;
  showDepartment?: boolean;
  showEmail?: boolean;
  showNricPassport?: boolean;
  showTin?: boolean;
  showEpfNumber?: boolean;
  showDateJoined?: boolean;
  showLastWorkingDay?: boolean;
  showBankAccount?: boolean;
  showCompanyAddress?: boolean;
  showEarningsDetails?: boolean;
  showDeductionDetails?: boolean;
  showEmployerContributions?: boolean;
  showYtdSummary?: boolean;
  showNotesFooter?: boolean;
}

export interface Employee {
  id: string; // Mapped to email - EMP ID removed from DB
  entityId: string; // Mapped to entityName (company name) - ENT ID removed from DB
  name: string;
  email: string;
  designation: string;
  department: string;
  status: 'Active' | 'Active - Probation' | 'Active - Confirmation' | 'On Leave' | 'Resigned' | 'Terminated' | 'Suspended';
  bankName: string;
  accountNo: string;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  overtime: number;
  performanceBonus: number;
  
  // Extended Payroll Fields (Earnings)
  allowanceGeneral?: number;
  allowanceTransport?: number;
  allowanceParking?: number;
  allowanceMeal?: number;
  allowanceAccommodation?: number;
  allowancePhone?: number;
  incompleteMonthDeduction?: number;
  paymentDate?: string;
  payslipDescriptions?: PayslipDescriptionOverrides;
  
  reimbursementAmount?: number;
  reimbursementDesc?: string;
  
  bonusAmount?: number;
  bonusDesc?: string;
  
  commissionAmount?: number;
  commissionDesc?: string;
  
  backPayAmount?: number;
  backPayDesc?: string;
  
  awsAmount?: number;
  awsDesc?: string;
  
  compensationAmount?: number;
  compensationDesc?: string;

  // Extended Payroll Fields (Deductions)
  deductionInLieu?: number;
  deductionCp38?: number;
  deductionOthers?: number;
  deductionOthersDesc?: string;

  epfRateEmployee: number; // e.g. 11
  epfRateEmployer: number; // e.g. 13
  socsoEmployee: number;
  socsoEmployer: number;
  eisEmployee: number;
  eisEmployer: number;
  skbbkEmployee?: number;
  skbbkEmployer?: number;
  taxPcb: number;
  unpaidLeave: number;
  hrdCorp: number;
  avatarUrl?: string;
  gender?: 'Male' | 'Female';
  
  // New employee specific compliance fields
  nricPassport: string;
  nationality: string;
  contactNumber?: string;
  contactNumberFillLater?: boolean;
  taxNumber: string;
  epfNumber?: string;
  socsoNumber?: string;
  emailFillLater?: boolean;
  employmentType:
    | 'Internship'
    | 'Probation'
    | 'Permanent'
    | 'Contract'
    | 'Fixed Term Contract'
    | 'Independent Contractor'
    | 'Part Time'
    | 'Probationary'
    | 'Confirmation'
    | 'Independent Contractor / Freelance';
  maritalStatus: 'Single' | 'Married' | 'Divorced' | 'Widowed';
  eligibleForStatutory?: 'Yes' | 'No';
  contractStatutoryTreatment?: ContractStatutoryTreatment;
  payrollDocumentDisplaySettings?: PayrollDocumentDisplaySettings;
  optInEpf?: boolean;
  optInSocso?: boolean;
  optInEis?: boolean;
  optInPcb?: boolean;
  enableLindung24?: boolean;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  emergencyContactFillLater?: boolean;
  dateOfJoined: string;
  dateOfConfirmation?: string;
  probationDurationMonths?: number;
  probationExtend?: boolean;
  probationExtensionMonths?: number;
  dateOfTermination?: string;
  
  // Spouse Details
  spouseName?: string;
  spouseNric?: string;
  spouseIsWorking?: 'Yes' | 'No';
  spouseCompany?: string;
  spousePosition?: string;

  // Dependants details
  hasDependants?: 'Yes' | 'No';
  dependants?: Dependant[];
  
  // Progression history tracker
  careerHistory?: CareerHistoryEntry[];

  // Uploaded Compliance Documents
  icFrontUrl?: string;
  icBackUrl?: string;
  educationCertUrl?: string;
  
  historicalPayrollRecords?: HistoricalPayrollRecord[];
  effectiveDatedProfiles?: EmployeeTaxProfile[];
  historicalPcbResults?: HistoricalPCBResult[];
  historicalVariances?: PCBHistoricalVariance[];
  tp1Declarations?: TP1Declaration[];
  tp3Data?: TP3Data;
  salaryAdjustments?: SalaryAdjustment[];
  socsoProfile?: EmployeeSocsoProfile;
  employee_pcb_history_ledger?: EmployeePCBHistoryLedgerEntry[];
  employee_tp3_declarations?: EmployeeTP3Declaration[];
}

export type WorkShiftDayType = 'full_day' | 'half_day' | 'rest';

export interface WorkShiftGroup {
  id: string;
  entityId: string;
  name: string;
  description?: string;
  enabled: boolean;
  weeklyHours: number;
  weeklyHoursWarning: boolean;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkShiftGroupDay {
  id: string;
  entityId: string;
  groupId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  dayType: WorkShiftDayType;
  isWorkDay: boolean;
  actualHours: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeWorkShiftAssignment {
  id: string;
  entityId: string;
  employeeId: string;
  groupId: string;
  effectiveDate: string;
  endDate?: string;
  active: boolean;
  assignedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type PublicHolidayCategory = 'national' | 'state';

export interface PublicHolidayGroup {
  id: string;
  entityId: string;
  name: string;
  category: PublicHolidayCategory;
  stateCode?: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PublicHoliday {
  id: string;
  entityId: string;
  groupId: string;
  name: string;
  holidayDate: string;
  observedDate?: string;
  year: number;
  notes?: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkShiftData {
  groups: WorkShiftGroup[];
  days: WorkShiftGroupDay[];
  assignments: EmployeeWorkShiftAssignment[];
  holidayGroups: PublicHolidayGroup[];
  holidays: PublicHoliday[];
}

export interface SalaryAdjustment {
  id: string;
  startDate: string;
  effectiveDate: string;
  adjustedSalary: number;
  reason?: string;
  createdAt: string;
}

export interface ReviewCycle {
  id: string;
  name: string;
  period: string;
  status: 'In Progress' | 'Upcoming' | 'Completed';
}

export interface EmployeePerformance {
  employeeId: string;
  reviewCycleId: string;
  managerName: string;
  reviewStatus: 'Completed' | 'In Progress' | 'Not Started';
  rating: number; // 0 to 5
  teamworkScore: number; // 1 to 5
  communicationScore: number; // 1 to 5
  problemSolvingScore: number; // 1 to 5
  selfEvaluation: string;
  managerComments: string;
  goals: string[];
}

export interface ReportConfig {
  reportType: string;
  startDate: string;
  endDate: string;
  targetAudience: string[];
  metrics: string[];
  format: 'pdf' | 'excel' | 'csv' | 'ppt';
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  entityId: string;
  stage: 'Applied' | 'Interviewing' | 'Offered' | 'Onboarding';
  progress: number;
  dateJoined: string;
  pipelineStatus?: CandidatePipelineStatus;
  pipelineUpdatedAt?: string;
  receivedAt?: string;
  appliedAt?: string;
  kivNotes?: string;
  kivFollowUpDate?: string;
  rejectionReason?: string;
}

export type CandidatePipelineStatus =
  | 'applied'
  | 'shortlisted'
  | 'kiv'
  | 'interview_scheduled'
  | 'interview_cancelled'
  | 'interview_no_show'
  | 'interview_withdrew'
  | 'interview_passed'
  | 'offer_preparing'
  | 'offer_sent'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'onboarding'
  | 'rejected';

export type CandidateInterviewStatus =
  | 'scheduled'
  | 'cancelled'
  | 'no_show'
  | 'withdrew'
  | 'completed';

export type CandidateOfferStatus =
  | 'preparing'
  | 'sent'
  | 'accepted'
  | 'rejected';

export type CandidateShareLinkKind = 'interview' | 'onboarding';
export type CandidateShareDeliveryChannel = 'copy' | 'native' | 'email' | 'whatsapp';

export interface CandidatePipelineHistory {
  id: string;
  candidateId: string;
  previousStatus?: CandidatePipelineStatus;
  newStatus: CandidatePipelineStatus;
  eventType: string;
  notes?: string;
  actorName?: string;
  createdAt: string;
}

export interface CandidateInterview {
  id: string;
  candidateId: string;
  scheduledDate: string;
  scheduledTime: string;
  meetingLink?: string;
  notes?: string;
  status: CandidateInterviewStatus;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateEvaluation {
  id: string;
  candidateId: string;
  evaluatorName: string;
  evaluatorDesignation: string;
  evaluationDate: string;
  technicalScore: number;
  communicationScore: number;
  culturalFitScore: number;
  leadershipScore: number;
  overallRecommendation: 'kiv' | 'reject' | 'offer';
  additionalComments?: string;
  updatedAt: string;
}

export interface CandidateOffer {
  id: string;
  candidateId: string;
  status: CandidateOfferStatus;
  statusUpdatedAt: string;
  responseNotes?: string;
  rejectionReason?: string;
}

export interface CandidateShareLink {
  id: string;
  candidateId: string;
  kind: CandidateShareLinkKind;
  token: string;
  url: string;
  expiresAt: string;
  createdAt: string;
  invalidatedAt?: string;
}

export interface CandidateShareDelivery {
  id: string;
  shareLinkId: string;
  candidateId: string;
  channel: CandidateShareDeliveryChannel;
  handoffStatus: 'ready' | 'completed' | 'failed';
  createdAt: string;
  error?: string;
}

export interface HiringPipelineData {
  histories: CandidatePipelineHistory[];
  interviews: CandidateInterview[];
  evaluations: CandidateEvaluation[];
  offers: CandidateOffer[];
  shareLinks: CandidateShareLink[];
  shareDeliveries: CandidateShareDelivery[];
}

export type PCBProcessingMode =
  | "live_payroll"
  | "historical_reconstruction"
  | "historical_recalculation";

export type HistoricalCalculationBasis =
  | "actual_deduction_history"
  | "corrected_recalculated_history";

export type HistoricalPCBStatus =
  | "not_calculated"
  | "calculated"
  | "actual_amount_missing"
  | "requires_review"
  | "variance_detected"
  | "correction_required"
  | "approved"
  | "locked";

export interface EmployeeTaxProfile {
  effectiveDate: string; // YYYY-MM-DD
  basicSalary: number;
  employmentStatus?: Employee['status'];
  housingAllowance?: number;
  transportAllowance?: number;
  allowanceGeneral?: number;
  allowanceTransport?: number;
  allowanceParking?: number;
  allowanceMeal?: number;
  allowanceAccommodation?: number;
  allowancePhone?: number;
  commissionAmount?: number;
  maritalStatus: 'Single' | 'Married' | 'Divorced' | 'Widowed';
  spouseIsWorking?: 'Yes' | 'No';
  spouseNric?: string;
  spouseName?: string;
  hasDependants?: 'Yes' | 'No';
  dependantsCount?: number;
  eligibleForStatutory?: 'Yes' | 'No';
  contractStatutoryTreatment?: ContractStatutoryTreatment;
  payrollDocumentDisplaySettings?: PayrollDocumentDisplaySettings;
  epfRateEmployee?: number;
  epfRateEmployer?: number;
  taxNumber?: string;
  nricPassport?: string;
  dateOfJoined?: string;
  dateOfTermination?: string;
  taxResidenceStatus?: 'RESIDENT' | 'NON_RESIDENT' | 'KNOWN_TO_BE_RESIDENT' | 'RESIDENCE_PENDING' | 'REVIEW_REQUIRED';
  taxCalculationType?: 'NON_RESIDENT' | 'RESIDENT_PROGRESSIVE' | 'RETURNING_EXPERT_PROGRAMME' | 'KNOWLEDGE_WORKER_SPECIFIED_REGION' | 'NON_CITIZEN_C_SUITE_APPROVED_COMPANY' | 'REVIEW_REQUIRED';
  employeeDisabled?: boolean;
  spouseDisabled?: boolean;
  specialProgrammeCode?: string;
  specialProgrammeApprovalReference?: string;
  specialProgrammeEffectiveFrom?: string;
  specialProgrammeEffectiveTo?: string;
  approvedAt?: string;
  assistReconciliationRequired?: boolean;
}

export interface HistoricalPayrollRecord {
  id?: string;
  payrollMonth: number; // 1 to 12
  payrollYear?: number;
  paymentDate?: string;
  basicSalary: number;
  allowanceGeneral?: number;
  allowanceTransport?: number;
  allowanceParking?: number;
  allowanceMeal?: number;
  allowanceAccommodation?: number;
  allowancePhone?: number;
  overtime?: number;
  performanceBonus?: number;
  bonusAmount?: number;
  bonusDesc?: string;
  commissionAmount?: number;
  commissionDesc?: string;
  backPayAmount?: number;
  backPayDesc?: string;
  awsAmount?: number;
  awsDesc?: string;
  compensationAmount?: number;
  compensationDesc?: string;
  reimbursementAmount?: number;
  reimbursementDesc?: string;
  unpaidLeave?: number;
  incompleteMonthDeduction?: number;
  deductionInLieu?: number;
  deductionCp38?: number;
  deductionOthers?: number;
  deductionOthersDesc?: string;
  payslipDescriptions?: PayslipDescriptionOverrides;
  payoutKind?: PayrollPayoutKind;
  isSeparatePayout?: boolean;
  statutoryTreatment?: ContractStatutoryTreatment;
  payoutTitle?: string;
  payoutDescription?: string;
  lineNotes?: PayrollLineNotes;
  documentType?: PayrollDocumentType;
  compensationLabel?: string;
  displaySettingsSnapshot?: PayrollDocumentDisplaySettings;
  epfEmployee?: number;
  epfEmployer?: number;
  socsoEmployee?: number;
  socsoEmployer?: number;
  lindung24Employee?: number;
  eisEmployee?: number;
  eisEmployer?: number;
  hrdCorp?: number;
  zakat?: number;
  cp38?: number;
  actualPCBDeducted: number;
  netPay?: number;
}

export interface TP1Declaration {
  taxYear: number;
  declarationDate: string;
  effectivePayrollMonth: number;
  claimCategory: string;
  claimedAmount: number;
  qualifyingAmount: number;
  approvalStatus: string;
}

export interface EmployeePCBHistoryLedgerEntry {
  id: string;
  employee_id: string;
  assessment_year: number;
  payroll_month: number;
  source_type: 'TP3_PREVIOUS_EMPLOYER' | 'CURRENT_EMPLOYER_PAYROLL' | 'APPROVED_ADJUSTMENT' | 'REVERSAL';
  source_reference: string;
  source_record_id: string;
  original_amount: number;
  adjustment_amount: number;
  effective_amount: number;
  normal_remuneration_pcb: number;
  additional_remuneration_pcb: number;
  total_pcb: number;
  status: 'FINALIZED' | 'APPROVED' | 'LOCKED' | 'PAID' | 'SUBMITTED' | 'DRAFT' | 'CALCULATED' | 'PENDING_APPROVAL' | 'CANCELLED' | 'VOID' | 'REVERSED' | 'FAILED';
  finalized_at?: string;
  submitted_at?: string;
  reversed_at?: string;
  reversal_reference?: string;
  included_in_accumulated_x: boolean;
  exclusion_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface EmployeeTP3Declaration {
  id: string;
  employee_id: string;
  taxYear: number;
  previousEmployerRemuneration: number;
  previousEmployerAdditionalRemuneration: number;
  previousEmployerEpf: number;
  previousEmployerAllowableDeductions: number;
  previousEmployerPcb: number;
  previousEmployerZakat: number;
  previousEmployerStartDate: string;
  previousEmployerEndDate: string;
  declarationDate: string;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'CANCELLED';
  supportingDocument?: string;
}

export interface TP3Data {
  taxYear?: number;
  previousEmployerRemuneration?: number;
  previousEmployerAdditionalRemuneration?: number;
  previousEmployerEpf?: number;
  previousEmployerPcb?: number;
  previousEmployerZakat?: number;

  accumulatedPriorRemuneration?: number;
  accumulatedPriorEPF?: number;
  accumulatedPriorPCB?: number;
  accumulatedPriorSocso?: number;
}

export interface PCBCalculationStep {
  stepName: string;
  formula?: string;
  inputs?: Record<string, any>;
  output: number;
  notes?: string;
}

export interface HistoricalPCBResult {
  employeeId: string;
  taxYear: number;
  payrollMonth: number;

  processingMode: PCBProcessingMode;
  calculationBasis: HistoricalCalculationBasis;

  effectiveEmployeeProfileVersion: string; // e.g. YYYY-MM-DD or index
  taxConfigurationVersion: string;

  currentNormalRemuneration: number;
  currentAdditionalRemuneration: number;
  currentMonthEmployeeEPF: number;

  accumulatedPriorRemuneration: number;
  accumulatedPriorAdditionalRemuneration: number;
  accumulatedPriorEPF: number;
  accumulatedPriorPCB: number;
  accumulatedPriorZakat: number;

  previousEmployerRemuneration: number;
  previousEmployerEPF: number;
  previousEmployerPCB: number;
  previousEmployerZakat: number;

  projectedRemainingRemuneration: number;
  estimatedAnnualIncome: number;
  qualifyingDeductions: number;
  personalAndFamilyReliefs: number;
  approvedTP1Reliefs: number;
  estimatedChargeableIncome: number;
  estimatedAnnualTax: number;

  normalRemunerationPCB: number;
  additionalRemunerationPCB: number;
  calculatedPCB: number;

  actualPCBDeducted: number | null;
  pcbVariance: number | null;

  currentZakat: number;
  currentCP38: number;
  totalActualTaxDeduction: number | null;
  totalCalculatedTaxDeduction: number;

  calculationTimestamp: string;
  calculationVersion: number;
  status: HistoricalPCBStatus;

  warnings: string[];
  errors: string[];
  calculationBreakdown: PCBCalculationStep[];

  // Section 17 compliant fields
  assessmentYear?: number;
  taxResidenceStatus?: string;
  taxCategory?: string;
  accumulatedPreviousEmployerRemuneration?: number;
  accumulatedCurrentEmployerRemuneration?: number;
  accumulatedQualifyingEPF?: number;
  accumulatedAllowableDeductions?: number;
  accumulatedPreviousEmployerPCB?: number;
  accumulatedCurrentEmployerPCB?: number;
  accumulatedAdjustedPCB?: number;
  accumulatedPCB_X?: number;
  accumulatedZakat_Z?: number;
  estimatedAnnualChargeableIncome_P?: number;
  selectedTaxBracket?: string;
  M?: number;
  R?: number;
  B?: number;
  remainingEstimatedTax?: number;
  currentAndRemainingMonthCount?: number;
  currentMonthZakatOffset?: number;
  finalPCB?: number;
  CP38?: number;
  totalTaxDeduction?: number;
  configurationVersion?: string;
}

export interface PCBHistoricalVariance {
  payrollPeriod: string; // e.g. "2026-03"
  originalCalculatedPCB: number;
  originalActualPCBDeducted: number;
  revisedCalculatedPCB: number;
  variance: number;
  reason: string;
  calculationBasis: HistoricalCalculationBasis;
  approvalStatus: "pending" | "approved" | "rejected";
}

export interface HistoricalPCBMonthContext {
  employeeId: string;
  taxYear: number;
  payrollMonth: number;

  employeeProfileEffectiveForMonth: EmployeeTaxProfile;

  previousEmployerTP3: TP3Data;

  priorCurrentEmployerPayrolls: HistoricalPayrollRecord[];

  currentMonthPayroll: HistoricalPayrollRecord;

  accumulatedRemunerationBeforeCurrentMonth: number;
  accumulatedAdditionalRemunerationBeforeCurrentMonth: number;
  accumulatedEmployeeEPFBeforeCurrentMonth: number;
  accumulatedPCBBeforeCurrentMonth: number;
  accumulatedZakatBeforeCurrentMonth: number;

  currentMonthNormalRemuneration: number;
  currentMonthAdditionalRemuneration: number;
  currentMonthEmployeeEPF: number;
  currentMonthZakat: number;
  currentMonthCP38: number;

  projectedRemainingNormalRemuneration: number;
  remainingApplicableMonths: number;
  calculationBasis: HistoricalCalculationBasis;
  employee_pcb_history_ledger?: EmployeePCBHistoryLedgerEntry[];
  employee_tp3_declarations?: EmployeeTP3Declaration[];
}

export interface PayrollRecord2026 {
  id: string; // employeeEmail_month_year
  employeeEmail: string;
  payrollMonth: number;
  payrollYear: number;
  paymentDate?: string;
  basicSalary: number;
  allowanceGeneral: number;
  allowanceTransport: number;
  allowanceParking: number;
  allowanceMeal: number;
  allowanceAccommodation: number;
  allowancePhone: number;
  overtime: number;
  bonusAmount: number;
  bonusDesc?: string;
  commissionAmount: number;
  commissionDesc?: string;
  backPayAmount: number;
  backPayDesc?: string;
  awsAmount: number;
  awsDesc?: string;
  compensationAmount: number;
  compensationDesc?: string;
  reimbursementAmount: number;
  reimbursementDesc?: string;
  unpaidLeave: number;
  incompleteMonthDeduction?: number;
  deductionInLieu: number;
  deductionCp38: number;
  deductionOthers: number;
  deductionOthersDesc?: string;
  payslipDescriptions?: PayslipDescriptionOverrides;
  payoutKind?: PayrollPayoutKind;
  isSeparatePayout?: boolean;
  statutoryTreatment?: ContractStatutoryTreatment;
  payoutTitle?: string;
  payoutDescription?: string;
  lineNotes?: PayrollLineNotes;
  documentType?: PayrollDocumentType;
  compensationLabel?: string;
  displaySettingsSnapshot?: PayrollDocumentDisplaySettings;
  actualPCBDeducted: number;
  epfEmployee: number;
  epfEmployer: number;
  socsoEmployee: number;
  socsoEmployer: number;
  lindung24Employee?: number;
  eisEmployee: number;
  eisEmployer: number;
  hrdCorp?: number;
  netPay: number;
  grossPay?: number;
  calculationVersion?: string;
  status?: 'Draft' | 'Processed' | 'Cancelled';
  createdAt: string;
}

export type SOCSOSchemeCode =
  | 'SOCSO_ACT4'
  | 'EMPLOYMENT_INJURY'
  | 'INVALIDITY'
  | 'NON_EMPLOYMENT_INJURY'
  | 'LINDUNG_24_JAM';

export type SOCSOCategory =
  | 'FIRST_CATEGORY'
  | 'SECOND_CATEGORY'
  | 'EXEMPT'
  | 'REVIEW_REQUIRED';

export type SOCSOPhase =
  | 'PRE_JUNE_2026'
  | 'LINDUNG24_PHASE_1'
  | 'LINDUNG24_PHASE_2'
  | 'LINDUNG24_PHASE_3';

export interface EmployeeSocsoProfile {
  employeeId: string;
  nationality: string;
  identityNumber: string;
  dateOfBirth: string;
  employmentStartDate: string;
  employmentEndDate?: string | null;
  contractType: 'Permanent' | 'Contract' | 'Temporary' | 'Part Time';
  isUnderContractOfService: boolean;
  socsoRegistrationNumber: string;
  socsoRegistered: boolean;
  socsoCoverageStatus: 'Covered' | 'Not Covered' | 'Exempt';
  firstSocsoContributionDate?: string | null;
  ageAtFirstSocsoContribution?: number | null;
  hasPreviousSocsoContribution: boolean;
  contributionCategory: SOCSOCategory;
  multipleEmployerStatus: 'Single Employer' | 'Multiple Employers';
  selectedEmployerForLindung24: boolean;
  foreignWorkerStatus: 'Local' | 'Foreigner' | 'Permanent Resident';
  domesticWorkerStatus: boolean;
  exemptionReason?: string | null;
  effectiveFrom: string;
  effectiveTo: string;
}

export interface SOCSOConfiguration {
  id: string;
  schemeCode: SOCSOSchemeCode;
  legislation: string;
  contributionCategory: 'FIRST_CATEGORY' | 'SECOND_CATEGORY';
  phase: SOCSOPhase;
  effectiveFrom: string;
  effectiveTo: string;
  wageCeiling: number;
  sourceDocument: string;
  sourceDocumentDate: string;
  sourceVersion: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'active' | 'deactivated';
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SOCSOBracket {
  id: string;
  configurationId: string;
  contributionCategory: 'FIRST_CATEGORY' | 'SECOND_CATEGORY';
  lowerWageLimit: number;
  upperWageLimit: number;
  lowerLimitInclusive: boolean;
  upperLimitInclusive: boolean;
  wageBracketNumber: number;
  assumedMonthlyWage: number;
  employerEmploymentInjury: number;
  employerInvalidity: number;
  employerTotal: number;
  employeeInvalidity: number;
  employeeNonEmploymentInjury: number; // LINDUNG 24 Jam
  employeeTotal: number;
  combinedTotal: number;
  effectiveFrom: string;
  effectiveTo: string;
}

export interface SocsoEarningComponent {
  earningCode: string;
  earningName: string;
  subjectToSocso: boolean;
  includedInSocsoWages: boolean;
  excludedFromSocsoWages: boolean;
  earningCategory: string;
  effectiveFrom: string;
  effectiveTo: string;
  statutoryReference: string;
  requiresReview: boolean;
}

export interface SocsoManualOverride {
  id: string;
  employeeId: string;
  payrollPeriod: string;
  originalCalculatedEmployerSocso: number;
  originalCalculatedEmployeeSocso: number;
  correctedEmployerSocso: number;
  correctedEmployeeSocso: number;
  differenceEmployer: number;
  differenceEmployee: number;
  reason: string;
  supportingDocumentUrl?: string;
  requestedBy: string;
  approvedBy: string;
  approvedAt: string;
  assistReconciliationRequired: boolean;
}

export interface SocsoAuditLog {
  id: string;
  userId: string;
  action: string;
  dateTime: string;
  oldValue: string;
  newValue: string;
  reason: string;
  employeeId?: string;
  payrollPeriod?: string;
  configurationVersion?: string;
  sessionId?: string;
}

export interface SocsoContributionResult {
  employeeId: string;
  payrollPeriod: string;
  effectiveDate: string;
  socsoCoverageStatus: string;
  contributionCategory: SOCSOCategory;
  grossRemuneration: number;
  includedSocsoWages: number;
  excludedSocsoWages: number;
  socsoWages: number;
  contributionWage: number;
  wageCeilingApplied: boolean;
  wageBracketNumber: number;
  wageBracketDescription: string;
  employerEmploymentInjury: number;
  employerInvalidity: number;
  employerSocsoTotal: number;
  employeeInvalidity: number;
  employeeLindung24: number;
  employeeSocsoTotal: number;
  totalSocsoContribution: number;
  configurationVersion: string;
  calculationTimestamp: string;
  warningMessages: string[];
  validationErrors: string[];
  calculationStatus: 'calculated' | 'exempt' | 'review_required' | 'override_applied' | 'error';
}

export interface SOCSOContributionSchedule {
  id: string;
  schedule_code: string;
  schedule_name: string;
  effective_from: string;
  effective_to: string | null;
  currency: string;
  storage_unit: 'sen' | 'ringgit';
  wage_ceiling_sen: number;
  status: 'DRAFT' | 'VALIDATION_FAILED' | 'UNDER_REVIEW' | 'APPROVED' | 'ACTIVE' | 'ARCHIVED' | 'REJECTED';
  official_source: string;
  compatibility_reference: string;
  source_file_name: string;
  source_file_hash: string;
  created_by: string;
  created_at: string;
  approved_by: string;
  approved_at: string;
  activated_by: string;
  activated_at: string;
}

export interface SOCSOContributionBracket {
  id: string;
  schedule_id: string;
  bracket_number: number; // 1 to 65
  description: string;
  lower_bound_sen: number;
  upper_bound_sen: number | null;
  lower_bound_inclusive: boolean;
  upper_bound_inclusive: boolean;
  is_maximum_bracket: boolean;

  category1_employer_invalidity_sen: number;
  category1_employer_employment_injury_sen: number;
  category1_employer_total_sen: number;

  category1_employee_invalidity_sen: number;
  category1_employee_lindung24_sen: number;
  category1_employee_total_sen: number;
  category1_grand_total_sen: number;

  category2_employer_employment_injury_sen: number;
  category2_employer_total_sen: number;

  category2_employee_lindung24_sen: number;
  category2_employee_total_sen: number;
  category2_grand_total_sen: number;

  created_at: string;
  updated_at: string;
}

export interface PCBConfiguration {
  id: string;
  assessmentYear: number;
  configurationCode: string;
  configurationVersion: string;
  effectiveFrom: string;
  effectiveTo: string;
  status: 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'ACTIVE' | 'ARCHIVED' | 'REJECTED';
  sourceDocumentName: string;
  sourceDocumentVersion: string;
  sourceDocumentDate: string;
  officialCalculatorReference: string;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  activatedBy?: string;
  activatedAt?: string;
}
