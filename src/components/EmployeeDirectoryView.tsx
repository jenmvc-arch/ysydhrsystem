/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { googleSheetsClient, isGoogleConfigured } from '../lib/googleSheetsClient';
import { getGmt8Timestamp, getGmt8DateString, formatToDDMMMYYYY } from '../lib/dateUtils';
import { formatNricOrPassport, MALAYSIAN_BANK_NAMES } from '../lib/employeeInput';
import { 
  Users, 
  Search, 
  Filter, 
  UserPlus, 
  X, 
  DollarSign, 
  Building2, 
  CheckCircle,
  AlertTriangle,
  Mail,
  Trash,
  Calendar,
  ShieldAlert,
  ShieldCheck,
  CheckSquare,
  XSquare,
  Phone,
  Globe,
  Heart,
  TrendingUp,
  History,
  UserCheck,
  FileText,
  Eye,
  Download,
  Printer,
  ArrowLeft,
  Check,
  Lock,
  Shield,
  Activity,
  Plus,
  Minus,
  RotateCw,
  Save,
  KeyRound,
  MessageCircle,
  Send,
  Copy,
  ExternalLink,
  Clock3
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Employee, EmployeeTaxProfile, CareerHistoryEntry, Dependant, CorporateEntity } from '../types';
import {
  getEmployeeAccountEvents,
  getEmployeeAccountSummaries,
  isEmployeeAccountPreview,
  runEmployeeAccountAction,
} from '../lib/employeeAccountClient';
import {
  AccountActionResult,
  AccountDeliveryChannel,
  EmployeeAccountAction,
  EmployeeAccountEvent,
  EmployeeAccountSummary,
} from '../lib/employeeAccountTypes';
import { canManageAppAccess } from '../lib/userRoles';
import EmployeeAvatar from './EmployeeAvatar';
import { FilePond, registerPlugin } from 'react-filepond';
import 'filepond/dist/filepond.min.css';
import FilePondPluginImagePreview from 'filepond-plugin-image-preview';
import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css';

registerPlugin(FilePondPluginImagePreview);
import {
  calculatePayslip,
  getPayslipLabel,
  getDirectLogoUrl,
  getPayrollBasicSalary,
  getSalaryProration,
  getMonthlyBaseSalary,
  getEmployeeForMonth,
  getCurrentActiveEmployees,
  getEffectiveEmploymentStatusForDate,
  getEffectiveProfileForDate,
  getEffectiveTerminationDateForDate,
  getPayrollDocumentProfile
} from '../data';

const EMPLOYEE_STATUS_OPTIONS: Exclude<Employee['status'], 'On Leave'>[] = [
  'Active',
  'Active - Probation',
  'Active - Confirmation',
  'Resigned',
  'Terminated',
  'Suspended'
];

const isSeparationStatus = (status: Employee['status']) =>
  status === 'Resigned' || status === 'Terminated';

const toUppercase = (value: string) => value.toUpperCase();

const getConfirmationDate = (
  joinedDate: string,
  probationMonths: number,
  extensionMonths = 0
) => {
  if (!joinedDate || !probationMonths) return '';
  const [year, month, day] = joinedDate.split('-').map(Number);
  if (!year || !month || !day) return '';

  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() + probationMonths + extensionMonths);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
};

const getPendingEmployeeEmail = () =>
  `pending-${Date.now()}-${Math.floor(Math.random() * 1000)}@ysydhrsystem.local`;

type AddEmployeeAllowanceKey =
  | 'allowanceGeneral'
  | 'allowanceTransport'
  | 'allowanceParking'
  | 'allowanceMeal'
  | 'allowanceAccommodation'
  | 'allowancePhone';

type EmployeeAllowanceDraft = {
  id: string;
  type: AddEmployeeAllowanceKey;
  amount: number;
};

const ADD_EMPLOYEE_ALLOWANCE_OPTIONS: { value: AddEmployeeAllowanceKey; label: string }[] = [
  { value: 'allowanceGeneral', label: 'General Allowance' },
  { value: 'allowanceTransport', label: 'Transport Allowance' },
  { value: 'allowanceParking', label: 'Parking Allowance' },
  { value: 'allowanceMeal', label: 'Meal Allowance' },
  { value: 'allowanceAccommodation', label: 'Accommodation Allowance' },
  { value: 'allowancePhone', label: 'Phone Allowance' }
];

const getNextAllowanceType = (allowances: EmployeeAllowanceDraft[]) =>
  ADD_EMPLOYEE_ALLOWANCE_OPTIONS.find(option =>
    !allowances.some(allowance => allowance.type === option.value)
  )?.value;

const getAllowanceAmount = (
  allowances: EmployeeAllowanceDraft[],
  type: AddEmployeeAllowanceKey
) => allowances
  .filter(allowance => allowance.type === type)
  .reduce((total, allowance) => total + Number(allowance.amount || 0), 0);

const getEmployeeAllowanceAmount = (employee: Employee, type: AddEmployeeAllowanceKey) => {
  switch (type) {
    case 'allowanceAccommodation':
      return employee.allowanceAccommodation !== undefined
        ? Number(employee.allowanceAccommodation || 0)
        : Number(employee.housingAllowance || 0);
    case 'allowanceTransport':
      return employee.allowanceTransport !== undefined
        ? Number(employee.allowanceTransport || 0)
        : Number(employee.transportAllowance || 0);
    case 'allowanceGeneral':
      return Number(employee.allowanceGeneral || 0);
    case 'allowanceParking':
      return Number(employee.allowanceParking || 0);
    case 'allowanceMeal':
      return Number(employee.allowanceMeal || 0);
    case 'allowancePhone':
      return Number(employee.allowancePhone || 0);
    default:
      return 0;
  }
};

const getActiveEmployeeAllowanceTypes = (employee: Employee) =>
  ADD_EMPLOYEE_ALLOWANCE_OPTIONS
    .filter(option => getEmployeeAllowanceAmount(employee, option.value) > 0)
    .map(option => option.value);

const getEmployeeStatusClasses = (status: Employee['status']) => {
  switch (status) {
    case 'Active':
    case 'Active - Probation':
    case 'Active - Confirmation':
      return {
        badge: 'bg-green-100 text-green-700',
        dot: 'bg-green-600'
      };
    case 'Resigned':
      return {
        badge: 'bg-amber-100 text-amber-700',
        dot: 'bg-amber-500'
      };
    case 'Suspended':
      return {
        badge: 'bg-zinc-100 text-zinc-600',
        dot: 'bg-zinc-400'
      };
    case 'On Leave':
      return {
        badge: 'bg-orange-100 text-orange-700',
        dot: 'bg-orange-500'
      };
    default:
      return {
        badge: 'bg-red-100 text-red-700',
        dot: 'bg-red-600'
      };
  }
};

interface EmployeeDirectoryViewProps {
  employees: Employee[];
  entities: CorporateEntity[];
  onAddEmployee: (emp: Employee) => void;
  onDeleteEmployee: (id: string) => Promise<void>;
  onUpdateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
  onShowNotification: (title: string, message: string, type?: 'success' | 'info') => void;
  activeEntityId?: string;
  currentUserEmail?: string | null;
}

export default function EmployeeDirectoryView({
  employees,
  entities,
  onAddEmployee,
  onDeleteEmployee,
  onUpdateEmployee,
  onShowNotification,
  activeEntityId,
  currentUserEmail
}: EmployeeDirectoryViewProps) {
  const activeEmployees = getCurrentActiveEmployees(employees);
  const [searchQuery, setSearchQuery] = useState('');
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const todayIsoDate = getGmt8DateString();
  const getDisplayedMonthlyBasicSalary = (employee: Employee) =>
    getMonthlyBaseSalary(employee, currentMonth, currentYear);
  const formatCurrencyAmount = (amount: number) =>
    amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [deptFilter, setDeptFilter] = useState('All Departments');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [entityFilter, setEntityFilter] = useState(activeEntityId || 'All Subsidiaries');

  useEffect(() => {
    if (activeEntityId) {
      setEntityFilter(activeEntityId);
    }
  }, [activeEntityId]);

  // Load departments and roles dynamically
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);

  useEffect(() => {
    const cacheKeyDepts = activeEntityId ? `company_departments_${activeEntityId}` : 'company_departments';
    const cacheKeyRoles = activeEntityId ? `company_roles_${activeEntityId}` : 'company_roles';

    const legacyDeptKey = activeEntityId ? `departments_${activeEntityId}` : null;
    const legacyRoleKey = activeEntityId ? `roles_${activeEntityId}` : null;
    const savedDepts = localStorage.getItem(cacheKeyDepts)
      || (legacyDeptKey ? localStorage.getItem(legacyDeptKey) : null)
      || localStorage.getItem('company_departments');
    let depts = ['Product & Engineering', 'Finance', 'Human Resources', 'Sales & Marketing', 'Strategy', 'Operations'];
    if (savedDepts) {
      try {
        depts = JSON.parse(savedDepts);
      } catch (error) {
        console.warn('[Department Settings] Ignoring invalid saved departments:', error);
      }
    }
    setAvailableDepartments(depts);

    const savedRoles = localStorage.getItem(cacheKeyRoles)
      || (legacyRoleKey ? localStorage.getItem(legacyRoleKey) : null)
      || localStorage.getItem('company_roles');
    let rls = ['Software Engineer', 'Senior Software Engineer', 'Product Manager', 'UX Designer', 'HR Specialist', 'Finance Manager', 'Consultant'];
    if (savedRoles) {
      try {
        rls = JSON.parse(savedRoles);
      } catch (error) {
        console.warn('[Role Settings] Ignoring invalid saved roles:', error);
      }
    }
    setAvailableRoles(rls);
  }, [activeEntityId]);

  // Self-Service Mode & Preview States
  const [viewMode, setViewMode] = useState<'admin' | 'self-service'>('admin');
  const [previewEmployeeId, setPreviewEmployeeId] = useState<string>(activeEmployees[0]?.id || '');
  const [viewingPayslipMonth, setViewingPayslipMonth] = useState<string | null>(null);
  const [selfServiceActiveTab, setSelfServiceActiveTab] = useState<'personal' | 'family' | 'financial' | 'history'>('personal');
  
  // States for interactive simulated profile edits inside Self-Service
  const [selfServiceContactNumber, setSelfServiceContactNumber] = useState('');
  const [selfServiceEmergencyName, setSelfServiceEmergencyName] = useState('');
  const [selfServiceEmergencyRelation, setSelfServiceEmergencyRelation] = useState('');
  const [selfServiceEmergencyPhone, setSelfServiceEmergencyPhone] = useState('');
  const [isSelfServiceEditingProfile, setIsSelfServiceEditingProfile] = useState(false);
  
  // Interactive zoom & rotate state for simulated payslip modal
  const [payslipZoom, setPayslipZoom] = useState(100);
  const [payslipRotation, setPayslipRotation] = useState(0);

  // Add Employee Modal form states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSavingForm, setIsSavingForm] = useState(false);
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [accountSummaries, setAccountSummaries] = useState<Record<string, EmployeeAccountSummary>>({});
  const [accountActionEmployee, setAccountActionEmployee] = useState<Employee | null>(null);
  const [accountActionMode, setAccountActionMode] = useState<EmployeeAccountAction>('share');
  const [accountActionChannel, setAccountActionChannel] = useState<AccountDeliveryChannel>('email');
  const [accountActionResult, setAccountActionResult] = useState<AccountActionResult | null>(null);
  const [accountEvents, setAccountEvents] = useState<EmployeeAccountEvent[]>([]);
  const [isAccountActionModalOpen, setIsAccountActionModalOpen] = useState(false);
  const [isAccountEventsLoading, setIsAccountEventsLoading] = useState(false);
  const [isAccountActionSaving, setIsAccountActionSaving] = useState(false);
  const accountPreviewMode = isEmployeeAccountPreview();
  const canManageAccountActions = accountPreviewMode || canManageAppAccess(currentUserEmail);
  const [formEntityId, setFormEntityId] = useState(activeEntityId || entities[0]?.id || '');
  
  useEffect(() => {
    setFormEntityId(activeEntityId || entities[0]?.id || '');
  }, [activeEntityId, entities]);

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDesignation, setFormDesignation] = useState('');
  const [formDepartment, setFormDepartment] = useState('Engineering');
  const [formStatus, setFormStatus] = useState<Employee['status']>('Active');
  const [formBank, setFormBank] = useState('Maybank Berhad');
  const [formAccount, setFormAccount] = useState('');
  const [formSalary, setFormSalary] = useState(5000);
  const [formAllowances, setFormAllowances] = useState<EmployeeAllowanceDraft[]>([]);
  const [formCreateAccount, setFormCreateAccount] = useState(true);

  // New specific compliance form states
  const [formNricPassport, setFormNricPassport] = useState('');
  const [formNationality, setFormNationality] = useState('Malaysian');
  const [formContactNumber, setFormContactNumber] = useState('');
  const [formContactNumberFillLater, setFormContactNumberFillLater] = useState(false);
  const [formTaxNumber, setFormTaxNumber] = useState('');
  const [formEpfNumber, setFormEpfNumber] = useState('');
  const [formSocsoNumber, setFormSocsoNumber] = useState('');
  const [formEmailFillLater, setFormEmailFillLater] = useState(false);
  const [formEmploymentType, setFormEmploymentType] = useState<Employee['employmentType']>('Confirmation');
  const [formEligibleForStatutory, setFormEligibleForStatutory] = useState<'Yes' | 'No'>('Yes');
  const [formContractStatutoryTreatment, setFormContractStatutoryTreatment] = useState<NonNullable<Employee['contractStatutoryTreatment']>>('without_statutory');
  const [formOptInEpf, setFormOptInEpf] = useState<boolean>(true);
  const [formOptInSocso, setFormOptInSocso] = useState<boolean>(true);
  const [formOptInEis, setFormOptInEis] = useState<boolean>(true);
  const [formOptInPcb, setFormOptInPcb] = useState<boolean>(true);
  const [formEnableLindung24, setFormEnableLindung24] = useState<boolean>(false);
  const [formMaritalStatus, setFormMaritalStatus] = useState<'Single' | 'Married' | 'Divorced' | 'Widowed'>('Single');
  const [formEmergencyContactName, setFormEmergencyContactName] = useState('');
  const [formEmergencyContactRelation, setFormEmergencyContactRelation] = useState('');
  const [formEmergencyContactPhone, setFormEmergencyContactPhone] = useState('');
  const [formEmergencyContactFillLater, setFormEmergencyContactFillLater] = useState(false);
  const [formDateOfJoined, setFormDateOfJoined] = useState(getGmt8DateString());
  const [formDateOfConfirmation, setFormDateOfConfirmation] = useState('');
  const [formConfirmationDateAuto, setFormConfirmationDateAuto] = useState(true);
  const [formProbationDurationMonths, setFormProbationDurationMonths] = useState(3);
  const [formProbationExtend, setFormProbationExtend] = useState(false);
  const [formProbationExtensionMonths, setFormProbationExtensionMonths] = useState(1);

  // Spouse details form states
  const [formSpouseName, setFormSpouseName] = useState('');
  const [formSpouseNric, setFormSpouseNric] = useState('');
  const [formSpouseIsWorking, setFormSpouseIsWorking] = useState<'Yes' | 'No'>('No');
  const [formSpouseCompany, setFormSpouseCompany] = useState('');
  const [formSpousePosition, setFormSpousePosition] = useState('');

  // Dependants details form states
  const [formHasDependants, setFormHasDependants] = useState<'Yes' | 'No'>('No');
  const [formDependants, setFormDependants] = useState<Omit<Dependant, 'id'>[]>([]);

  // Temp dependant fields for adding
  const [tempDepName, setTempDepName] = useState('');
  const [tempDepGender, setTempDepGender] = useState<'Male' | 'Female'>('Male');
  const [tempDepDob, setTempDepDob] = useState('2018-01-01');

  // Selected Employee Detail View States
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [formAvatarUrl, setFormAvatarUrl] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // General Info Edit States
  const [isEditingGeneralInfo, setIsEditingGeneralInfo] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editStatus, setEditStatus] = useState<Employee['status']>('Active');
  const [editBankName, setEditBankName] = useState('');
  const [editAccountNo, setEditAccountNo] = useState('');
  const [editBasicSalary, setEditBasicSalary] = useState(0);
  const [editHousingAllowance, setEditHousingAllowance] = useState(0);
  const [editTransportAllowance, setEditTransportAllowance] = useState(0);
  const [editAllowanceGeneral, setEditAllowanceGeneral] = useState(0);
  const [editAllowanceParking, setEditAllowanceParking] = useState(0);
  const [editAllowanceMeal, setEditAllowanceMeal] = useState(0);
  const [editAllowancePhone, setEditAllowancePhone] = useState(0);
  const [editVisibleAllowanceTypes, setEditVisibleAllowanceTypes] = useState<AddEmployeeAllowanceKey[]>([]);
  const [editNricPassport, setEditNricPassport] = useState('');
  const [editNationality, setEditNationality] = useState('');
  const [editContactNumber, setEditContactNumber] = useState('');
  const [editContactNumberFillLater, setEditContactNumberFillLater] = useState(false);
  const [editTaxNumber, setEditTaxNumber] = useState('');
  const [editEpfNumber, setEditEpfNumber] = useState('');
  const [editSocsoNumber, setEditSocsoNumber] = useState('');
  const [isEditSocsoNumberAutoFilled, setIsEditSocsoNumberAutoFilled] = useState(true);
  const [editEmailFillLater, setEditEmailFillLater] = useState(false);
  const [editEmploymentType, setEditEmploymentType] = useState('');
  const [editContractStatutoryTreatment, setEditContractStatutoryTreatment] = useState<NonNullable<Employee['contractStatutoryTreatment']>>('without_statutory');
  const [editDateOfJoined, setEditDateOfJoined] = useState('');
  const [editDateOfConfirmation, setEditDateOfConfirmation] = useState('');
  const [editConfirmationDateAuto, setEditConfirmationDateAuto] = useState(false);
  const [editEpfRateEmployee, setEditEpfRateEmployee] = useState(11);
  const [editEpfRateEmployer, setEditEpfRateEmployer] = useState(13);
  const [editEmergencyContactName, setEditEmergencyContactName] = useState('');
  const [editEmergencyContactRelation, setEditEmergencyContactRelation] = useState('');
  const [editEmergencyContactPhone, setEditEmergencyContactPhone] = useState('');
  const [editEmergencyContactFillLater, setEditEmergencyContactFillLater] = useState(false);
  const [editEntityId, setEditEntityId] = useState('');
  const [editProbationDurationMonths, setEditProbationDurationMonths] = useState(3);
  const [editProbationExtend, setEditProbationExtend] = useState(false);
  const [editProbationExtensionMonths, setEditProbationExtensionMonths] = useState(1);

  const getEditAllowanceAmount = (type: AddEmployeeAllowanceKey) => {
    switch (type) {
      case 'allowanceAccommodation':
        return editHousingAllowance;
      case 'allowanceTransport':
        return editTransportAllowance;
      case 'allowanceGeneral':
        return editAllowanceGeneral;
      case 'allowanceParking':
        return editAllowanceParking;
      case 'allowanceMeal':
        return editAllowanceMeal;
      case 'allowancePhone':
        return editAllowancePhone;
      default:
        return 0;
    }
  };

  const setEditAllowanceAmount = (type: AddEmployeeAllowanceKey, amount: number) => {
    switch (type) {
      case 'allowanceAccommodation':
        setEditHousingAllowance(amount);
        break;
      case 'allowanceTransport':
        setEditTransportAllowance(amount);
        break;
      case 'allowanceGeneral':
        setEditAllowanceGeneral(amount);
        break;
      case 'allowanceParking':
        setEditAllowanceParking(amount);
        break;
      case 'allowanceMeal':
        setEditAllowanceMeal(amount);
        break;
      case 'allowancePhone':
        setEditAllowancePhone(amount);
        break;
      default:
        break;
    }
  };

  const getNextEditAllowanceType = () =>
    ADD_EMPLOYEE_ALLOWANCE_OPTIONS.find(option =>
      !editVisibleAllowanceTypes.includes(option.value)
    )?.value;

  const handleAddEditAllowance = () => {
    const nextType = getNextEditAllowanceType();
    if (!nextType) {
      onShowNotification('Allowance Limit Reached', 'All allowance categories are already added.');
      return;
    }
    setEditVisibleAllowanceTypes(prev => [...prev, nextType]);
  };

  const handleRemoveEditAllowance = (type: AddEmployeeAllowanceKey) => {
    setEditAllowanceAmount(type, 0);
    setEditVisibleAllowanceTypes(prev => prev.filter(allowanceType => allowanceType !== type));
  };

  const handleChangeEditAllowanceType = (
    previousType: AddEmployeeAllowanceKey,
    nextType: AddEmployeeAllowanceKey
  ) => {
    if (previousType === nextType) return;
    const previousAmount = getEditAllowanceAmount(previousType);
    setEditAllowanceAmount(previousType, 0);
    setEditAllowanceAmount(nextType, previousAmount);
    setEditVisibleAllowanceTypes(prev => prev.map(type => type === previousType ? nextType : type));
  };

  const handleStartEditGeneralInfo = () => {
    if (!selectedEmployee) return;
    setEditName(toUppercase(selectedEmployee.name));
    setEditEmail(selectedEmployee.email || '');
    setEditDesignation(selectedEmployee.designation);
    setEditDepartment(selectedEmployee.department);
    const currentStatus = getEffectiveEmploymentStatusForDate(selectedEmployee, todayIsoDate);
    setEditStatus(currentStatus === 'On Leave' ? 'Active' : currentStatus);
    setEditBankName(toUppercase(selectedEmployee.bankName || ''));
    setEditAccountNo(toUppercase(selectedEmployee.accountNo || ''));
    setEditBasicSalary(selectedEmployee.basicSalary);
    setEditHousingAllowance(selectedEmployee.allowanceAccommodation !== undefined ? selectedEmployee.allowanceAccommodation : selectedEmployee.housingAllowance || 0);
    setEditTransportAllowance(selectedEmployee.allowanceTransport !== undefined ? selectedEmployee.allowanceTransport : selectedEmployee.transportAllowance || 0);
    setEditAllowanceGeneral(selectedEmployee.allowanceGeneral || 0);
    setEditAllowanceParking(selectedEmployee.allowanceParking || 0);
    setEditAllowanceMeal(selectedEmployee.allowanceMeal || 0);
    setEditAllowancePhone(selectedEmployee.allowancePhone || 0);
    setEditVisibleAllowanceTypes(getActiveEmployeeAllowanceTypes(selectedEmployee));
    setEditNricPassport(formatNricOrPassport(selectedEmployee.nricPassport || ''));
    setEditNationality(toUppercase(selectedEmployee.nationality || ''));
    setEditContactNumber(selectedEmployee.contactNumber || '');
    setEditContactNumberFillLater(!!selectedEmployee.contactNumberFillLater);
    setEditTaxNumber(toUppercase(selectedEmployee.taxNumber || ''));
    setEditEpfNumber(toUppercase(selectedEmployee.epfNumber || ''));
    setEditEmailFillLater(!!selectedEmployee.emailFillLater);
    const compactNric = formatNricOrPassport(selectedEmployee.nricPassport || '').replace(/-/g, '');
    setEditSocsoNumber(
      selectedEmployee.socsoNumber
        || compactNric
    );
    setIsEditSocsoNumberAutoFilled(
      !selectedEmployee.socsoNumber || selectedEmployee.socsoNumber === compactNric
    );
    setEditEmploymentType(selectedEmployee.employmentType || '');
    setEditContractStatutoryTreatment(
      selectedEmployee.contractStatutoryTreatment ||
      getPayrollDocumentProfile(selectedEmployee).contractStatutoryTreatment ||
      'without_statutory'
    );
    setEditDateOfJoined(selectedEmployee.dateOfJoined || '');
    setEditDateOfConfirmation(selectedEmployee.dateOfConfirmation || '');
    setEditConfirmationDateAuto(!selectedEmployee.dateOfConfirmation);
    setEditProbationDurationMonths(selectedEmployee.probationDurationMonths || 3);
    setEditProbationExtend(!!selectedEmployee.probationExtend);
    setEditProbationExtensionMonths(selectedEmployee.probationExtensionMonths || 1);
    setEditEpfRateEmployee(selectedEmployee.epfRateEmployee !== undefined ? selectedEmployee.epfRateEmployee : 11);
    setEditEpfRateEmployer(selectedEmployee.epfRateEmployer !== undefined ? selectedEmployee.epfRateEmployer : 13);
    setEditOptInEpf(selectedEmployee.optInEpf !== false);
    setEditOptInSocso(selectedEmployee.optInSocso !== false);
    setEditOptInEis(selectedEmployee.optInEis !== false);
    setEditOptInPcb(selectedEmployee.optInPcb !== false);
    setEditEnableLindung24(!!selectedEmployee.enableLindung24);
    setEditEmergencyContactName(toUppercase(selectedEmployee.emergencyContactName || ''));
    setEditEmergencyContactRelation(toUppercase(selectedEmployee.emergencyContactRelation || ''));
    setEditEmergencyContactPhone(toUppercase(selectedEmployee.emergencyContactPhone || ''));
    setEditEmergencyContactFillLater(!!selectedEmployee.emergencyContactFillLater);
    setEditEntityId(selectedEmployee.entityId || entities[0]?.id || '');
    setIsEditingGeneralInfo(true);
  };

  const handleSaveGeneralInfoUpdates = async () => {
    if (!selectedEmployee) return;
    const contractTreatment = isContractEmploymentType(editEmploymentType)
      ? editContractStatutoryTreatment
      : undefined;
    const updatedDocumentProfile = getPayrollDocumentProfile({
      employmentType: editEmploymentType as Employee['employmentType'],
      contractStatutoryTreatment: contractTreatment
    });
    const savedEmail = editEmailFillLater
      ? (selectedEmployee.email.includes('@ysydhrsystem.local')
        ? selectedEmployee.email
        : getPendingEmployeeEmail())
      : editEmail.trim();
    const savedDateOfConfirmation = isEditProbationStatus || isEditConfirmationStatus
      ? editDateOfConfirmation
      : '';
    const currentEffectiveStatus = getEffectiveEmploymentStatusForDate(selectedEmployee, todayIsoDate);
    const currentProfile = getEffectiveProfileForDate(selectedEmployee, todayIsoDate);
    const statusProfile: EmployeeTaxProfile = {
      ...currentProfile,
      effectiveDate: todayIsoDate,
      basicSalary: Number(editBasicSalary),
      employmentStatus: editStatus,
      housingAllowance: Number(editHousingAllowance),
      transportAllowance: Number(editTransportAllowance),
      allowanceAccommodation: Number(editHousingAllowance),
      allowanceTransport: Number(editTransportAllowance),
      allowanceGeneral: Number(editAllowanceGeneral),
      allowanceParking: Number(editAllowanceParking),
      allowanceMeal: Number(editAllowanceMeal),
      allowancePhone: Number(editAllowancePhone),
      epfRateEmployee: Number(editEpfRateEmployee),
      epfRateEmployer: Number(editEpfRateEmployer),
      eligibleForStatutory: updatedDocumentProfile.statutoryEnabled ? 'Yes' : 'No',
      contractStatutoryTreatment: contractTreatment,
      dateOfJoined: editDateOfJoined,
      dateOfTermination: isSeparationStatus(editStatus) ? todayIsoDate : undefined,
      approvedAt: getGmt8Timestamp(),
      assistReconciliationRequired: false
    };
    const effectiveDatedProfiles = [
      ...(selectedEmployee.effectiveDatedProfiles || []).filter(
        profile => profile.effectiveDate !== todayIsoDate
      ),
      statusProfile
    ].sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate));
    const updatedCareerHistory = editStatus !== currentEffectiveStatus
      ? [{
          id: `prog-${Date.now()}`,
          date: todayIsoDate,
          type: 'Status Change' as const,
          previousValue: currentEffectiveStatus,
          newValue: editStatus,
          notes: 'Status updated from employee general information.'
        }, ...(selectedEmployee.careerHistory || [])]
      : (selectedEmployee.careerHistory || []);

    const updates: Partial<Employee> = {
      name: editName,
      email: savedEmail,
      designation: editDesignation,
      department: editDepartment,
      status: editStatus,
      bankName: editBankName,
      accountNo: editAccountNo,
      basicSalary: Number(editBasicSalary),
      housingAllowance: Number(editHousingAllowance),
      allowanceAccommodation: Number(editHousingAllowance),
      transportAllowance: Number(editTransportAllowance),
      allowanceTransport: Number(editTransportAllowance),
      allowanceGeneral: Number(editAllowanceGeneral),
      allowanceParking: Number(editAllowanceParking),
      allowanceMeal: Number(editAllowanceMeal),
      allowancePhone: Number(editAllowancePhone),
      nricPassport: editNricPassport,
      nationality: editNationality,
      contactNumber: editContactNumberFillLater ? '' : editContactNumber,
      contactNumberFillLater: editContactNumberFillLater,
      taxNumber: editTaxNumber,
      epfNumber: editEpfNumber,
      socsoNumber: editSocsoNumber.replace(/-/g, ''),
      employmentType: editEmploymentType,
      eligibleForStatutory: updatedDocumentProfile.statutoryEnabled ? 'Yes' : 'No',
      contractStatutoryTreatment: contractTreatment,
      dateOfJoined: editDateOfJoined,
      dateOfConfirmation: savedDateOfConfirmation,
      probationDurationMonths: isEditProbationStatus ? Number(editProbationDurationMonths) : undefined,
      probationExtend: isEditProbationStatus ? editProbationExtend : false,
      probationExtensionMonths: isEditProbationStatus && editProbationExtend
        ? Number(editProbationExtensionMonths)
        : 0,
      epfRateEmployee: Number(editEpfRateEmployee),
      epfRateEmployer: Number(editEpfRateEmployer),
      optInEpf: updatedDocumentProfile.statutoryEnabled ? editOptInEpf : false,
      optInSocso: updatedDocumentProfile.statutoryEnabled ? editOptInSocso : false,
      optInEis: updatedDocumentProfile.statutoryEnabled ? editOptInEis : false,
      optInPcb: updatedDocumentProfile.statutoryEnabled ? editOptInPcb : false,
      enableLindung24: updatedDocumentProfile.statutoryEnabled ? editEnableLindung24 : false,
      emailFillLater: editEmailFillLater,
      emergencyContactName: editEmergencyContactFillLater ? '' : editEmergencyContactName,
      emergencyContactRelation: editEmergencyContactFillLater ? '' : editEmergencyContactRelation,
      emergencyContactPhone: editEmergencyContactFillLater ? '' : editEmergencyContactPhone,
      emergencyContactFillLater: editEmergencyContactFillLater,
      entityId: editEntityId,
      careerHistory: updatedCareerHistory,
      effectiveDatedProfiles,
      dateOfTermination: isSeparationStatus(editStatus) ? todayIsoDate : ''
    };

    setSavingAction('general');
    try {
      await onUpdateEmployee(selectedEmployee.id, updates);
      setIsEditingGeneralInfo(false);
      onShowNotification('Profile Saved', 'Employee personal and corporate profile updated successfully.');
    } catch (error) {
      console.error('[Employee Profile Save] Failed:', error);
    } finally {
      setSavingAction(null);
    }
  };

  const getScriptUrlForEntity = (entityNameOrId?: string): string | undefined => {
    if (!entityNameOrId) return undefined;
    const ent = entities.find(e => e.name === entityNameOrId || e.id === entityNameOrId);
    return ent?.googleScriptUrl && ent.googleScriptUrl.trim() !== '' 
      ? ent.googleScriptUrl.trim() 
      : undefined;
  };

  const uploadAvatarFile = async (file: File) => {
    setIsUploadingAvatar(true);
    if (!isGoogleConfigured) {
      // Offline fallback: Use local blob URL
      const localUrl = URL.createObjectURL(file);
      setFormAvatarUrl(localUrl);
      onShowNotification('Avatar Selected', 'Simulated image upload locally.');
      setIsUploadingAvatar(false);
      return;
    }

    try {
      onShowNotification('Uploading Image', 'Uploading photo to Google Drive...');
      const scriptUrl = getScriptUrlForEntity(formEntityId);
      const publicUrl = await googleSheetsClient.uploadFile(file, scriptUrl);

      setFormAvatarUrl(publicUrl);
      onShowNotification('Upload Succeeded', 'Employee photo uploaded successfully.');
    } catch (err: any) {
      console.error('[Google Drive Storage] Upload error:', err);
      onShowNotification('Upload Error', `Could not upload image: ${err.message}`);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const uploadDetailAvatarFile = async (employeeId: string, file: File) => {
    setIsUploadingAvatar(true);
    if (!isGoogleConfigured) {
      // Offline fallback: Use local blob URL
      const localUrl = URL.createObjectURL(file);
      await onUpdateEmployee(employeeId, { avatarUrl: localUrl });
      onShowNotification('Avatar Selected', 'Simulated avatar change locally.');
      setIsUploadingAvatar(false);
      return;
    }

    try {
      onShowNotification('Uploading Image', 'Uploading photo to Google Drive...');
      const emp = employees.find(empObj => empObj.id === employeeId || empObj.email?.toLowerCase() === employeeId.toLowerCase());
      const scriptUrl = getScriptUrlForEntity(emp?.entityId);
      const publicUrl = await googleSheetsClient.uploadFile(file, scriptUrl);

      await onUpdateEmployee(employeeId, { avatarUrl: publicUrl });

      // Log update to audit log table
      await googleSheetsClient.insert('audit_logs', {
        id: `log_${Date.now()}`,
        employeeId: employeeId,
        changedBy: 'admin@acme.com',
        changeType: 'AVATAR_CHANGE',
        oldValue: '',
        newValue: publicUrl,
        createdAt: getGmt8Timestamp()
      }, scriptUrl);

      onShowNotification('Upload Succeeded', 'Avatar updated successfully.');
    } catch (err: any) {
      console.error('[Google Drive Storage] Upload error:', err);
      onShowNotification('Upload Error', `Could not upload image: ${err.message}`);
    } finally {
      setIsUploadingAvatar(false);
    }
  };


  // Detail View Family editor states
  const [isEditingFamily, setIsEditingFamily] = useState(false);
  const [editMaritalStatus, setEditMaritalStatus] = useState<'Single' | 'Married' | 'Divorced' | 'Widowed'>('Single');
  const [editSpouseName, setEditSpouseName] = useState('');
  const [editSpouseNric, setEditSpouseNric] = useState('');
  const [editSpouseIsWorking, setEditSpouseIsWorking] = useState<'Yes' | 'No'>('No');
  const [editSpouseCompany, setEditSpouseCompany] = useState('');
  const [editSpousePosition, setEditSpousePosition] = useState('');
  const [editHasDependants, setEditHasDependants] = useState<'Yes' | 'No'>('No');
  const [editDependants, setEditDependants] = useState<Dependant[]>([]);
  const [editEligibleForStatutory, setEditEligibleForStatutory] = useState<'Yes' | 'No'>('Yes');
  const [editOptInEpf, setEditOptInEpf] = useState<boolean>(true);
  const [editOptInSocso, setEditOptInSocso] = useState<boolean>(true);
  const [editOptInEis, setEditOptInEis] = useState<boolean>(true);
  const [editOptInPcb, setEditOptInPcb] = useState<boolean>(true);
  const [editEnableLindung24, setEditEnableLindung24] = useState<boolean>(false);
  // Temp dependant fields for detail editor
  const [detailTempDepName, setDetailTempDepName] = useState('');
  const [detailTempDepGender, setDetailTempDepGender] = useState<'Male' | 'Female'>('Male');
  const [detailTempDepDob, setDetailTempDepDob] = useState('2018-01-01');

  const isContractEmploymentType = (employmentType: string) =>
    employmentType === 'Contract' || employmentType === 'Fixed Term Contract';

  // Progression Action states
  const [progressionType, setProgressionType] = useState<'Status Change' | 'Promotion' | 'Department Transfer' | 'Salary Revision' | 'Employment Type Change' | 'Subsidiary Transfer'>('Status Change');
  const [progressionValue, setProgressionValue] = useState('');
  const [progressionNotes, setProgressionNotes] = useState('');
  const [progressionDate, setProgressionDate] = useState(getGmt8DateString());

  // Selected Employee object (synchronized with parent state in real time)
  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId) || null;
  const selectedPayrollDocumentProfile = selectedEmployee ? getPayrollDocumentProfile(selectedEmployee) : null;
  const editingPayrollDocumentProfile = selectedEmployee
    ? getPayrollDocumentProfile({
      employmentType: editEmploymentType as Employee['employmentType'],
      contractStatutoryTreatment: isContractEmploymentType(editEmploymentType)
        ? editContractStatutoryTreatment
        : undefined
    })
    : null;
  const activeStatutoryDocumentProfile = isEditingGeneralInfo
    ? editingPayrollDocumentProfile
    : selectedPayrollDocumentProfile;
  const getAccountSummary = (employee: Employee): EmployeeAccountSummary => (
    accountSummaries[employee.id]
    || accountSummaries[employee.email.trim().toLowerCase()]
    || {
      employeeId: employee.id,
      employeeEmail: employee.email.trim().toLowerCase(),
      username: employee.email.trim().toLowerCase(),
      accountStatus: 'not_created',
      mustChangePassword: false,
    }
  );
  const selectedAccountSummary = selectedEmployee ? getAccountSummary(selectedEmployee) : null;

  const saveAccountSummary = (summary: EmployeeAccountSummary) => {
    setAccountSummaries((previous) => ({
      ...previous,
      [summary.employeeId]: summary,
      [summary.employeeEmail.trim().toLowerCase()]: summary,
    }));
  };

  useEffect(() => {
    if (!accountPreviewMode && !canManageAppAccess(currentUserEmail)) return;
    let cancelled = false;
    void getEmployeeAccountSummaries(employees)
      .then((summaries) => {
        if (cancelled) return;
        const next: Record<string, EmployeeAccountSummary> = {};
        summaries.forEach((summary) => {
          next[summary.employeeId] = summary;
          next[summary.employeeEmail.trim().toLowerCase()] = summary;
        });
        setAccountSummaries(next);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('[Employee Account Status] Could not load account metadata:', error);
        if (!accountPreviewMode) {
          onShowNotification(
            'Account Access Unavailable',
            error.message || 'Secure account status is unavailable. Start the API server or use accountPreview=1.',
            'info'
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [employees, currentUserEmail, accountPreviewMode]);

  const openAccountAction = (
    employee: Employee,
    action: EmployeeAccountAction
  ) => {
    if (!canManageAccountActions) {
      onShowNotification(
        'Master User Required',
        'Only hr.redpoint can create, share, or reset employee accounts.',
        'info'
      );
      return;
    }
    setAccountActionEmployee(employee);
    setAccountActionMode(action);
    setAccountActionChannel('email');
    setAccountActionResult(null);
    setAccountEvents([]);
    setIsAccountActionModalOpen(true);
  };

  const handleAccountActionSubmit = async () => {
    if (!accountActionEmployee) return;
    setIsAccountActionSaving(true);
    try {
      const result = await runEmployeeAccountAction(
        accountActionEmployee,
        accountActionMode,
        accountActionChannel
      );
      saveAccountSummary(result.account);
      setAccountActionResult(result);
      onShowNotification(
        result.ok ? 'Account Action Complete' : 'Delivery Needs Attention',
        result.message || 'The account action has been recorded.',
        result.ok ? 'success' : 'info'
      );
    } catch (error: any) {
      onShowNotification(
        'Account Action Failed',
        error.message || 'The employee account action could not be completed.',
        'info'
      );
    } finally {
      setIsAccountActionSaving(false);
    }
  };

  const handleLoadAccountEvents = async () => {
    if (!accountActionEmployee) return;
    setIsAccountEventsLoading(true);
    try {
      setAccountEvents(await getEmployeeAccountEvents(accountActionEmployee));
    } catch (error: any) {
      onShowNotification(
        'History Unavailable',
        error.message || 'Account delivery history could not be loaded.',
        'info'
      );
    } finally {
      setIsAccountEventsLoading(false);
    }
  };

  const copyHandoffUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      onShowNotification('Link Copied', 'The local preview handoff link was copied to your clipboard.');
    } catch {
      onShowNotification('Copy Unavailable', 'Open the handoff link directly from the preview card.', 'info');
    }
  };

  // Local staged changes for Career & Salary
  const [localSalaryAdjustments, setLocalSalaryAdjustments] = useState<any[]>([]);
  const [localCareerHistory, setLocalCareerHistory] = useState<any[]>([]);
  const [localDesignation, setLocalDesignation] = useState('');
  const [localDepartment, setLocalDepartment] = useState('');
  const [localStatus, setLocalStatus] = useState<Employee['status']>('Active');
  const [localEmploymentType, setLocalEmploymentType] = useState<Employee['employmentType']>('Confirmation');
  const [localBasicSalary, setLocalBasicSalary] = useState(0);
  const [localEntityId, setLocalEntityId] = useState('');
  const [localEffectiveDatedProfiles, setLocalEffectiveDatedProfiles] = useState<EmployeeTaxProfile[]>([]);

  const formPayrollDocumentProfile = getPayrollDocumentProfile({
    employmentType: formEmploymentType,
    contractStatutoryTreatment: isContractEmploymentType(formEmploymentType)
      ? formContractStatutoryTreatment
      : undefined
  });

  const isFormProbationStatus =
    formStatus === 'Active - Probation' || formEmploymentType === 'Probation';
  const isFormConfirmationStatus =
    formStatus === 'Active - Confirmation' || formEmploymentType === 'Confirmation';
  const isEditProbationStatus =
    editStatus === 'Active - Probation' || editEmploymentType === 'Probation';
  const isEditConfirmationStatus =
    editStatus === 'Active - Confirmation' || editEmploymentType === 'Confirmation';

  useEffect(() => {
    if (!isFormProbationStatus || !formConfirmationDateAuto) return;
    setFormDateOfConfirmation(
      getConfirmationDate(
        formDateOfJoined,
        Number(formProbationDurationMonths),
        formProbationExtend ? Number(formProbationExtensionMonths) : 0
      )
    );
  }, [
    formDateOfJoined,
    formProbationDurationMonths,
    formProbationExtend,
    formProbationExtensionMonths,
    formConfirmationDateAuto,
    isFormProbationStatus
  ]);

  useEffect(() => {
    if (!isEditProbationStatus || !editConfirmationDateAuto) return;
    setEditDateOfConfirmation(
      getConfirmationDate(
        editDateOfJoined,
        Number(editProbationDurationMonths),
        editProbationExtend ? Number(editProbationExtensionMonths) : 0
      )
    );
  }, [
    editDateOfJoined,
    editProbationDurationMonths,
    editProbationExtend,
    editProbationExtensionMonths,
    editConfirmationDateAuto,
    isEditProbationStatus
  ]);

  // Sync with selectedEmployee changes
  useEffect(() => {
    if (selectedEmployee) {
      setLocalSalaryAdjustments(selectedEmployee.salaryAdjustments || []);
      setLocalCareerHistory(selectedEmployee.careerHistory || []);
      setLocalDesignation(selectedEmployee.designation);
      setLocalDepartment(selectedEmployee.department);
      setLocalStatus(
        getEffectiveEmploymentStatusForDate(selectedEmployee, todayIsoDate)
      );
      setLocalEmploymentType(selectedEmployee.employmentType);
      setLocalBasicSalary(selectedEmployee.basicSalary);
      setLocalEntityId(selectedEmployee.entityId);
      setLocalEffectiveDatedProfiles(selectedEmployee.effectiveDatedProfiles || []);
    }
  }, [selectedEmployeeId, selectedEmployee]);

  const upsertEffectiveProfile = (
    profiles: EmployeeTaxProfile[],
    profile: EmployeeTaxProfile
  ) => [
    ...profiles.filter(existing => existing.effectiveDate !== profile.effectiveDate),
    profile
  ].sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate));

  const handleSaveCareerChanges = async () => {
    if (!selectedEmployee) return;
    const stagedEmployee: Employee = {
      ...selectedEmployee,
      careerHistory: localCareerHistory,
      effectiveDatedProfiles: localEffectiveDatedProfiles
    };
    const currentStatus = getEffectiveEmploymentStatusForDate(stagedEmployee, todayIsoDate);
    setLocalStatus(currentStatus);
    setSavingAction('career');
    try {
      await onUpdateEmployee(selectedEmployee.id, {
        designation: localDesignation,
        department: localDepartment,
        status: currentStatus,
        employmentType: localEmploymentType,
        basicSalary: localBasicSalary,
        entityId: localEntityId,
        salaryAdjustments: localSalaryAdjustments,
        careerHistory: localCareerHistory,
        effectiveDatedProfiles: localEffectiveDatedProfiles,
        dateOfTermination: getEffectiveTerminationDateForDate(stagedEmployee, todayIsoDate) || ''
      });
      onShowNotification(
        'Database Synced',
        `Staged career and salary adjustments for ${selectedEmployee.name} were saved.`
      );
    } catch (error) {
      console.error('[Career Save] Failed:', error);
    } finally {
      setSavingAction(null);
    }
  };

  // Filter list
  const filteredEmployees = employees.filter(emp => {
    const matchesDept = deptFilter === 'All Departments' || emp.department === deptFilter;
    const displayedStatus = getEffectiveEmploymentStatusForDate(emp, todayIsoDate);
    const matchesStatus =
      statusFilter === 'All Statuses' ||
      (statusFilter === 'Active'
        ? displayedStatus === 'Active' ||
          displayedStatus === 'Active - Probation' ||
          displayedStatus === 'Active - Confirmation'
        : displayedStatus === statusFilter);
    const matchesEntity = entityFilter === 'All Subsidiaries' || emp.entityId === entityFilter;
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          emp.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          emp.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDept && matchesStatus && matchesEntity && matchesSearch;
  });
  const selectedEmployeeStatus = selectedEmployee
    ? getEffectiveEmploymentStatusForDate(selectedEmployee, todayIsoDate)
    : null;

  const handleOpenAddModal = () => {
    setFormEntityId(activeEntityId || entities[0]?.id || '');
    setFormName('');
    setFormEmail('');
    setFormDesignation(availableRoles[0] || 'Software Engineer');
    setFormDepartment(availableDepartments[0] || 'Product & Engineering');
    setFormStatus('Active');
    setFormBank('MAYBANK BERHAD');
    setFormAccount('');
    setFormSalary(5000);
    setFormAllowances([]);
    setFormCreateAccount(canManageAccountActions);
    setFormNricPassport('');
    setFormNationality('MALAYSIAN');
    setFormContactNumber('');
    setFormContactNumberFillLater(false);
    setFormTaxNumber('');
    setFormEpfNumber('');
    setFormSocsoNumber('');
    setFormEmailFillLater(false);
    setFormEmploymentType('Permanent');
    setFormContractStatutoryTreatment('without_statutory');
    setFormEligibleForStatutory('Yes');
    setFormMaritalStatus('Single');
    setFormEmergencyContactName('');
    setFormEmergencyContactRelation('');
    setFormEmergencyContactPhone('');
    setFormEmergencyContactFillLater(false);
    setFormDateOfJoined(getGmt8DateString());
    setFormDateOfConfirmation('');
    setFormConfirmationDateAuto(true);
    setFormProbationDurationMonths(3);
    setFormProbationExtend(false);
    setFormProbationExtensionMonths(1);

    // Reset spouse/dependant form states
    setFormSpouseName('');
    setFormSpouseNric('');
    setFormSpouseIsWorking('No');
    setFormSpouseCompany('');
    setFormSpousePosition('');
    setFormHasDependants('No');
    setFormDependants([]);
    setTempDepName('');
    setTempDepGender('Male');
    setTempDepDob('2018-01-01');

    setIsAddModalOpen(true);
  };

  const handleAddFormDependant = () => {
    if (!tempDepName.trim()) {
      onShowNotification('Dependant Error', 'Please specify dependant name.');
      return;
    }
    if (formDependants.length >= 10) {
      onShowNotification('Limit Reached', 'Maximum of 10 dependants is allowed.');
      return;
    }
    setFormDependants(prev => [...prev, {
      name: toUppercase(tempDepName),
      gender: tempDepGender,
      dob: tempDepDob
    }]);
    setFormHasDependants('Yes');
    setTempDepName('');
  };

  const handleRemoveFormDependant = (index: number) => {
    setFormDependants(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddFormAllowance = () => {
    const nextType = getNextAllowanceType(formAllowances);
    if (!nextType) {
      onShowNotification('Allowance Limit Reached', 'All allowance categories are already added.');
      return;
    }
    setFormAllowances(prev => [
      ...prev,
      { id: `allowance-${Date.now()}-${Math.floor(Math.random() * 1000)}`, type: nextType, amount: 0 }
    ]);
  };

  const handleUpdateFormAllowance = (
    id: string,
    updates: Partial<Omit<EmployeeAllowanceDraft, 'id'>>
  ) => {
    setFormAllowances(prev => prev.map(allowance =>
      allowance.id === id ? { ...allowance, ...updates } : allowance
    ));
  };

  const handleRemoveFormAllowance = (id: string) => {
    setFormAllowances(prev => prev.filter(allowance => allowance.id !== id));
  };

  // Helper functions for Detail Dependants
  const handleAddDetailDependant = () => {
    if (!detailTempDepName.trim()) {
      onShowNotification('Dependant Error', 'Please specify dependant name.');
      return;
    }
    if (editDependants.length >= 10) {
      onShowNotification('Limit Reached', 'Maximum of 10 dependants is allowed.');
      return;
    }
    setEditDependants(prev => [...prev, {
      id: `dep-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      name: toUppercase(detailTempDepName),
      gender: detailTempDepGender,
      dob: detailTempDepDob
    }]);
    setEditHasDependants('Yes');
    setDetailTempDepName('');
  };

  const handleRemoveDetailDependant = (id: string) => {
    setEditDependants(prev => prev.filter(dep => dep.id !== id));
  };

  const handleStartEditFamily = () => {
    if (!selectedEmployee) return;
    setEditMaritalStatus(selectedEmployee.maritalStatus);
    setEditSpouseName(toUppercase(selectedEmployee.spouseName || ''));
    setEditSpouseNric(toUppercase(selectedEmployee.spouseNric || ''));
    setEditSpouseIsWorking(selectedEmployee.spouseIsWorking || 'No');
    setEditSpouseCompany(toUppercase(selectedEmployee.spouseCompany || ''));
    setEditSpousePosition(toUppercase(selectedEmployee.spousePosition || ''));
    setEditHasDependants(selectedEmployee.hasDependants || 'No');
    let initialDependants = selectedEmployee.dependants || [];
    if (typeof initialDependants === 'string' && initialDependants) {
      try {
        initialDependants = JSON.parse(initialDependants);
      } catch (err) {
        initialDependants = [];
      }
    }
    if (!Array.isArray(initialDependants)) {
      initialDependants = [];
    }
    setEditDependants(initialDependants.map((dependant) => ({
      ...dependant,
      name: toUppercase(dependant.name || '')
    })));
    setIsEditingFamily(true);
  };

  const handleSaveFamilyUpdates = async () => {
    if (!selectedEmployee) return;

    let finalDependants = [...editDependants];
    let finalHasDependants = editHasDependants;

    if (detailTempDepName.trim()) {
      finalDependants.push({
        id: `dep-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        name: toUppercase(detailTempDepName),
        gender: detailTempDepGender,
        dob: detailTempDepDob
      });
      finalHasDependants = 'Yes';
      setDetailTempDepName('');
    }
    finalDependants = finalDependants.map((dependant) => ({
      ...dependant,
      name: toUppercase(dependant.name || '')
    }));
    
    const updates: Partial<Employee> = {
      maritalStatus: editMaritalStatus,
      eligibleForStatutory: editEligibleForStatutory,
      hasDependants: finalHasDependants,
      dependants: finalHasDependants === 'Yes' ? finalDependants : []
    };

    if (editMaritalStatus === 'Married') {
      updates.spouseName = editSpouseName;
      updates.spouseNric = editSpouseNric;
      updates.spouseIsWorking = editSpouseIsWorking;
      if (editSpouseIsWorking === 'Yes') {
        updates.spouseCompany = editSpouseCompany;
        updates.spousePosition = editSpousePosition;
      } else {
        updates.spouseCompany = '';
        updates.spousePosition = '';
      }
    } else {
      // Single, Divorced, Widowed
      updates.spouseName = '';
      updates.spouseNric = '';
      updates.spouseIsWorking = 'No';
      updates.spouseCompany = '';
      updates.spousePosition = '';
    }

    setSavingAction('family');
    try {
      await onUpdateEmployee(selectedEmployee.id, updates);
      setIsEditingFamily(false);
      onShowNotification('Profile Updated', 'Family and compliance registry updated successfully.');
    } catch (error) {
      console.error('[Family Save] Failed:', error);
    } finally {
      setSavingAction(null);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formName ||
      (!formEmailFillLater && !formEmail) ||
      !formDesignation ||
      !formBank.trim() ||
      !formAccount ||
      !formNricPassport
    ) {
      onShowNotification('Form Error', 'Please fill in all required name, banking, and NRIC/Passport fields.');
      return;
    }

    let finalFormDependants = [...formDependants];
    let finalFormHasDependants = formHasDependants;

    if (tempDepName.trim()) {
      finalFormDependants.push({
        name: toUppercase(tempDepName),
        gender: tempDepGender,
        dob: tempDepDob
      });
      finalFormHasDependants = 'Yes';
      setTempDepName('');
    }

    const spouseAndDependantFields: Partial<Employee> = {
      hasDependants: finalFormHasDependants,
      dependants: finalFormHasDependants === 'Yes' 
        ? finalFormDependants.map((dep, idx) => ({
            ...dep,
            id: `dep-${Date.now()}-${idx}`
          }))
        : []
    };
    if (formMaritalStatus === 'Married') {
      spouseAndDependantFields.spouseName = toUppercase(formSpouseName);
      spouseAndDependantFields.spouseNric = toUppercase(formSpouseNric);
      spouseAndDependantFields.spouseIsWorking = formSpouseIsWorking;
      if (formSpouseIsWorking === 'Yes') {
        spouseAndDependantFields.spouseCompany = toUppercase(formSpouseCompany);
        spouseAndDependantFields.spousePosition = toUppercase(formSpousePosition);
      } else {
        spouseAndDependantFields.spouseCompany = '';
        spouseAndDependantFields.spousePosition = '';
      }
    } else {
      // Single, Divorced, Widowed
      spouseAndDependantFields.spouseName = '';
      spouseAndDependantFields.spouseNric = '';
      spouseAndDependantFields.spouseIsWorking = 'No';
      spouseAndDependantFields.spouseCompany = '';
      spouseAndDependantFields.spousePosition = '';
    }

    const newEmployeeDocumentProfile = getPayrollDocumentProfile({
      employmentType: formEmploymentType,
      contractStatutoryTreatment: isContractEmploymentType(formEmploymentType)
        ? formContractStatutoryTreatment
        : undefined
    });
    const allowanceGeneral = getAllowanceAmount(formAllowances, 'allowanceGeneral');
    const allowanceTransport = getAllowanceAmount(formAllowances, 'allowanceTransport');
    const allowanceParking = getAllowanceAmount(formAllowances, 'allowanceParking');
    const allowanceMeal = getAllowanceAmount(formAllowances, 'allowanceMeal');
    const allowanceAccommodation = getAllowanceAmount(formAllowances, 'allowanceAccommodation');
    const allowancePhone = getAllowanceAmount(formAllowances, 'allowancePhone');
    const savedEmail = formEmailFillLater ? getPendingEmployeeEmail() : formEmail.trim();
    const savedDateOfConfirmation = isFormProbationStatus || isFormConfirmationStatus
      ? formDateOfConfirmation
      : '';

    const newEmp: Employee = {
      id: savedEmail,
      entityId: formEntityId || activeEntityId || entities[0]?.id || '',
      name: toUppercase(formName),
      email: savedEmail,
      designation: formDesignation,
      department: formDepartment,
      status: formStatus,
      bankName: toUppercase(formBank),
      accountNo: toUppercase(formAccount),
      basicSalary: Number(formSalary),
      housingAllowance: allowanceAccommodation,
      transportAllowance: allowanceTransport,
      allowanceGeneral,
      allowanceTransport,
      allowanceParking,
      allowanceMeal,
      allowanceAccommodation,
      allowancePhone,
      overtime: 0,
      performanceBonus: 0,
      epfRateEmployee: 11,
      epfRateEmployer: 13,
      socsoEmployee: 19.75,
      socsoEmployer: 84.50,
      skbbkEmployee: 4.90,
      skbbkEmployer: 17.15,
      eisEmployee: 7.90,
      eisEmployer: 7.90,
      taxPcb: 0,
      unpaidLeave: 0,
      hrdCorp: 0,
      avatarUrl: formAvatarUrl || '',
      
      // New fields mapping
      nricPassport: formatNricOrPassport(formNricPassport),
      nationality: toUppercase(formNationality),
      contactNumber: formContactNumberFillLater ? '' : formContactNumber,
      contactNumberFillLater: formContactNumberFillLater,
      taxNumber: toUppercase(formTaxNumber || `TX-${Math.floor(100000000 + Math.random() * 900000000)}`),
      epfNumber: toUppercase(formEpfNumber || `EP-${Math.floor(100000000 + Math.random() * 900000000)}`),
      socsoNumber: formSocsoNumber.replace(/-/g, '') || formatNricOrPassport(formNricPassport).replace(/-/g, ''),
      emailFillLater: formEmailFillLater,
      employmentType: formEmploymentType,
      maritalStatus: formMaritalStatus,
      eligibleForStatutory: newEmployeeDocumentProfile.statutoryEnabled ? 'Yes' : 'No',
      contractStatutoryTreatment: isContractEmploymentType(formEmploymentType) ? formContractStatutoryTreatment : undefined,
      optInEpf: newEmployeeDocumentProfile.statutoryEnabled ? formOptInEpf : false,
      optInSocso: newEmployeeDocumentProfile.statutoryEnabled ? formOptInSocso : false,
      optInEis: newEmployeeDocumentProfile.statutoryEnabled ? formOptInEis : false,
      optInPcb: newEmployeeDocumentProfile.statutoryEnabled ? formOptInPcb : false,
      enableLindung24: newEmployeeDocumentProfile.statutoryEnabled ? formEnableLindung24 : false,
      emergencyContactName: formEmergencyContactFillLater ? '' : toUppercase(formEmergencyContactName),
      emergencyContactRelation: formEmergencyContactFillLater ? '' : toUppercase(formEmergencyContactRelation),
      emergencyContactPhone: formEmergencyContactFillLater ? '' : toUppercase(formEmergencyContactPhone),
      emergencyContactFillLater: formEmergencyContactFillLater,
      dateOfJoined: formDateOfJoined,
      dateOfConfirmation: savedDateOfConfirmation,
      probationDurationMonths: isFormProbationStatus ? Number(formProbationDurationMonths) : undefined,
      probationExtend: isFormProbationStatus ? formProbationExtend : false,
      probationExtensionMonths: isFormProbationStatus && formProbationExtend
        ? Number(formProbationExtensionMonths)
        : 0,
      
      ...spouseAndDependantFields,
      
      // Initial career history entry
      careerHistory: [
        {
          id: `h-${Date.now()}`,
          date: formDateOfJoined,
          type: 'Hired',
          previousValue: '-',
          newValue: `${formDesignation} (${formEmploymentType})`,
          notes: 'Employee successfully registered and allocated staff records.'
        }
      ]
    };

      setIsSavingForm(true);
      try {
        await onAddEmployee(newEmp);
        setIsAddModalOpen(false);
        onShowNotification(
          'Employee Registered',
          `${formName} has been onboarded into Workforce records.`
        );
        if (formCreateAccount && canManageAccountActions && !formEmailFillLater) {
          try {
            const accountResult = await runEmployeeAccountAction(newEmp, 'provision', 'email');
            saveAccountSummary(accountResult.account);
            onShowNotification(
              accountResult.ok ? 'Account Setup Sent' : 'Employee Saved',
              accountResult.ok
                ? `A one-time account setup link was prepared for ${newEmp.email}.`
                : `${newEmp.name} was saved, but account delivery needs attention.`,
              accountResult.ok ? 'success' : 'info'
            );
          } catch (accountError: any) {
            onShowNotification(
              'Employee Saved',
              `${newEmp.name} was saved, but the employee account could not be provisioned: ${accountError.message || accountError}`,
              'info'
            );
          }
        }
      } catch (err: any) {
        onShowNotification('Save Error', `Failed to register employee: ${err.message || err}`);
      } finally {
        setIsSavingForm(false);
      }
   };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to terminate/remove ${name} from active payroll directory?`)) {
      setSavingAction(`delete:${id}`);
      try {
        await onDeleteEmployee(id);
        onShowNotification('Employee Deleted', `${name} removed successfully.`);
        if (selectedEmployeeId === id) {
          setIsDetailOpen(false);
        }
      } catch (error) {
        console.error('[Employee Delete] Failed:', error);
      } finally {
        setSavingAction(null);
      }
    }
  };

  // Execute Career Progression Event update
  const handleProgressionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    if (!progressionValue.trim()) {
      onShowNotification('Progression Error', 'Please specify the new progression value.');
      return;
    }

    let previousVal = '';
    let newVal = progressionValue;
    let nextEffectiveDatedProfiles = localEffectiveDatedProfiles;

    switch (progressionType) {
      case 'Status Change':
        if (!EMPLOYEE_STATUS_OPTIONS.some(status => status === progressionValue)) {
          onShowNotification('Progression Error', 'Please choose a supported employee status.');
          return;
        }

        const nextStatus = progressionValue as Employee['status'];
        const stagedBeforeStatusChange: Employee = {
          ...selectedEmployee,
          careerHistory: localCareerHistory,
          effectiveDatedProfiles: localEffectiveDatedProfiles
        };
        previousVal = getEffectiveEmploymentStatusForDate(
          stagedBeforeStatusChange,
          progressionDate
        );

        const profileAtEffectiveDate = getEffectiveProfileForDate(
          stagedBeforeStatusChange,
          progressionDate
        );
        const statusProfile: EmployeeTaxProfile = {
          ...profileAtEffectiveDate,
          effectiveDate: progressionDate,
          employmentStatus: nextStatus,
          dateOfTermination: isSeparationStatus(nextStatus) ? progressionDate : undefined,
          approvedAt: getGmt8Timestamp(),
          assistReconciliationRequired: false
        };
        const updatedEffectiveDatedProfiles = upsertEffectiveProfile(
          localEffectiveDatedProfiles,
          statusProfile
        );
        nextEffectiveDatedProfiles = updatedEffectiveDatedProfiles;
        setLocalEffectiveDatedProfiles(updatedEffectiveDatedProfiles);
        break;
      case 'Promotion':
        previousVal = localDesignation;
        setLocalDesignation(progressionValue);
        break;
      case 'Department Transfer':
        previousVal = localDepartment;
        setLocalDepartment(progressionValue);
        break;
      case 'Employment Type Change':
        previousVal = localEmploymentType;
        setLocalEmploymentType(progressionValue as any);
        break;
      case 'Salary Revision':
        previousVal = `RM ${localBasicSalary.toLocaleString()}`;
        const numericSalary = Number(progressionValue);
        if (isNaN(numericSalary) || numericSalary <= 0) {
          onShowNotification('Validation Error', 'Please enter a valid numeric salary.');
          return;
        }
        setLocalBasicSalary(numericSalary);
        newVal = `RM ${numericSalary.toLocaleString()}`;
        break;
      case 'Subsidiary Transfer':
        previousVal = entities.find(e => e.id === localEntityId)?.name || localEntityId;
        setLocalEntityId(progressionValue);
        newVal = entities.find(e => e.id === progressionValue)?.name || progressionValue;
        break;
    }

    const newHistoryEntry: CareerHistoryEntry = {
      id: `prog-${Date.now()}`,
      date: progressionDate,
      type: progressionType,
      previousValue: previousVal,
      newValue: newVal,
      notes: progressionNotes || 'No notes provided by Administrator.'
    };

    const updatedCareerHistory = [newHistoryEntry, ...localCareerHistory];
    setLocalCareerHistory(updatedCareerHistory);
    if (progressionType === 'Status Change') {
      const stagedEmployeeAfterHistory: Employee = {
        ...selectedEmployee,
        careerHistory: updatedCareerHistory,
        effectiveDatedProfiles: nextEffectiveDatedProfiles
      };
      setLocalStatus(
        getEffectiveEmploymentStatusForDate(stagedEmployeeAfterHistory, todayIsoDate)
      );
    }
    onShowNotification(
      'Progression Staged',
      `Progression event staged successfully. Remember to click the Save button at the bottom to write changes to database.`
    );

    // Clear progression sub-form inputs
    setProgressionValue('');
    setProgressionNotes('');
  };

  const previewEmployee = activeEmployees.find(e => e.id === previewEmployeeId) || activeEmployees[0];

  if (viewMode === 'self-service' && previewEmployee) {
    const activeSub = entities.find(e => e.id === previewEmployee.entityId) || entities[0];
    const payslipBreakdown = calculatePayslip(previewEmployee, currentMonth, currentYear);
    
    const isEligible = 
      previewEmployee.employmentType === 'Probationary' || 
      previewEmployee.employmentType === 'Confirmation' || 
      (previewEmployee.employmentType === 'Independent Contractor / Freelance' && previewEmployee.eligibleForStatutory === 'Yes');

    const isLindung24Enabled = previewEmployee.enableLindung24 === true;
    const skbbkEmployeeVal = previewEmployee.skbbkEmployee !== undefined ? previewEmployee.skbbkEmployee : (isEligible && isLindung24Enabled ? parseFloat(((previewEmployee.socsoEmployee || 0) * 0.25).toFixed(2)) : 0);
    const skbbkEmployerVal = previewEmployee.skbbkEmployer !== undefined ? previewEmployee.skbbkEmployer : (isEligible && isLindung24Enabled ? parseFloat(((previewEmployee.socsoEmployer || 0) * 0.25).toFixed(2)) : 0);

    const handleSimulateUpdate = async (e: React.FormEvent) => {
      e.preventDefault();
      setSavingAction('self-service');
      try {
        await onUpdateEmployee(previewEmployee.id, {
          contactNumber: selfServiceContactNumber,
          emergencyContactName: selfServiceEmergencyName,
          emergencyContactRelation: selfServiceEmergencyRelation,
          emergencyContactPhone: selfServiceEmergencyPhone
        });
        setIsSelfServiceEditingProfile(false);
        onShowNotification(
          'Profile Saved',
          `Contact and emergency records for ${previewEmployee.name} updated successfully in the primary directory.`
        );
      } catch (error) {
        console.error('[Self-service Profile Save] Failed:', error);
      } finally {
        setSavingAction(null);
      }
    };

    return (
      <div className="space-y-8 max-w-6xl mx-auto animate-in fade-in duration-200">
        
        {/* Toggle and Dropdown Select header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-left">
          <div>
            <h1 className="text-3xl font-bold text-on-background tracking-tight">Workforce Directory</h1>
            <p className="text-on-surface-variant mt-1">Preview the portal experience and check statutory records from the employee's perspective.</p>
          </div>
          
          {/* Toggle buttons */}
          <div className="flex bg-surface-container border border-neutral-border rounded-lg p-1 shrink-0">
            <button
              onClick={() => setViewMode('admin')}
              className="px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all cursor-pointer text-on-surface hover:bg-surface-container-high"
            >
              <Building2 className="w-4 h-4" /> HR Administration
            </button>
            <button
              onClick={() => setViewMode('self-service')}
              className="px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all cursor-pointer bg-primary text-[#f7f0e0] shadow-sm"
            >
              <UserCheck className="w-4 h-4" /> Self-Service Preview
            </button>
          </div>
        </div>

        {/* Warning Alert Banner */}
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-left">
          <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
          <div className="text-xs text-amber-800">
            <span className="font-bold uppercase tracking-wider block mb-1">Interactive HR Simulation Mode Active</span>
            <p>You are previewing exactly what <strong>{previewEmployee.name}</strong> sees when logging in to their personal account. Use the selector below to switch between employees to audit and preview their statutory registries, career progression, and historical payslips.</p>
          </div>
        </div>

        {/* Employee Switcher Control Bar */}
        <div className="bg-white border border-neutral-border p-4 rounded-lg shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider shrink-0">Preview Employee Perspective:</span>
            <select
              value={previewEmployeeId}
              onChange={(e) => {
                const id = e.target.value;
                setPreviewEmployeeId(id);
                const emp = activeEmployees.find(x => x.id === id);
                if (emp) {
                  setSelfServiceContactNumber(emp.contactNumber || '');
                  setSelfServiceEmergencyName(emp.emergencyContactName || '');
                  setSelfServiceEmergencyRelation(emp.emergencyContactRelation || '');
                  setSelfServiceEmergencyPhone(emp.emergencyContactPhone || '');
                  setIsSelfServiceEditingProfile(false);
                }
              }}
              className="bg-surface-container border border-neutral-border text-xs font-bold text-primary rounded-md px-3 py-1.5 focus:ring-1 focus:ring-primary outline-none cursor-pointer"
            >
              {activeEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.id} · {emp.designation})
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-2.5 bg-primary/5 border border-primary/20 px-3 py-1.5 rounded-md text-[11px] text-primary font-semibold">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span>Active Subsidiary: <strong>{activeSub.name}</strong></span>
          </div>
        </div>

        {/* Main Portal Dashboard layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: My Profile Hub (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Elegant Profile Header Header */}
            <div className="bg-white border border-neutral-border rounded-lg shadow-xs overflow-hidden text-left">
              <div className="h-24 bg-gradient-to-r from-primary/80 to-primary/95 relative flex items-end p-6">
                <div className="absolute top-4 right-4 bg-white/20 text-[#f7f0e0] border border-white/25 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Secure Account
                </div>
              </div>
              
              <div className="px-6 pb-6 relative">
                {/* Avatar overlapping border */}
                <div className="relative -mt-12 mb-4 w-20 h-20 rounded-full border-4 border-white overflow-hidden shadow-md bg-white">
                  <EmployeeAvatar employee={previewEmployee} className="w-full h-full" />
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-on-surface tracking-tight">{previewEmployee.name}</h2>
                    <p className="text-xs text-on-surface-variant font-medium mt-0.5">{previewEmployee.designation} · {previewEmployee.department}</p>
                  </div>
                  <span className="bg-green-100 text-green-700 border border-green-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-600 rounded-full" />
                    Portal Online
                  </span>
                </div>
              </div>
            </div>

            {/* Profile Tabbed Details Card */}
            <div className="bg-white border border-neutral-border rounded-lg shadow-xs overflow-hidden text-left">
              
              {/* Profile Card Tabs Header */}
              <div className="bg-surface-container-low border-b border-neutral-border flex overflow-x-auto">
                <button
                  onClick={() => setSelfServiceActiveTab('personal')}
                  className={`px-4 py-3 border-b-2 text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    selfServiceActiveTab === 'personal'
                      ? 'border-primary text-primary bg-white'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Personal Details
                </button>
                <button
                  onClick={() => setSelfServiceActiveTab('family')}
                  className={`px-4 py-3 border-b-2 text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    selfServiceActiveTab === 'family'
                      ? 'border-primary text-primary bg-white'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Spouse & Dependants
                </button>
                <button
                  onClick={() => setSelfServiceActiveTab('financial')}
                  className={`px-4 py-3 border-b-2 text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    selfServiceActiveTab === 'financial'
                      ? 'border-primary text-primary bg-white'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Statutory & Banking
                </button>
                <button
                  onClick={() => setSelfServiceActiveTab('history')}
                  className={`px-4 py-3 border-b-2 text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    selfServiceActiveTab === 'history'
                      ? 'border-primary text-primary bg-white'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Career Timeline
                </button>
                <button
                  onClick={() => setSelfServiceActiveTab('adjustments')}
                  className={`px-4 py-3 border-b-2 text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    selfServiceActiveTab === 'adjustments'
                      ? 'border-primary text-primary bg-white'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Salary Adjustments
                </button>
              </div>

              {/* Tab Contents */}
              <div className="p-6">
                
                {/* TAB: Personal Details */}
                {selfServiceActiveTab === 'personal' && (
                  <div className="space-y-6 animate-in fade-in duration-150">
                    <div className="flex justify-between items-center border-b border-neutral-border pb-2.5">
                      <h3 className="text-sm font-bold text-primary">Personal Particulars</h3>
                      {!isSelfServiceEditingProfile ? (
                        <button
                          onClick={() => {
                            setSelfServiceContactNumber(previewEmployee.contactNumber || '');
                            setSelfServiceEmergencyName(previewEmployee.emergencyContactName || '');
                            setSelfServiceEmergencyRelation(previewEmployee.emergencyContactRelation || '');
                            setSelfServiceEmergencyPhone(previewEmployee.emergencyContactPhone || '');
                            setIsSelfServiceEditingProfile(true);
                          }}
                          className="text-xs font-semibold text-primary hover:bg-primary/5 px-2.5 py-1 border border-primary/20 rounded cursor-pointer"
                        >
                          Request Profile Edit
                        </button>
                      ) : (
                        <button
                          onClick={() => setIsSelfServiceEditingProfile(false)}
                          className="text-xs font-semibold text-on-surface-variant hover:bg-surface-container px-2.5 py-1 border border-neutral-border rounded cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    {!isSelfServiceEditingProfile ? (
                      /* VIEW PERSONAL DETAILS */
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div className="p-3 bg-surface-container-low border border-neutral-border/50 rounded">
                            <span className="text-outline text-[10px] uppercase font-bold block mb-1">NRIC / Passport Number</span>
                            <span className="font-mono font-bold text-on-surface">{previewEmployee.nricPassport || 'N/A'}</span>
                          </div>
                          <div className="p-3 bg-surface-container-low border border-neutral-border/50 rounded">
                            <span className="text-outline text-[10px] uppercase font-bold block mb-1">Nationality</span>
                            <span className="font-semibold text-on-surface">{previewEmployee.nationality || 'Malaysian'}</span>
                          </div>
                          <div className="p-3 bg-surface-container-low border border-neutral-border/50 rounded">
                            <span className="text-outline text-[10px] uppercase font-bold block mb-1">Date Joined</span>
                            <span className="font-mono font-semibold text-on-surface">{formatToDDMMMYYYY(previewEmployee.dateOfJoined)}</span>
                          </div>
                          <div className="p-3 bg-surface-container-low border border-neutral-border/50 rounded">
                            <span className="text-outline text-[10px] uppercase font-bold block mb-1">Employment Category</span>
                            <span className="font-bold text-primary uppercase">{previewEmployee.employmentType || 'Confirmation'}</span>
                          </div>
                        </div>

                        <div className="p-4 border border-neutral-border rounded-lg bg-zinc-50/50 space-y-3">
                          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Verified Contact Information</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                            <div>
                              <span className="text-outline text-[9px] uppercase font-bold block mb-0.5">Corporate Email</span>
                              <span className="font-semibold text-on-surface-variant flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-outline" /> {previewEmployee.email}
                              </span>
                            </div>
                            <div>
                              <span className="text-outline text-[9px] uppercase font-bold block mb-0.5">Personal Contact Phone</span>
                              <span className="font-mono font-bold text-primary flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-primary" /> {previewEmployee.contactNumber || 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 border border-neutral-border rounded-lg bg-zinc-50/50 space-y-3">
                          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Emergency Contact</span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div>
                              <span className="text-outline text-[9px] uppercase font-bold block">Contact Person</span>
                              <span className="font-bold text-on-surface">{previewEmployee.emergencyContactName || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-outline text-[9px] uppercase font-bold block">Relationship</span>
                              <span className="font-semibold text-on-surface-variant">{previewEmployee.emergencyContactRelation || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-outline text-[9px] uppercase font-bold block">Emergency Phone</span>
                              <span className="font-mono font-bold text-primary">{previewEmployee.emergencyContactPhone || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* EDIT PERSONAL DETAILS */
                      <form onSubmit={handleSimulateUpdate} className="space-y-4 text-left">
                        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg text-xs text-primary mb-4">
                          <span className="font-bold block mb-1">Interactive Self-Service Form Simulation</span>
                          <p className="text-[11px] leading-normal text-on-surface-variant">Editing fields below and clicking Save simulates how an employee submits updates to their profile. These updates write back directly to the primary Workforce Directory registry.</p>
                        </div>

                        <div className="space-y-3 text-xs">
                          <div>
                            <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Personal Contact Phone *</label>
                            <input
                              type="text"
                              required
                              value={selfServiceContactNumber}
                              onChange={(e) => setSelfServiceContactNumber(e.target.value)}
                              className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                            />
                          </div>

                          <div className="border-t border-neutral-border pt-3 mt-3">
                            <span className="text-[10px] font-bold text-primary uppercase block mb-2">Simulate Emergency Contact Updates</span>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Emergency Contact Person</label>
                                <input
                                  type="text"
                                  required
                                  value={selfServiceEmergencyName}
                                  onChange={(e) => setSelfServiceEmergencyName(e.target.value)}
                                  className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Relationship</label>
                                <input
                                  type="text"
                                  required
                                  value={selfServiceEmergencyRelation}
                                  onChange={(e) => setSelfServiceEmergencyRelation(e.target.value)}
                                  className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Emergency Phone</label>
                                <input
                                  type="text"
                                  required
                                  value={selfServiceEmergencyPhone}
                                  onChange={(e) => setSelfServiceEmergencyPhone(e.target.value)}
                                  className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs outline-none font-mono"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-neutral-border flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setIsSelfServiceEditingProfile(false)}
                            className="px-4 py-2 bg-white border border-neutral-border hover:bg-surface-container rounded text-xs font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={savingAction === 'self-service'}
                            className="px-4 py-2 bg-primary text-white rounded text-xs font-semibold hover:bg-primary-container cursor-pointer"
                          >
                            {savingAction === 'self-service' ? 'Saving...' : 'Save Employee Changes'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/* TAB: Spouse & Dependants */}
                {selfServiceActiveTab === 'family' && (
                  <div className="space-y-6 animate-in fade-in duration-150">
                    <div className="border-b border-neutral-border pb-2.5">
                      <h3 className="text-sm font-bold text-primary">Spouse & Dependant Registry</h3>
                    </div>

                    <div className="text-xs space-y-4">
                      <div className="flex justify-between items-center p-3 bg-surface-container-low border border-neutral-border/50 rounded">
                        <span className="text-outline text-[10px] uppercase font-bold">Marital Status Status</span>
                        <span className="font-bold text-on-surface bg-white border border-neutral-border px-3 py-1 rounded flex items-center gap-1.5">
                          <Heart className="w-3.5 h-3.5 text-primary" /> {previewEmployee.maritalStatus}
                        </span>
                      </div>

                      {previewEmployee.maritalStatus === 'Married' && (
                        <div className="p-4 border border-neutral-border rounded-lg bg-zinc-50/50 space-y-3">
                          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Spouse Details</span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                            <div>
                              <span className="text-outline text-[9px] font-bold block">Spouse Name</span>
                              <span className="font-bold text-on-surface">{previewEmployee.spouseName || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-outline text-[9px] font-bold block">Spouse NRIC</span>
                              <span className="font-mono font-semibold text-on-surface-variant">{previewEmployee.spouseNric || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-outline text-[9px] font-bold block">Spouse Employment Status</span>
                              <span className="font-semibold text-on-surface">{previewEmployee.spouseIsWorking === 'Yes' ? `Working at ${previewEmployee.spouseCompany}` : 'Not Working / Home-Maker'}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {previewEmployee.maritalStatus !== 'Single' && (
                        <div className="p-4 border border-neutral-border rounded-lg bg-zinc-50/50 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Dependants Registered</span>
                            <span className="font-bold text-primary bg-white border border-neutral-border px-2 py-0.5 rounded">Has Dependants: {previewEmployee.hasDependants || 'No'}</span>
                          </div>

                          {previewEmployee.hasDependants === 'Yes' && previewEmployee.dependants && previewEmployee.dependants.length > 0 ? (
                            <div className="bg-white border border-neutral-border rounded-md overflow-hidden">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-surface-container-low border-b border-neutral-border text-[9px] uppercase text-on-surface-variant font-bold">
                                  <tr>
                                    <th className="p-2">Name</th>
                                    <th className="p-2 w-20">Gender</th>
                                    <th className="p-2 w-24">DOB</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-border/40">
                                  {previewEmployee.dependants.map(dep => (
                                    <tr key={dep.id} className="hover:bg-zinc-50">
                                      <td className="p-2 font-bold text-on-surface">{dep.name}</td>
                                      <td className="p-2">{dep.gender}</td>
                                      <td className="p-2 font-mono">{formatToDDMMMYYYY(dep.dob)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-[11px] italic text-on-surface-variant text-center py-2">No dependants listed on verified record.</p>
                          )}
                        </div>
                      )}

                      {previewEmployee.maritalStatus === 'Single' && (
                        <div className="p-6 text-center italic text-on-surface-variant bg-zinc-50 rounded-lg border border-dashed border-neutral-border/75">
                          Single status on record. No spouse or dependant compliance declarations are registered.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB: Statutory & Banking */}
                {selfServiceActiveTab === 'financial' && (
                  <div className="space-y-6 animate-in fade-in duration-150">
                    <div className="border-b border-neutral-border pb-2.5">
                      <h3 className="text-sm font-bold text-primary">Statutory & Bank Registries</h3>
                    </div>

                    <div className="space-y-4 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-3 bg-surface-container-low border border-neutral-border/50 rounded">
                          <span className="text-outline text-[10px] uppercase font-bold block mb-1">Income Tax Number (TIN)</span>
                          <span className="font-mono font-bold text-on-surface">{previewEmployee.taxNumber || 'N/A'}</span>
                        </div>
                        <div className="p-3 bg-surface-container-low border border-neutral-border/50 rounded">
                          <span className="text-outline text-[10px] uppercase font-bold block mb-1">EPF Member Number</span>
                          <span className="font-mono font-bold text-on-surface">{previewEmployee.epfNumber || 'N/A'}</span>
                        </div>
                        <div className="p-3 bg-surface-container-low border border-neutral-border/50 rounded">
                          <span className="text-outline text-[10px] uppercase font-bold block mb-1">EPF Employee Contribution Rate</span>
                          <span className="font-mono font-bold text-primary">{previewEmployee.epfRateEmployee}%</span>
                        </div>
                        <div className="p-3 bg-surface-container-low border border-neutral-border/50 rounded">
                          <span className="text-outline text-[10px] uppercase font-bold block mb-1">EPF Employer Contribution Rate</span>
                          <span className="font-mono font-bold text-primary">{previewEmployee.epfRateEmployer}%</span>
                        </div>
                      </div>

                      <div className="p-4 border border-neutral-border rounded-lg bg-zinc-50/50 space-y-3">
                        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Disbursement Bank Account</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          <div>
                            <span className="text-outline text-[9px] uppercase font-bold block mb-0.5">Bank Name</span>
                            <span className="font-bold text-on-surface">{previewEmployee.bankName}</span>
                          </div>
                          <div>
                            <span className="text-outline text-[9px] uppercase font-bold block mb-0.5">Account Number</span>
                            <span className="font-mono font-bold text-primary">{previewEmployee.accountNo}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB: Career Timeline */}
                {selfServiceActiveTab === 'history' && (
                  <div className="space-y-6 animate-in fade-in duration-150">
                    <div className="border-b border-neutral-border pb-2.5">
                      <h3 className="text-sm font-bold text-primary">My Career Progression Timeline</h3>
                    </div>

                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                      {previewEmployee.careerHistory && previewEmployee.careerHistory.length > 0 ? (
                        previewEmployee.careerHistory.map((item, index) => {
                          let badgeColor = "bg-blue-100 text-blue-700";
                          if (item.type === 'Status Change') badgeColor = "bg-amber-100 text-amber-700";
                          if (item.type === 'Salary Revision') badgeColor = "bg-green-100 text-green-700";
                          if (item.type === 'Promotion') badgeColor = "bg-purple-100 text-purple-700";

                          return (
                            <div key={item.id || index} className="relative pl-5 border-l-2 border-neutral-border/60 text-xs text-left">
                              <div className="absolute -left-[6px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary" />
                              
                              <div className="flex justify-between items-start">
                                <span className="font-bold text-on-surface text-[11px]">{item.type}</span>
                                <span className="text-[10px] text-outline font-mono">{formatToDDMMMYYYY(item.date)}</span>
                              </div>
                              
                              <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded my-1.5 ${badgeColor}`}>
                                {item.previousValue} → {item.newValue}
                              </span>
                              
                              <p className="text-on-surface-variant text-[10px] leading-tight italic bg-zinc-50 p-2 rounded border border-zinc-100 mt-0.5">
                                {item.notes}
                              </p>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs italic text-on-surface-variant text-center py-4">No previous progression events logged in the system.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB: Salary Adjustments */}
                {selfServiceActiveTab === 'adjustments' && (
                  <div className="space-y-6 animate-in fade-in duration-150 text-left">
                    <div className="border-b border-neutral-border pb-2.5">
                      <h3 className="text-sm font-bold text-primary">My Salary Adjustment History</h3>
                      <p className="text-[10px] text-on-surface-variant">View historical and upcoming scheduled salary adjustments.</p>
                    </div>

                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                      {previewEmployee.salaryAdjustments && previewEmployee.salaryAdjustments.length > 0 ? (
                        <div className="bg-white border border-neutral-border rounded overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-surface-container-low border-b border-neutral-border text-[9px] uppercase text-on-surface-variant font-bold">
                              <tr>
                                <th className="p-2">Start Date</th>
                                <th className="p-2">Effective Date</th>
                                <th className="p-2 text-right">Adjusted Salary</th>
                                <th className="p-2">Adjustment Reason</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-border/40 font-medium">
                              {previewEmployee.salaryAdjustments.map((adj) => (
                                <tr key={adj.id} className="hover:bg-zinc-50/50">
                                  <td className="p-2 font-mono">{adj.startDate}</td>
                                  <td className="p-2 font-mono font-bold text-primary">{adj.effectiveDate}</td>
                                  <td className="p-2 font-mono text-right font-bold text-on-surface">RM {adj.adjustedSalary.toLocaleString()}</td>
                                  <td className="p-2 text-on-surface-variant">{adj.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="p-6 text-center text-on-surface-variant italic text-xs bg-zinc-50 rounded border border-neutral-border">
                          No previous or scheduled salary adjustments on record. Baseline monthly salary of RM {previewEmployee.basicSalary.toLocaleString()} applies.
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>

          </div>

          {/* Right Column: Payslip & Compensation History (5 cols) */}
          <div className="lg:col-span-5 space-y-6 text-left">
            
            {/* Compensation Summary Panel */}
            <div className="bg-white border border-neutral-border rounded-lg p-6 shadow-xs space-y-4">
              <h3 className="font-bold text-sm text-primary flex items-center gap-1.5 border-b border-neutral-border pb-2">
                <DollarSign className="w-4 h-4 text-primary" /> Compensation Summary
              </h3>
              
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-outline text-[9px] font-bold uppercase block mb-0.5">Basic Monthly Salary</span>
                  <span className="font-mono text-sm font-bold text-on-surface">RM {formatCurrencyAmount(getDisplayedMonthlyBasicSalary(previewEmployee))}</span>
                </div>
                <div>
                  <span className="text-outline text-[9px] font-bold uppercase block mb-0.5">Accommodation Allowance</span>
                  <span className="font-mono text-sm font-bold text-on-surface">RM {(previewEmployee.housingAllowance || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-outline text-[9px] font-bold uppercase block mb-0.5">Transport Allowance</span>
                  <span className="font-mono text-sm font-bold text-on-surface">RM {(previewEmployee.transportAllowance || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-outline text-[9px] font-bold uppercase block mb-0.5">Estimated Net Pay</span>
                  <span className="font-mono text-sm font-bold text-primary">RM {payslipBreakdown.netPay.toLocaleString()}</span>
                </div>
              </div>

              <div className="p-3.5 bg-zinc-50 border border-neutral-border rounded text-[11px] text-on-surface-variant leading-relaxed">
                <span className="font-bold text-primary block mb-0.5">Compliance Standard Enforced</span>
                Your salary and allowances are subject to standard Malaysian statutory deductions (EPF, SOCSO, EIS, and Income Tax PCB).
              </div>
            </div>

            {/* Payslip History Panel */}
            <div className="bg-white border border-neutral-border rounded-lg shadow-xs overflow-hidden">
              <div className="p-4 bg-surface-container-low border-b border-neutral-border">
                <h3 className="font-bold text-xs text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-primary" /> My Payslip History
                </h3>
              </div>

              <div className="divide-y divide-neutral-border/50">
                {(() => {
                  const list = [];
                  const d = new Date();
                  for (let i = 0; i < 3; i++) {
                    list.push(d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
                    d.setMonth(d.getMonth() - 1);
                  }
                  return list;
                })().map((month, idx) => {
                  return (
                    <div key={idx} className="p-4 flex justify-between items-center hover:bg-zinc-50/50 transition-colors">
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-on-surface block">{month}</span>
                        <div className="flex items-center gap-2 text-[10px] text-on-surface-variant">
                          <span className="font-mono">Disbursed: 28th</span>
                          <span>·</span>
                          <span className="font-mono font-semibold text-primary">RM {payslipBreakdown.netPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => {
                          setViewingPayslipMonth(month);
                          setPayslipZoom(100);
                          setPayslipRotation(0);
                        }}
                        className="bg-primary/5 text-primary hover:bg-primary/10 border border-primary/20 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 cursor-pointer transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" /> View Payslip
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Simulated Request History */}
            <div className="bg-white border border-neutral-border rounded-lg p-6 shadow-xs space-y-4">
              <h3 className="font-bold text-sm text-primary flex items-center gap-1.5 border-b border-neutral-border pb-2">
                <Users className="w-4 h-4 text-primary" /> Administrative Requests
              </h3>
              
              <div className="space-y-2.5">
                <div className="p-3 border border-neutral-border rounded-md bg-zinc-50 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-on-surface block">Annual Leave (2 Days)</span>
                    <span className="text-[10px] text-on-surface-variant font-mono">Date: 2026-06-20 · Approved</span>
                  </div>
                  <span className="bg-green-100 text-green-700 border border-green-200 text-[9px] font-bold px-2 py-0.5 rounded-full">
                    Approved
                  </span>
                </div>

                <div className="p-3 border border-neutral-border rounded-md bg-zinc-50 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-on-surface block">Medical Allowance Claim</span>
                    <span className="text-[10px] text-on-surface-variant font-mono">Date: 2026-06-15 · Under Review</span>
                  </div>
                  <span className="bg-amber-100 text-amber-700 border border-amber-200 text-[9px] font-bold px-2 py-0.5 rounded-full">
                    Pending
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onShowNotification('Leave Calendar', `Please switch to Leave Management tab or use sidebar commands to submit real administrative leaves.`)}
                className="w-full bg-primary/5 text-primary hover:bg-primary/10 border border-primary/25 text-xs font-semibold py-2 rounded text-center transition-all cursor-pointer"
              >
                Submit New Request
              </button>
            </div>

          </div>

        </div>

        {/* HIGH-FIDELITY INTERACTIVE INLINE PAYSLIP MODAL */}
        {viewingPayslipMonth && (() => {
          const parts = viewingPayslipMonth.split(' ');
          const monthName = parts[0];
          const yearVal = Number(parts[1]) || 2026;
          const monthsList = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
          ];
          const monthIndexVal = monthsList.indexOf(monthName) + 1;
          const modalEmployee = getEmployeeForMonth(previewEmployee, monthIndexVal, yearVal);
          const modalBreakdown = calculatePayslip(previewEmployee, monthIndexVal, yearVal);

          const modalSalaryProration = getSalaryProration(previewEmployee, monthIndexVal, yearVal);
          const modalActualBasic = getPayrollBasicSalary(previewEmployee, monthIndexVal, yearVal);

          return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-xs animate-in fade-in duration-150 text-left">
              <div className="bg-white border border-neutral-border rounded-lg shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-150">
              
              {/* Modal Toolbar Header */}
              <div className="h-14 bg-zinc-900 flex items-center justify-between px-4 shadow-md z-10 shrink-0 select-none">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setViewingPayslipMonth(null)}
                    className="text-white hover:bg-white/10 p-2 rounded-full transition-colors flex items-center justify-center cursor-pointer"
                    title="Close"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="flex flex-col text-left">
                    <span className="text-white text-xs font-semibold truncate max-w-[200px] md:max-w-[400px]">
                      {viewingPayslipMonth.replace(/\s+/g, '_')}_Payslip_{previewEmployee.name.replace(/\s+/g, '_')}.pdf
                    </span>
                    <span className="text-gray-400 text-[10px] uppercase tracking-wider font-semibold">
                      {activeSub.name}
                    </span>
                  </div>
                </div>

                {/* Zoom Controls */}
                <div className="hidden md:flex items-center gap-3 bg-black/20 rounded px-2.5 py-1">
                  <button 
                    onClick={() => payslipZoom > 70 && setPayslipZoom(p => p - 10)}
                    className="text-white hover:bg-white/10 p-1 rounded transition-colors flex items-center justify-center cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-white text-xs font-bold px-2 w-[45px] text-center">{payslipZoom}%</span>
                  <button 
                    onClick={() => payslipZoom < 150 && setPayslipZoom(p => p + 10)}
                    className="text-white hover:bg-white/10 p-1 rounded transition-colors flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Right Controls */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setPayslipRotation(p => (p + 90) % 360)}
                    className="text-white hover:bg-white/10 p-2 rounded-full transition-colors flex items-center justify-center cursor-pointer" 
                    title="Rotate 90°"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => {
                      onShowNotification('Print Job Sent', `Sending ${viewingPayslipMonth}_Payslip to configured printer.`);
                      window.print();
                    }}
                    className="text-white hover:bg-white/10 p-2 rounded-full transition-colors flex items-center justify-center cursor-pointer" 
                    title="Print Document"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={async () => {
                      onShowNotification('Download Started', `Preparing PDF export...`);
                      const element = document.getElementById('self-service-pdf-content');
                      if (!element) {
                        onShowNotification('Error', 'Failed to find payslip document container.');
                        return;
                      }
                      try {
                        const originalTransform = element.style.transform;
                        const originalTransition = element.style.transition;
                        element.style.transform = 'none';
                        element.style.transition = 'none';

                        const canvas = await html2canvas(element, {
                          scale: 2,
                          useCORS: true,
                          backgroundColor: '#ffffff',
                          logging: false
                        });

                        element.style.transform = originalTransform;
                        element.style.transition = originalTransition;

                        const imgData = canvas.toDataURL('image/png');
                        const pdf = new jsPDF({
                          orientation: 'portrait',
                          unit: 'mm',
                          format: 'a4'
                        });

                        const pdfWidth = pdf.internal.pageSize.getWidth();
                        const imgWidth = canvas.width;
                        const imgHeight = canvas.height;
                        const ratio = imgWidth / pdfWidth;
                        const imgHeightInPdf = imgHeight / ratio;

                        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeightInPdf);
                        const fileName = `${viewingPayslipMonth.replace(/\s+/g, '_')}_Payslip_${previewEmployee.name.replace(/\s+/g, '_')}.pdf`;
                        pdf.save(fileName);
                        onShowNotification('Download Complete', `${fileName} saved successfully.`);
                      } catch (error) {
                        console.error(error);
                        onShowNotification('Error', 'PDF render error.');
                      }
                    }}
                    className="text-white hover:bg-white/10 p-2 rounded-full transition-colors flex items-center justify-center cursor-pointer" 
                    title="Download PDF"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Viewer Canvas (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center items-start bg-neutral-100">
                
                {/* A4 Payslip Page Container */}
                <div 
                  id="self-service-pdf-content"
                  style={{ 
                    transform: `scale(${payslipZoom / 100}) rotate(${payslipRotation}deg)`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.2s ease-out',
                  }}
                  className="bg-white w-full max-w-[800px] min-h-[960px] shadow-2xl my-4 p-8 md:p-12 border border-neutral-border text-left relative"
                >
                  <div className="absolute top-2 right-4 text-[9px] text-on-surface-variant/30 font-mono select-none">
                    CONFIDENTIAL - STRICTLY PRIVATE
                  </div>

                  {/* Payslip Branding Header */}
                  <div className="flex justify-between items-start border-b-2 border-primary pb-6 mb-6">
                    <div className="flex items-start gap-4 text-left">
                      <div className="w-14 h-14 rounded-lg bg-white border border-neutral-border/40 flex items-center justify-center overflow-hidden shrink-0 shadow-xs relative">
                        <img 
                          src="/redpoint-logo.png" 
                          alt="YSYD HRMS Logo"
                          className="w-full h-full object-contain" 
                        />
                      </div>

                      <div>
                        <h1 className="text-xl font-bold text-primary tracking-tight font-sans">
                          {activeSub.name}
                        </h1>
                        <p className="text-[10px] text-on-surface-variant font-mono font-semibold">
                          Co. Reg: {activeSub.registrationNumber}
                        </p>
                        <p className="text-xs text-on-surface-variant mt-1 leading-relaxed max-w-[400px]">
                          {activeSub.address}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <h2 className="text-lg font-bold text-primary-container uppercase tracking-widest font-sans">Payslip</h2>
                      <p className="text-sm text-on-surface mt-1 font-medium">{viewingPayslipMonth}</p>
                    </div>
                  </div>

                  {/* Employee Details Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 bg-surface-container-low p-4 border border-neutral-border rounded text-xs leading-relaxed">
                    <div>
                      <p className="text-on-surface-variant mb-1 font-medium">Employee Name</p>
                      <p className="text-on-surface font-semibold text-sm">{previewEmployee.name}</p>
                    </div>
                    <div>
                      <p className="text-on-surface-variant mb-1 font-medium">Email Address</p>
                      <p className="text-on-surface font-semibold text-sm truncate" title={previewEmployee.email}>{previewEmployee.email}</p>
                    </div>
                    <div>
                      <p className="text-on-surface-variant mb-1 font-medium">Department</p>
                      <p className="text-on-surface font-semibold text-sm">{previewEmployee.department}</p>
                    </div>
                    <div>
                      <p className="text-on-surface-variant mb-1 font-medium">Designation</p>
                      <p className="text-on-surface font-semibold text-sm">{previewEmployee.designation}</p>
                    </div>
                    <div>
                      <p className="text-on-surface-variant mb-1 font-medium">TIN / Tax Number</p>
                      <p className="text-on-surface font-semibold text-sm font-mono">{previewEmployee.taxNumber || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-on-surface-variant mb-1 font-medium">EPF Member Number</p>
                      <p className="text-on-surface font-semibold text-sm font-mono">{previewEmployee.epfNumber || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-on-surface-variant mb-1 font-medium">NRIC / Passport</p>
                      <p className="text-on-surface font-semibold text-sm font-mono">{previewEmployee.nricPassport || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-on-surface-variant mb-1 font-medium">Bank Account</p>
                      <p className="text-on-surface font-semibold text-sm font-mono">{previewEmployee.bankName} - {previewEmployee.accountNo}</p>
                    </div>
                  </div>

                  {/* Financial Data Table split */}
                  <div className="grid md:grid-cols-2 gap-8 mb-8">
                    {/* Earnings Table */}
                    <div>
                      <h3 className="text-base text-primary font-bold mb-4 border-b border-neutral-border pb-2">
                        Earnings & Additions
                      </h3>
                      <table className="w-full text-sm">
                        <tbody>
                          <tr className="border-b border-outline-variant/30">
                            <td className="py-2 text-on-surface text-left">
                              {modalSalaryProration.isProrated ? `Prorated ${getPayslipLabel(previewEmployee.employmentType)}` : getPayslipLabel(previewEmployee.employmentType)}
                            </td>
                            <td className="py-2 text-right text-on-surface font-mono">RM {modalActualBasic.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>

                          {/* Allowances */}
                          {(previewEmployee.allowanceGeneral || 0) > 0 && (
                            <tr className="border-b border-outline-variant/30">
                              <td className="py-2 text-on-surface text-left">General Allowance</td>
                              <td className="py-2 text-right text-on-surface font-mono">RM {(previewEmployee.allowanceGeneral || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                          )}
                          {(previewEmployee.allowanceTransport !== undefined ? previewEmployee.allowanceTransport : previewEmployee.transportAllowance) > 0 && (
                            <tr className="border-b border-outline-variant/30">
                              <td className="py-2 text-on-surface text-left">Transport Allowance</td>
                              <td className="py-2 text-right text-on-surface font-mono">RM {Number(previewEmployee.allowanceTransport !== undefined ? previewEmployee.allowanceTransport : previewEmployee.transportAllowance).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                          )}
                          {(previewEmployee.allowanceParking || 0) > 0 && (
                            <tr className="border-b border-outline-variant/30">
                              <td className="py-2 text-on-surface text-left">Parking Allowance</td>
                              <td className="py-2 text-right text-on-surface font-mono">RM {(previewEmployee.allowanceParking || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                          )}
                          {(previewEmployee.allowanceMeal || 0) > 0 && (
                            <tr className="border-b border-outline-variant/30">
                              <td className="py-2 text-on-surface text-left">Meal Allowance</td>
                              <td className="py-2 text-right text-on-surface font-mono">RM {(previewEmployee.allowanceMeal || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                          )}
                          {(previewEmployee.allowanceAccommodation !== undefined ? previewEmployee.allowanceAccommodation : previewEmployee.housingAllowance) > 0 && (
                            <tr className="border-b border-outline-variant/30">
                              <td className="py-2 text-on-surface text-left">Accommodation Allowance</td>
                              <td className="py-2 text-right text-on-surface font-mono">RM {Number(previewEmployee.allowanceAccommodation !== undefined ? previewEmployee.allowanceAccommodation : previewEmployee.housingAllowance).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                          )}
                          {(previewEmployee.allowancePhone || 0) > 0 && (
                            <tr className="border-b border-outline-variant/30">
                              <td className="py-2 text-on-surface text-left">Phone Allowance</td>
                              <td className="py-2 text-right text-on-surface font-mono">RM {(previewEmployee.allowancePhone || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                          )}

                          {previewEmployee.overtime > 0 && (
                            <tr className="border-b border-outline-variant/30">
                              <td className="py-2 text-on-surface text-left">Overtime</td>
                              <td className="py-2 text-right text-on-surface font-mono">RM {previewEmployee.overtime.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                          )}

                          {/* Supplemental Payments */}
                          {((previewEmployee.bonusAmount !== undefined ? previewEmployee.bonusAmount : previewEmployee.performanceBonus) || 0) > 0 && (
                            <tr className="border-b border-outline-variant/30">
                              <td className="py-2 text-on-surface text-left">{previewEmployee.bonusDesc || 'Performance Bonus'}</td>
                              <td className="py-2 text-right text-on-surface font-mono">RM {Number(previewEmployee.bonusAmount !== undefined ? previewEmployee.bonusAmount : previewEmployee.performanceBonus).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                          )}
                          {(previewEmployee.commissionAmount || 0) > 0 && (
                            <tr className="border-b border-outline-variant/30">
                              <td className="py-2 text-on-surface text-left">{previewEmployee.commissionDesc || 'Commissions'}</td>
                              <td className="py-2 text-right text-on-surface">RM {(previewEmployee.commissionAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                          )}

                          <tr className="font-bold text-primary">
                            <td className="py-3 text-on-surface text-left font-bold">Total Earnings & Additions</td>
                            <td className="py-3 text-right font-mono">RM {(modalBreakdown.grossEarnings + modalBreakdown.reimbursementsSum).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Deductions Table */}
                    <div>
                      <h3 className="text-base text-primary font-bold mb-4 border-b border-neutral-border pb-2">
                        Deductions
                      </h3>
                      <table className="w-full text-sm">
                        <tbody>
                          <tr className="border-b border-outline-variant/30">
                            <td className="py-2 text-on-surface text-left">EPF (Employee {previewEmployee.epfRateEmployee}%)</td>
                            <td className="py-2 text-right text-error font-mono">RM {modalBreakdown.epfEmployeeValue.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                          <tr className="border-b border-outline-variant/30">
                            <td className="py-2 text-on-surface text-left">SOCSO</td>
                            <td className="py-2 text-right text-error font-mono">RM {modalBreakdown.socsoEmployeeVal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                          {modalBreakdown.skbbkEmpVal > 0 && (
                            <tr className="border-b border-outline-variant/30">
                              <td className="py-2 text-on-surface text-left">SOCSO (SKBBK)</td>
                              <td className="py-2 text-right text-error font-mono">RM {modalBreakdown.skbbkEmpVal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                          )}
                          <tr className="border-b border-outline-variant/30">
                            <td className="py-2 text-on-surface text-left">EIS</td>
                            <td className="py-2 text-right text-error font-mono">RM {modalBreakdown.eisEmployeeVal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                          <tr className="border-b border-outline-variant/30">
                            <td className="py-2 text-on-surface text-left">Income Tax (PCB)</td>
                            <td className="py-2 text-right text-error font-mono">RM {modalBreakdown.taxPcbVal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>

                          <tr className="font-bold text-error">
                            <td className="py-3 text-on-surface text-left font-bold">Total Deductions</td>
                            <td className="py-3 text-right font-mono">RM {modalBreakdown.totalDeductions.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Employer Contributions Info Only */}
                  <div className="mb-12 bg-surface-container-low p-4 border border-neutral-border rounded text-xs space-y-3">
                    <h3 className="font-bold text-on-surface-variant uppercase tracking-wider">
                      Employer Contributions (Not paid to employee)
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono font-medium text-on-surface">
                      <div>
                        <span className="text-on-surface-variant text-[10px] uppercase block mb-1">EPF ({previewEmployee.epfRateEmployer}%)</span>
                        <span>RM {modalBreakdown.epfEmployerValue.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                      </div>
                      <div>
                        <span className="text-on-surface-variant text-[10px] uppercase block mb-1">SOCSO</span>
                        <span>RM {modalBreakdown.socsoEmployerVal.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                      </div>
                      {modalBreakdown.skbbkEmplyrVal > 0 && (
                        <div>
                          <span className="text-on-surface-variant text-[10px] uppercase block mb-1">SOCSO (SKBBK)</span>
                          <span>RM {modalBreakdown.skbbkEmplyrVal.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-on-surface-variant text-[10px] uppercase block mb-1">EIS</span>
                        <span>RM {modalBreakdown.eisEmployerVal.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                      </div>
                    </div>
                  </div>

                  {/* Net Pay and signature footer */}
                  <div className="border-t-2 border-primary-container pt-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
                    <div className="text-xs text-on-surface-variant space-y-1">
                      <p className="font-medium">This is a computer generated document. No signature is required.</p>
                      <p>Generated on: 28 Oct 2026, 09:41 AM</p>
                      <p>Security hash: <span className="font-mono text-[10px]">SHA256:7a90b4cf22...</span></p>
                    </div>
                    <div className="text-right bg-primary-container/5 px-6 py-4 rounded border border-primary-container/20 min-w-[200px]">
                      <p className="text-xs text-primary-container font-bold uppercase tracking-widest mb-1">Net Pay</p>
                      <p className="text-2xl font-bold text-on-surface font-mono">
                        RM {modalBreakdown.netPay.toLocaleString('en-US', {minimumFractionDigits: 2})}
                      </p>
                    </div>
                  </div>

                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-neutral-border flex justify-end bg-surface-container-low shrink-0">
                <button
                  type="button"
                  onClick={() => setViewingPayslipMonth(null)}
                  className="px-5 py-2 bg-primary text-white rounded text-xs font-semibold hover:bg-primary-container"
                >
                  Close Payslip View
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-in fade-in duration-200">
      
      {/* Title block */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-on-background tracking-tight">Workforce Directory</h1>
          <p className="text-on-surface-variant mt-1">Manage personnel compliance details, NRIC database, and track career progression history.</p>
        </div>
        
        {/* Mode Switcher Toggle Block inside Administrative Mode */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-surface-container border border-neutral-border rounded-lg p-1 shrink-0">
            <button
              onClick={() => setViewMode('admin')}
              className="px-3 py-1.5 rounded bg-primary text-[#f7f0e0] text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            >
              <Building2 className="w-3.5 h-3.5" /> HR Admin
            </button>
            <button
              onClick={() => {
                setViewMode('self-service');
                // Auto-select first employee to begin simulation
                const employee = activeEmployees[0];
                if (employee) {
                  setPreviewEmployeeId(employee.id);
                  setSelfServiceContactNumber(employee.contactNumber || '');
                  setSelfServiceEmergencyName(employee.emergencyContactName || '');
                  setSelfServiceEmergencyRelation(employee.emergencyContactRelation || '');
                  setSelfServiceEmergencyPhone(employee.emergencyContactPhone || '');
                }
              }}
              className="px-3 py-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" /> Self-Service View
            </button>
          </div>

          <button 
            onClick={handleOpenAddModal}
            className="bg-primary text-[#f7f0e0] text-xs font-semibold py-2 px-4 rounded shadow-sm hover:bg-primary-container transition-colors flex items-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" /> Add New Employee
          </button>
        </div>
      </div>

      {/* Directory Content Table Card */}
      <div className="bg-white border border-neutral-border rounded-lg shadow-sm overflow-hidden">
        
        {employees.length === 0 ? (
          <div className="p-12 text-center bg-white space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-on-surface">No Employee Records Found</h3>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto mt-1">
                {entities.length === 0 
                  ? "You need to register at least one Corporate Subsidiary in the 'Subsidiaries' view before you can enroll employees."
                  : "Your workforce directory is empty. Register your first employee to get started."}
              </p>
            </div>
            {entities.length > 0 && (
              <button
                onClick={handleOpenAddModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-[#f7f0e0] font-bold text-xs rounded hover:bg-primary-dark transition-all shadow-xs cursor-pointer mx-auto"
              >
                <UserPlus className="w-4 h-4" /> Register New Employee
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Complex Filters Panel */}
            <div className="p-4 bg-surface-container-low border-b border-neutral-border flex flex-col md:flex-row gap-4 items-center justify-between text-sm">
              
              <div className="flex flex-wrap flex-1 gap-3 w-full">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-outline" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by Employee name, email, NRIC, or ID..."
                    className="w-full pl-9 pr-4 py-1.5 bg-white border border-neutral-border rounded text-xs focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>

                {/* Department select */}
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="rounded border border-neutral-border bg-white p-1.5 text-xs outline-none"
                >
                  <option>All Departments</option>
                  {availableDepartments.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>

                {/* Subsidiary display (sandboxed) */}
                {activeEntityId ? (
                  <div className="rounded border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs font-bold text-primary flex items-center gap-1.5 select-none">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>{entities.find(e => e.id === activeEntityId)?.name || activeEntityId}</span>
                  </div>
                ) : (
                  <select
                    value={entityFilter}
                    onChange={(e) => setEntityFilter(e.target.value)}
                    className="rounded border border-primary/30 bg-white p-1.5 text-xs outline-none font-semibold text-primary"
                  >
                    <option value="All Subsidiaries">All Subsidiaries</option>
                    {entities.map(ent => (
                      <option key={ent.id} value={ent.id}>{ent.name}</option>
                    ))}
                  </select>
                )}

                {/* Status select */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded border border-neutral-border bg-white p-1.5 text-xs outline-none"
                >
                  <option>All Statuses</option>
                  <option>Active</option>
                  <option>Active - Probation</option>
                  <option>Active - Confirmation</option>
                  <option>Resigned</option>
                  <option>Terminated</option>
                  <option>Suspended</option>
                </select>
              </div>

              <div className="text-xs font-semibold text-on-surface-variant shrink-0">
                Directory Registry count: <span className="text-primary font-bold">{filteredEmployees.length} personnel found</span>
              </div>
            </div>

            {/* Directory spreadsheet grid */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-container-low border-b border-neutral-border text-on-surface-variant font-bold uppercase tracking-wider select-none">
                    <th className="p-4">Personnel Info</th>
                    <th className="p-4">Subsidiary</th>
                    <th className="p-4">Type & NRIC/Passport</th>
                    <th className="p-4">Department & Designation</th>
                    <th className="p-4 min-w-[140px]">Salary Base (RM)</th>
                    <th className="p-4">Date of Joined</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Account Access</th>
                    <th className="p-4 text-right">Administrative</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-border/50">
                  {filteredEmployees.map((emp) => {
                    const displayedStatus = getEffectiveEmploymentStatusForDate(emp, todayIsoDate);
                    const statusClasses = getEmployeeStatusClasses(displayedStatus);
                    const displayedBasicSalary = getDisplayedMonthlyBasicSalary(emp);
                    const documentProfile = getPayrollDocumentProfile(emp);
                    const accountSummary = getAccountSummary(emp);
                    const accountLabel = accountSummary.accountStatus === 'must_change_password'
                      ? 'Setup required'
                      : accountSummary.accountStatus === 'not_created'
                        ? 'Not created'
                        : accountSummary.accountStatus === 'invited'
                          ? 'Invite sent'
                          : accountSummary.accountStatus === 'active'
                            ? 'Active'
                            : accountSummary.accountStatus === 'disabled'
                              ? 'Disabled'
                              : 'Needs attention';
                    const accountClasses = accountSummary.accountStatus === 'active'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : accountSummary.accountStatus === 'error'
                        ? 'bg-rose-100 text-rose-800 border-rose-200'
                        : 'bg-amber-100 text-amber-800 border-amber-200';
                    
                    return (
                      <tr 
                        key={emp.id} 
                        onClick={() => {
                          setSelectedEmployeeId(emp.id);
                          setIsDetailOpen(true);
                        }}
                        className={`hover:bg-surface-container/60 transition-colors cursor-pointer ${selectedEmployeeId === emp.id ? 'bg-surface-container-low border-l-4 border-primary' : ''}`}
                      >
                        
                        {/* Column 1: Personnel Info */}
                        <td className="p-4 flex items-center gap-3">
                          <EmployeeAvatar employee={emp} className="w-9 h-9 rounded-full shrink-0" />
                          <div>
                            <div className="font-bold text-sm text-on-surface">{emp.name}</div>
                            <div className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 text-outline" /> {emp.email}
                            </div>
                          </div>
                        </td>



                        {/* Column 2b: Subsidiary */}
                        <td className="p-4">
                          <span className="font-semibold text-xs text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded shadow-xs block w-fit truncate max-w-[140px]" title={entities.find(e => e.id === emp.entityId)?.name || emp.entityId}>
                            {entities.find(e => e.id === emp.entityId)?.name || emp.entityId}
                          </span>
                        </td>

                        {/* Column 3: Type & NRIC */}
                        <td className="p-4">
                          <span className="text-[10px] font-bold text-secondary uppercase bg-surface-container-high px-1.5 py-0.5 rounded block w-fit mb-1">
                            {emp.employmentType || 'Full-Time'}
                          </span>
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded block w-fit mb-1 ${
                            documentProfile.isPaymentVoucher ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {documentProfile.documentType}
                          </span>
                          <div className="text-[10px] font-semibold text-on-surface-variant mb-1">{documentProfile.compensationLabel}</div>
                          <div className="font-mono text-xs font-semibold text-on-surface">{emp.nricPassport || 'N/A'}</div>
                        </td>

                        {/* Column 4: Department */}
                        <td className="p-4">
                          <div className="font-semibold text-on-surface">{emp.designation}</div>
                          <div className="text-[10px] text-on-surface-variant mt-0.5">{emp.department}</div>
                        </td>

                        {/* Column 5: Base Salary */}
                        <td className="p-4 min-w-[140px] whitespace-nowrap font-mono font-semibold text-primary">
                          RM {formatCurrencyAmount(displayedBasicSalary)}
                        </td>

                        {/* Column 6: Date Joined */}
                        <td className="p-4 text-on-surface-variant font-mono">
                          {formatToDDMMMYYYY(emp.dateOfJoined)}
                        </td>

                        {/* Column 7: Status */}
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] ${statusClasses.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusClasses.dot}`} />
                            {displayedStatus}
                          </span>
                        </td>

                        {/* Column 8: Employee Account */}
                        <td className="p-4 min-w-[150px]" onClick={(event) => event.stopPropagation()}>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${accountClasses}`}>
                            <KeyRound className="w-3 h-3" />
                            {accountLabel}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedEmployeeId(emp.id);
                              setIsDetailOpen(true);
                            }}
                            className="mt-1 block text-[10px] font-semibold text-primary hover:underline cursor-pointer"
                          >
                            Manage access
                          </button>
                        </td>

                        {/* Column 9: Delete / Admin */}
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <button 
                              onClick={() => {
                                setSelectedEmployeeId(emp.id);
                                setIsDetailOpen(true);
                              }}
                              className="text-primary hover:bg-primary/10 px-2 py-1 rounded transition-colors text-xs font-semibold cursor-pointer"
                            >
                              View Details
                            </button>
                            <button 
                              onClick={() => handleDelete(emp.id, emp.name)}
                              disabled={savingAction === `delete:${emp.id}`}
                              className="text-error hover:text-red-700 hover:bg-error/10 p-1.5 rounded transition-colors inline-flex items-center gap-1 font-semibold cursor-pointer"
                              title="Remove Employee"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredEmployees.length === 0 && (
              <div className="p-12 text-center text-on-surface-variant">
                <Users className="w-12 h-12 text-outline mx-auto mb-4 opacity-50" />
                <h4 className="font-bold text-sm">No Employees Found</h4>
                <p className="text-xs text-outline mt-1">Try adjusting your filters or search criteria.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Interactive Detail Panel & Career Progression History */}
      {isDetailOpen && selectedEmployee && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-neutral-border rounded-lg shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-border flex justify-between items-center bg-primary text-[#f7f0e0]">
              <div className="flex items-center gap-3">
                <div className="relative group shrink-0 w-12 h-12">
                  <EmployeeAvatar employee={selectedEmployee} className="w-12 h-12 rounded-full" />
                  {/* Photo Edit overlay */}
                  <label className="absolute inset-0 w-full h-full rounded-full bg-black/55 flex flex-col items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[7px] text-white font-extrabold uppercase tracking-wider">Change</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          uploadDetailAvatarFile(selectedEmployee.id, file);
                        }
                      }} 
                      className="hidden" 
                    />
                  </label>
                </div>
                <div>
                  <h3 className="font-bold text-lg tracking-tight leading-none text-[#f7f0e0]">{selectedEmployee.name}</h3>
                  <p className="text-xs text-[#f7f0e0]/70 mt-1">{selectedEmployee.designation}</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsDetailOpen(false);
                  setIsEditingGeneralInfo(false);
                }}
                className="p-1.5 rounded-full hover:bg-white/10 text-white transition-colors"
              >
                <X className="w-5 h-5 text-[#f7f0e0]" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-neutral-border text-left">
              
              {/* Left Column: Comprehensive Compliance Profile */}
              <div className="lg:col-span-7 p-6 space-y-6">
                
                {/* Section title */}
                <div className="border-b border-neutral-border pb-3 flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-sm text-primary flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-primary" /> Statutory Compliance & Personal Profile
                    </h4>
                    <p className="text-[11px] text-on-surface-variant">
                      {isEditingGeneralInfo ? 'Edit corporate personnel registration details.' : 'Verified corporate personnel registration details.'}
                    </p>
                  </div>
                  {!isEditingGeneralInfo ? (
                    <button 
                      type="button"
                      onClick={handleStartEditGeneralInfo}
                      className="bg-primary text-[#f7f0e0] hover:bg-primary-container px-3 py-1.5 rounded transition-colors text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      Edit Employee Profile
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => setIsEditingGeneralInfo(false)}
                        className="text-on-surface-variant hover:bg-surface-container px-3 py-1.5 rounded transition-colors text-xs font-semibold cursor-pointer border border-neutral-border"
                      >
                        Cancel
                      </button>
                      <button 
                        type="button"
                        disabled={isUploadingAvatar || savingAction === 'general'}
                        onClick={handleSaveGeneralInfoUpdates}
                        className={`px-3 py-1.5 rounded transition-colors text-xs font-semibold cursor-pointer ${
                          isUploadingAvatar || savingAction === 'general'
                            ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed' 
                            : 'bg-primary text-[#f7f0e0] hover:opacity-95'
                        }`}
                      >
                        {isUploadingAvatar ? 'Uploading...' : savingAction === 'general' ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  )}
                </div>

                {selectedAccountSummary && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-primary flex items-center gap-2">
                          <KeyRound className="w-4 h-4" /> Account Access
                        </h4>
                        <p className="text-[11px] text-on-surface-variant mt-0.5">
                          Username: <span className="font-mono font-semibold">{selectedAccountSummary.username}</span>
                        </p>
                      </div>
                      <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        selectedAccountSummary.accountStatus === 'active'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : selectedAccountSummary.accountStatus === 'error'
                            ? 'bg-rose-100 text-rose-800 border-rose-200'
                            : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}>
                        {selectedAccountSummary.accountStatus === 'must_change_password'
                          ? 'Setup required'
                          : selectedAccountSummary.accountStatus.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openAccountAction(
                          selectedEmployee,
                          selectedAccountSummary.accountStatus === 'not_created' ? 'provision' : 'share'
                        )}
                        disabled={!canManageAccountActions}
                        className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-[11px] font-bold text-white hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {selectedAccountSummary.accountStatus === 'not_created'
                          ? <UserPlus className="w-3.5 h-3.5" />
                          : <Send className="w-3.5 h-3.5" />}
                        {selectedAccountSummary.accountStatus === 'not_created'
                          ? 'Create Account'
                          : 'Share Account Details'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openAccountAction(selectedEmployee, 'reset_password')}
                        disabled={!canManageAccountActions}
                        className="inline-flex items-center gap-1.5 rounded border border-primary/30 bg-white px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RotateCw className="w-3.5 h-3.5" /> Reset Password
                      </button>
                      <button
                        type="button"
                        onClick={handleLoadAccountEvents}
                        disabled={!canManageAccountActions || isAccountEventsLoading}
                        className="inline-flex items-center gap-1.5 rounded border border-neutral-border bg-white px-3 py-1.5 text-[11px] font-bold text-on-surface-variant hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Clock3 className="w-3.5 h-3.5" />
                        {isAccountEventsLoading ? 'Loading history...' : 'View Delivery History'}
                      </button>
                    </div>

                    {accountPreviewMode && (
                      <p className="text-[10px] font-semibold text-amber-800">
                        Preview mode: no external message is sent. Email and WhatsApp handoff links are generated locally.
                      </p>
                    )}
                    {!canManageAccountActions && (
                      <p className="text-[10px] font-semibold text-on-surface-variant">
                        Read-only: only hr.redpoint can manage employee accounts.
                      </p>
                    )}

                    {accountEvents.length > 0 && (
                      <div className="border-t border-primary/15 pt-3 space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                          Recent delivery history
                        </div>
                        {accountEvents.slice(0, 5).map((event) => (
                          <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-border/60 bg-white px-2.5 py-2 text-[10px]">
                            <span className="font-semibold text-on-surface">
                              {event.action.replace(/_/g, ' ')}
                              {event.channel ? ` via ${event.channel}` : ''}
                            </span>
                            <span className="text-on-surface-variant">
                              {event.result} · {new Date(event.createdAt).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!isEditingGeneralInfo ? (
                  <>
                    {/* Primary Data Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      
                      {/* Row 1 */}
                      <div className="p-3 bg-surface-container-low rounded border border-neutral-border">
                        <div className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider mb-0.5">NRIC / Passport Number</div>
                        <div className="font-mono text-sm font-semibold text-on-surface">{selectedEmployee.nricPassport || 'N/A'}</div>
                      </div>

                      <div className="p-3 bg-surface-container-low rounded border border-neutral-border">
                        <div className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider mb-0.5">Nationality</div>
                        <div className="font-semibold text-sm text-on-surface flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-primary" /> {selectedEmployee.nationality || 'Malaysian'}
                        </div>
                      </div>

                      {/* Row 2 */}
                      <div className="p-3 bg-surface-container-low rounded border border-neutral-border">
                        <div className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider mb-0.5">Contact Number</div>
                        <div className="font-mono text-sm font-semibold text-on-surface flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-primary" /> {selectedEmployee.contactNumber || 'N/A'}
                        </div>
                      </div>

                      <div className="p-3 bg-surface-container-low rounded border border-neutral-border">
                        <div className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider mb-0.5">Income Tax Number</div>
                        <div className="font-mono text-sm font-semibold text-on-surface">{selectedEmployee.taxNumber || 'N/A'}</div>
                      </div>

                      <div className="p-3 bg-surface-container-low rounded border border-neutral-border">
                        <div className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider mb-0.5">EPF Member Number</div>
                        <div className="font-mono text-sm font-semibold text-on-surface">{selectedEmployee.epfNumber || 'N/A'}</div>
                      </div>

                      <div className="p-3 bg-surface-container-low rounded border border-neutral-border">
                        <div className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider mb-0.5">SOCSO Number</div>
                        <div className="font-mono text-sm font-semibold text-on-surface">
                          {selectedEmployee.socsoNumber || selectedEmployee.nricPassport?.replace(/-/g, '') || 'N/A'}
                        </div>
                      </div>

                      {/* Row 3 */}
                      <div className="p-3 bg-surface-container-low rounded border border-neutral-border">
                        <div className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider mb-0.5">Type of Employment</div>
                        <div className="font-semibold text-sm text-primary uppercase">{selectedEmployee.employmentType || 'Full-Time'}</div>
                      </div>

                      {selectedPayrollDocumentProfile && (
                        <div className="p-3 bg-surface-container-low rounded border border-neutral-border">
                          <div className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider mb-0.5">Payroll Document</div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`font-bold text-[10px] uppercase px-2 py-0.5 rounded-full ${
                              selectedPayrollDocumentProfile.isPaymentVoucher ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {selectedPayrollDocumentProfile.documentType}
                            </span>
                            <span className="font-semibold text-xs text-on-surface">{selectedPayrollDocumentProfile.compensationLabel}</span>
                          </div>
                          {selectedPayrollDocumentProfile.requiresContractStatutoryChoice && (
                            <p className="mt-1 text-[10px] font-semibold text-amber-700">Contract statutory treatment needs confirmation.</p>
                          )}
                        </div>
                      )}

                      <div className="p-3 bg-surface-container-low rounded border border-neutral-border">
                        <div className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider mb-0.5">Marital Status</div>
                        <div className="font-semibold text-sm text-on-surface flex items-center gap-1.5">
                          <Heart className="w-3.5 h-3.5 text-primary" /> {selectedEmployee.maritalStatus || 'Single'}
                        </div>
                      </div>

                      {/* Row 4 */}
                      <div className="p-3 bg-surface-container-low rounded border border-neutral-border">
                        <div className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider mb-0.5">Date of Joined</div>
                        <div className="font-mono text-sm font-semibold text-on-surface flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-primary" /> {formatToDDMMMYYYY(selectedEmployee.dateOfJoined)}
                        </div>
                      </div>

                      {(selectedEmployee.status === 'Active - Probation' ||
                        selectedEmployee.status === 'Active - Confirmation' ||
                        selectedEmployee.employmentType === 'Confirmation' ||
                        selectedEmployee.employmentType === 'Probation') && (
                        <div className="p-3 bg-surface-container-low rounded border border-neutral-border">
                          <div className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider mb-0.5">Date of Confirmation</div>
                          <div className="font-mono text-sm font-semibold text-on-surface flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-primary" /> {formatToDDMMMYYYY(selectedEmployee.dateOfConfirmation)}
                          </div>
                        </div>
                      )}

                      <div className="p-3 bg-surface-container-low rounded border border-neutral-border">
                        <div className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider mb-0.5">Payroll Registry Status</div>
                        <div className="mt-0.5">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                            getEmployeeStatusClasses(selectedEmployeeStatus || selectedEmployee.status).badge
                          }`}>
                            {selectedEmployeeStatus || selectedEmployee.status}
                          </span>
                        </div>
                      </div>

                      {/* Row 5: Subsidiary Mapping */}
                      <div className="p-3 bg-primary/5 rounded border border-primary/20 sm:col-span-2">
                        <div className="text-primary font-bold text-[10px] uppercase tracking-wider mb-0.5">Corporate Subsidiary / Entity</div>
                        <div className="font-bold text-sm text-primary flex items-center gap-1.5">
                          <span className="bg-primary text-[#f7f0e0] text-[10px] font-bold px-1.5 py-0.5 rounded mr-1">OFFICIAL REGISTER</span>
                          {entities.find(e => e.id === selectedEmployee.entityId)?.name || selectedEmployee.entityId}
                        </div>
                      </div>
                    </div>

                    {/* Emergency Contacts Card */}
                    <div className="p-4 bg-zinc-50 border border-neutral-border rounded-lg space-y-3">
                      <div className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-error" /> EMERGENCY CONTACT INFORMATION
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-outline text-[10px] block font-bold">Contact Person Name</span>
                          <span className="font-bold text-on-surface">{selectedEmployee.emergencyContactName || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-outline text-[10px] block font-bold">Relationship</span>
                          <span className="font-semibold text-on-surface-variant">{selectedEmployee.emergencyContactRelation || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-outline text-[10px] block font-bold">Contact Phone Number</span>
                          <span className="font-mono font-bold text-primary">{selectedEmployee.emergencyContactPhone || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Financial Baseline Information */}
                    <div className="p-4 border border-neutral-border rounded-lg bg-surface-container-low/30 space-y-3">
                      <div className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-primary" /> BASELINE COMPENSATION STRUCTURE
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-outline text-[9px] block uppercase font-bold">Basic Monthly Base</span>
                          <span className="font-mono font-bold text-sm text-primary">RM {selectedEmployee.basicSalary.toLocaleString()}</span>
                        </div>
                        {ADD_EMPLOYEE_ALLOWANCE_OPTIONS
                          .filter(option => getEmployeeAllowanceAmount(selectedEmployee, option.value) > 0)
                          .map(option => (
                            <div key={option.value}>
                              <span className="text-outline text-[9px] block uppercase font-bold">{option.label}</span>
                              <span className="font-mono text-on-surface">
                                RM {getEmployeeAllowanceAmount(selectedEmployee, option.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4 text-xs">
                    {/* General Details Section */}
                    <div className="bg-neutral-50 p-4 border border-neutral-border rounded-lg space-y-3">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">Corporate & Personal Particulars</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Update Profile Photo</label>
                          <FilePond
                            allowImagePreview={true}
                            maxFiles={1}
                            acceptedFileTypes={['image/*']}
                            labelIdle='Drag & Drop profile image or <span class="filepond--label-action">Browse</span>'
                            onupdatefiles={(fileItems) => {
                              const file = fileItems[0]?.file;
                              if (file) {
                                uploadDetailAvatarFile(selectedEmployee.id, file as File);
                              }
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Employee Name</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(toUppercase(e.target.value))}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Email Address</label>
                          <input
                            type="email"
                            disabled={editEmailFillLater}
                            value={editEmailFillLater ? '' : editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs disabled:bg-neutral-100"
                          />
                          <label className="mt-1.5 flex items-center gap-2 text-[10px] font-semibold text-on-surface-variant cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editEmailFillLater}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setEditEmailFillLater(checked);
                                if (checked) setEditEmail('');
                              }}
                              className="h-3.5 w-3.5 rounded accent-primary"
                            />
                            Fill up later
                          </label>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Role / Designation</label>
                          <select
                            value={editDesignation}
                            onChange={(e) => setEditDesignation(e.target.value)}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs font-semibold text-primary"
                          >
                            {(() => {
                              const rolesToRender = [...availableRoles];
                              if (editDesignation && !rolesToRender.includes(editDesignation)) {
                                rolesToRender.push(editDesignation);
                              }
                              return rolesToRender.map(r => (
                                <option key={r} value={r}>{r}</option>
                              ));
                            })()}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Department</label>
                          <select
                            value={editDepartment}
                            onChange={(e) => setEditDepartment(e.target.value)}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs font-semibold text-primary"
                          >
                            {(() => {
                              const deptsToRender = [...availableDepartments];
                              if (editDepartment && !deptsToRender.includes(editDepartment)) {
                                deptsToRender.push(editDepartment);
                              }
                              return deptsToRender.map(d => (
                                <option key={d} value={d}>{d}</option>
                              ));
                            })()}
                          </select>
                        </div>
                        <div style={{ display: 'none' }}>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Corporate Subsidiary</label>
                          <select
                            value={editEntityId}
                            onChange={(e) => setEditEntityId(e.target.value)}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs"
                          >
                            {entities.map(ent => (
                              <option key={ent.id} value={ent.id}>{ent.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Status</label>
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value as any)}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs"
                          >
                            {EMPLOYEE_STATUS_OPTIONS.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">NRIC / Passport</label>
                          <input
                            type="text"
                            value={editNricPassport}
                            onChange={(e) => {
                              const nextNric = formatNricOrPassport(e.target.value);
                              setEditNricPassport(nextNric);
                              if (isEditSocsoNumberAutoFilled) {
                                setEditSocsoNumber(nextNric.replace(/-/g, ''));
                              }
                            }}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Nationality</label>
                          <input
                            type="text"
                            value={editNationality}
                            onChange={(e) => setEditNationality(toUppercase(e.target.value))}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Contact Number</label>
                          <input
                            type="text"
                            disabled={editContactNumberFillLater}
                            value={editContactNumberFillLater ? '' : editContactNumber}
                            onChange={(e) => setEditContactNumber(e.target.value)}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs disabled:bg-neutral-100"
                          />
                          <label className="mt-1.5 flex items-center gap-2 text-[10px] font-semibold text-on-surface-variant cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editContactNumberFillLater}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setEditContactNumberFillLater(checked);
                                if (checked) setEditContactNumber('');
                              }}
                              className="h-3.5 w-3.5 rounded accent-primary"
                            />
                            Fill up later
                          </label>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Employment Type</label>
                          <select
                            value={editEmploymentType}
                            onChange={(e) => setEditEmploymentType(e.target.value)}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs"
                          >
                            <option value="Internship">Internship</option>
                            <option value="Probation">Probation</option>
                            <option value="Confirmation">Confirmation</option>
	                            <option value="Permanent">Permanent</option>
	                            <option value="Contract">Contract</option>
	                            <option value="Fixed Term Contract">Fixed Term Contract</option>
	                            <option value="Independent Contractor">Independent Contractor</option>
	                            <option value="Part Time">Part Time</option>
	                          </select>
	                        </div>
	                        {isContractEmploymentType(editEmploymentType) && (
	                          <div>
	                            <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Contract Payroll Treatment</label>
	                            <select
	                              value={editContractStatutoryTreatment}
	                              onChange={(e) => setEditContractStatutoryTreatment(e.target.value as NonNullable<Employee['contractStatutoryTreatment']>)}
	                              className="w-full bg-white border border-primary/40 rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs font-semibold text-primary"
	                            >
	                              <option value="with_statutory">Salary with Statutory</option>
	                              <option value="without_statutory">Service Fees without Statutory</option>
	                            </select>
	                          </div>
	                        )}
	                        <div className="sm:col-span-2 rounded border border-primary/20 bg-primary/5 p-2 text-[10px] text-primary">
	                          {(() => {
	                            const profile = getPayrollDocumentProfile({
	                              employmentType: editEmploymentType as Employee['employmentType'],
	                              contractStatutoryTreatment: isContractEmploymentType(editEmploymentType) ? editContractStatutoryTreatment : undefined
	                            });
	                            return (
	                              <span className="font-semibold">
	                                Payroll output: {profile.documentType} / {profile.compensationLabel}
	                                {profile.statutoryEnabled ? ' with statutory' : ' without statutory'}.
	                              </span>
	                            );
	                          })()}
	                        </div>
	                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Date Joined</label>
                          <input
                            type="date"
                            value={editDateOfJoined}
                            onChange={(e) => setEditDateOfJoined(e.target.value)}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs"
                          />
                        </div>
                        {isEditProbationStatus && (
                          <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded border border-primary/25 bg-primary/5 p-3">
                            <div>
                              <label className="block text-[10px] font-bold text-primary uppercase mb-1">Duration of Probation (Months)</label>
                              <input
                                type="number"
                                min="1"
                                value={editProbationDurationMonths}
                                onChange={(e) => {
                                  setEditProbationDurationMonths(Number(e.target.value));
                                  setEditConfirmationDateAuto(true);
                                }}
                                className="w-full bg-white border border-primary/30 rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-primary uppercase mb-1">Date of Confirmation</label>
                              <input
                                type="date"
                                value={editDateOfConfirmation}
                                onChange={(e) => {
                                  setEditDateOfConfirmation(e.target.value);
                                  setEditConfirmationDateAuto(false);
                                }}
                                className="w-full bg-white border border-primary/30 rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs"
                              />
                            </div>
                            <div className="flex flex-col justify-end gap-2">
                              <label className="flex items-center gap-2 text-[11px] font-semibold text-primary cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editProbationExtend}
                                  onChange={(e) => {
                                    setEditProbationExtend(e.target.checked);
                                    setEditConfirmationDateAuto(true);
                                  }}
                                  className="h-3.5 w-3.5 rounded accent-primary"
                                />
                                Probation Extend
                              </label>
                              {editProbationExtend && (
                                <input
                                  type="number"
                                  min="1"
                                  value={editProbationExtensionMonths}
                                  onChange={(e) => {
                                    setEditProbationExtensionMonths(Number(e.target.value));
                                    setEditConfirmationDateAuto(true);
                                  }}
                                  placeholder="Additional months"
                                  className="w-full bg-white border border-primary/30 rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs"
                                />
                              )}
                            </div>
                          </div>
                        )}
                        {isEditConfirmationStatus && !isEditProbationStatus && (
                          <div>
                            <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Date of Confirmation</label>
                            <input
                              type="date"
                              value={editDateOfConfirmation}
                              onChange={(e) => setEditDateOfConfirmation(e.target.value)}
                              className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Financial & Allowances Details Section */}
                    <div className="bg-neutral-50 p-4 border border-neutral-border rounded-lg space-y-3">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">Baseline Compensation & Allowances</span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1.5">Basic Monthly Base (RM)</label>
                          <input
                            type="number"
                            value={editBasicSalary}
                            onChange={(e) => setEditBasicSalary(Number(e.target.value))}
                            className="w-full bg-white border border-neutral-border rounded-md px-2.5 py-2.5 focus:ring-1 focus:ring-primary outline-none text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1.5">Employee EPF Rate (%)</label>
                          <input
                            type="number"
                            value={editEpfRateEmployee}
                            onChange={(e) => setEditEpfRateEmployee(Number(e.target.value))}
                            className="w-full bg-white border border-neutral-border rounded-md px-2.5 py-2.5 focus:ring-1 focus:ring-primary outline-none text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1.5">Employer EPF Rate (%)</label>
                          <input
                            type="number"
                            value={editEpfRateEmployer}
                            onChange={(e) => setEditEpfRateEmployer(Number(e.target.value))}
                            className="w-full bg-white border border-neutral-border rounded-md px-2.5 py-2.5 focus:ring-1 focus:ring-primary outline-none text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1.5">TIN Number (Tax Number)</label>
                          <input
                            type="text"
                            value={editTaxNumber}
                            onChange={(e) => setEditTaxNumber(toUppercase(e.target.value))}
                            className="w-full bg-white border border-neutral-border rounded-md px-2.5 py-2.5 focus:ring-1 focus:ring-primary outline-none text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1.5">KWSP Number (EPF)</label>
                          <input
                            type="text"
                            value={editEpfNumber}
                            onChange={(e) => setEditEpfNumber(toUppercase(e.target.value))}
                            className="w-full bg-white border border-neutral-border rounded-md px-2.5 py-2.5 focus:ring-1 focus:ring-primary outline-none text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1.5">SOCSO Number</label>
                          <input
                            type="text"
                            value={editSocsoNumber}
                            onChange={(e) => {
                              setEditSocsoNumber(e.target.value.replace(/-/g, ''));
                              setIsEditSocsoNumberAutoFilled(false);
                            }}
                            className="w-full bg-white border border-neutral-border rounded-md px-2.5 py-2.5 focus:ring-1 focus:ring-primary outline-none text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1.5">Bank Name</label>
                          <input
                            type="text"
                            list="employee-edit-bank-options"
                            value={editBankName}
                            onChange={(e) => setEditBankName(toUppercase(e.target.value))}
                            placeholder="Select or enter bank name"
                            className="w-full bg-white border border-neutral-border rounded-md px-2.5 py-2.5 focus:ring-1 focus:ring-primary outline-none text-sm"
                          />
                          <datalist id="employee-edit-bank-options">
                            {MALAYSIAN_BANK_NAMES.map(bank => <option key={bank} value={bank} />)}
                          </datalist>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1.5">Bank Account Number</label>
                          <input
                            type="text"
                            value={editAccountNo}
                            onChange={(e) => setEditAccountNo(toUppercase(e.target.value))}
                            className="w-full bg-white border border-neutral-border rounded-md px-2.5 py-2.5 focus:ring-1 focus:ring-primary outline-none text-sm"
                          />
                        </div>
                        <div className="sm:col-span-3 rounded-md border border-dashed border-[#e9c9c4] bg-[#fffaf9] p-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold text-on-surface-variant">
                              Only applicable allowances are shown. Add another when needed.
                            </p>
                            <button
                              type="button"
                              onClick={handleAddEditAllowance}
                              disabled={!getNextEditAllowanceType()}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#fff0ee] px-3 py-2 text-[10px] font-bold text-[#b3261e] transition hover:bg-[#ffe2de] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Plus className="h-3.5 w-3.5" /> Add allowance
                            </button>
                          </div>
                          {editVisibleAllowanceTypes.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {editVisibleAllowanceTypes.map((allowanceType) => (
                                <div key={allowanceType} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_auto]">
                                  <select
                                    value={allowanceType}
                                    onChange={(e) => handleChangeEditAllowanceType(allowanceType, e.target.value as AddEmployeeAllowanceKey)}
                                    className="w-full rounded border border-neutral-border bg-white p-2 text-xs font-semibold text-on-surface outline-none focus:ring-1 focus:ring-primary"
                                  >
                                    {ADD_EMPLOYEE_ALLOWANCE_OPTIONS
                                      .filter(option =>
                                        option.value === allowanceType ||
                                        !editVisibleAllowanceTypes.includes(option.value)
                                      )
                                      .map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                  </select>
                                  <div className="relative">
                                    <span className="absolute left-2 top-2 text-[10px] text-outline">RM</span>
                                    <input
                                      type="number"
                                      min="0"
                                      value={getEditAllowanceAmount(allowanceType)}
                                      onChange={(e) => setEditAllowanceAmount(allowanceType, Number(e.target.value))}
                                      className="w-full rounded border border-neutral-border bg-white py-2 pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveEditAllowance(allowanceType)}
                                    className="inline-flex h-9 items-center justify-center rounded border border-red-200 bg-red-50 px-3 text-red-600 transition hover:bg-red-100"
                                    aria-label="Remove allowance"
                                  >
                                    <Trash className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Emergency Contacts Section */}
                    <div className="bg-neutral-50 p-4 border border-neutral-border rounded-lg space-y-3">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">Emergency Contacts</span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Person Name</label>
                          <input
                            type="text"
                            disabled={editEmergencyContactFillLater}
                            value={editEmergencyContactFillLater ? '' : editEmergencyContactName}
                            onChange={(e) => setEditEmergencyContactName(toUppercase(e.target.value))}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs disabled:bg-neutral-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Relationship</label>
                          <input
                            type="text"
                            disabled={editEmergencyContactFillLater}
                            value={editEmergencyContactFillLater ? '' : editEmergencyContactRelation}
                            onChange={(e) => setEditEmergencyContactRelation(toUppercase(e.target.value))}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs disabled:bg-neutral-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Phone Number</label>
                          <input
                            type="text"
                            disabled={editEmergencyContactFillLater}
                            value={editEmergencyContactFillLater ? '' : editEmergencyContactPhone}
                            onChange={(e) => setEditEmergencyContactPhone(toUppercase(e.target.value))}
                            className="w-full bg-white border border-neutral-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none text-xs disabled:bg-neutral-100"
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-[10px] font-semibold text-on-surface-variant cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editEmergencyContactFillLater}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setEditEmergencyContactFillLater(checked);
                            if (checked) {
                              setEditEmergencyContactName('');
                              setEditEmergencyContactRelation('');
                              setEditEmergencyContactPhone('');
                            }
                          }}
                          className="h-3.5 w-3.5 rounded accent-primary"
                        />
                        Fill up later
                      </label>
                    </div>
                  </div>
                )}

                {/* Category: Statutory Settings */}
                <div className="p-4 border border-neutral-border rounded-lg bg-surface-container-low/35 space-y-4">
                  <div className="flex justify-between items-center border-b border-neutral-border/50 pb-2">
                    <h4 className="font-bold text-xs text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-primary" /> Statutory Settings
                    </h4>
                    {!activeStatutoryDocumentProfile?.statutoryEnabled ? (
                      <span className="rounded bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                        Not applicable
                      </span>
                    ) : isEditingGeneralInfo ? (
                      <span className="rounded bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                        Editing with profile
                      </span>
                    ) : null}
                  </div>

                  {!activeStatutoryDocumentProfile?.statutoryEnabled ? (
                    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                      Not applicable for this employment type. Statutory deductions and employer contributions will remain RM 0.00.
                    </div>
                  ) : !isEditingGeneralInfo ? (
                    /* VIEW MODE: Tick box for opt in, Cross box for opt out */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between items-center bg-white p-2 rounded border border-neutral-border/50 shadow-xs">
                        <span className="font-semibold text-on-surface">KWSP (EPF)</span>
                        <div>
                          {selectedEmployee.optInEpf !== false ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" /> Opt In (✓)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              <XSquare className="w-3.5 h-3.5 text-rose-600" /> Opt Out (✕)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center bg-white p-2 rounded border border-neutral-border/50 shadow-xs">
                        <span className="font-semibold text-on-surface">PERKESO (SOCSO)</span>
                        <div>
                          {selectedEmployee.optInSocso !== false ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" /> Opt In (✓)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              <XSquare className="w-3.5 h-3.5 text-rose-600" /> Opt Out (✕)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center bg-white p-2 rounded border border-neutral-border/50 shadow-xs">
                        <span className="font-semibold text-on-surface">EIS</span>
                        <div>
                          {selectedEmployee.optInEis !== false ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" /> Opt In (✓)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              <XSquare className="w-3.5 h-3.5 text-rose-600" /> Opt Out (✕)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center bg-white p-2 rounded border border-neutral-border/50 shadow-xs">
                        <span className="font-semibold text-on-surface">Income Tax (PCB)</span>
                        <div>
                          {selectedEmployee.optInPcb !== false ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" /> Opt In (✓)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              <XSquare className="w-3.5 h-3.5 text-rose-600" /> Opt Out (✕)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="col-span-1 sm:col-span-2 flex justify-between items-center bg-white p-2 rounded border border-neutral-border/50 shadow-xs">
                        <span className="font-semibold text-on-surface">PERKESO - Lindung 24 Jam</span>
                        <div>
                          {selectedEmployee.enableLindung24 ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" /> Opt In (✓)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              <XSquare className="w-3.5 h-3.5 text-rose-600" /> Opt Out (✕)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* EDIT MODE: Tick boxes */
                    <div className="space-y-3 text-xs bg-white p-3 border border-neutral-border rounded-md">
                      <span className="text-[11px] font-bold text-primary block mb-2">Tick for Opt In (✓), untick for Opt Out (✕):</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="flex items-center gap-2 p-2 border rounded hover:bg-neutral-50 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editOptInEpf}
                            onChange={(e) => setEditOptInEpf(e.target.checked)}
                            className="w-4 h-4 text-primary rounded accent-primary cursor-pointer"
                          />
                          <span className="font-semibold text-on-surface">KWSP (EPF)</span>
                          {editOptInEpf ? (
                            <span className="text-[10px] text-emerald-700 font-bold ml-auto">(✓ Opt In)</span>
                          ) : (
                            <span className="text-[10px] text-rose-700 font-bold ml-auto">(✕ Opt Out)</span>
                          )}
                        </label>

                        <label className="flex items-center gap-2 p-2 border rounded hover:bg-neutral-50 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editOptInSocso}
                            onChange={(e) => setEditOptInSocso(e.target.checked)}
                            className="w-4 h-4 text-primary rounded accent-primary cursor-pointer"
                          />
                          <span className="font-semibold text-on-surface">PERKESO (SOCSO)</span>
                          {editOptInSocso ? (
                            <span className="text-[10px] text-emerald-700 font-bold ml-auto">(✓ Opt In)</span>
                          ) : (
                            <span className="text-[10px] text-rose-700 font-bold ml-auto">(✕ Opt Out)</span>
                          )}
                        </label>

                        <label className="flex items-center gap-2 p-2 border rounded hover:bg-neutral-50 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editOptInEis}
                            onChange={(e) => setEditOptInEis(e.target.checked)}
                            className="w-4 h-4 text-primary rounded accent-primary cursor-pointer"
                          />
                          <span className="font-semibold text-on-surface">EIS</span>
                          {editOptInEis ? (
                            <span className="text-[10px] text-emerald-700 font-bold ml-auto">(✓ Opt In)</span>
                          ) : (
                            <span className="text-[10px] text-rose-700 font-bold ml-auto">(✕ Opt Out)</span>
                          )}
                        </label>

                        <label className="flex items-center gap-2 p-2 border rounded hover:bg-neutral-50 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editOptInPcb}
                            onChange={(e) => setEditOptInPcb(e.target.checked)}
                            className="w-4 h-4 text-primary rounded accent-primary cursor-pointer"
                          />
                          <span className="font-semibold text-on-surface">Income Tax (PCB)</span>
                          {editOptInPcb ? (
                            <span className="text-[10px] text-emerald-700 font-bold ml-auto">(✓ Opt In)</span>
                          ) : (
                            <span className="text-[10px] text-rose-700 font-bold ml-auto">(✕ Opt Out)</span>
                          )}
                        </label>

                        <label className="sm:col-span-2 flex items-center gap-2 p-2 border rounded hover:bg-neutral-50 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editEnableLindung24}
                            onChange={(e) => setEditEnableLindung24(e.target.checked)}
                            className="w-4 h-4 text-primary rounded accent-primary cursor-pointer"
                          />
                          <span className="font-semibold text-on-surface">PERKESO - Lindung 24 Jam</span>
                          {editEnableLindung24 ? (
                            <span className="text-[10px] text-emerald-700 font-bold ml-auto">(✓ Opt In)</span>
                          ) : (
                            <span className="text-[10px] text-rose-700 font-bold ml-auto">(✕ Opt Out)</span>
                          )}
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Spouse & Dependants Registry Card */}
                <div className="p-4 border border-neutral-border rounded-lg bg-surface-container-low/35 space-y-4">
                  <div className="flex justify-between items-center border-b border-neutral-border/50 pb-2">
                    <h4 className="font-bold text-xs text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-primary" /> Spouse & Dependant Compliance Registry
                    </h4>
                    {!isEditingFamily ? (
                      <button 
                        type="button"
                        onClick={handleStartEditFamily}
                        className="text-primary hover:bg-primary/10 px-2 py-1 rounded transition-colors text-xs font-semibold cursor-pointer border border-primary/20"
                      >
                        Edit Family Info
                      </button>
                    ) : (
                      <div className="flex gap-1.5">
                        <button 
                          type="button"
                          onClick={() => setIsEditingFamily(false)}
                          className="text-on-surface-variant hover:bg-surface-container px-2 py-1 rounded transition-colors text-xs font-semibold cursor-pointer border border-neutral-border"
                        >
                          Cancel
                        </button>
                        <button 
                          type="button"
                          onClick={handleSaveFamilyUpdates}
                          disabled={savingAction === 'family'}
                          className="bg-primary text-white hover:bg-primary-container px-2 py-1 rounded transition-colors text-xs font-semibold cursor-pointer"
                        >
                          {savingAction === 'family' ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>

                  {!isEditingFamily ? (
                    /* VIEW MODE */
                    <div className="space-y-4 text-xs">
                      {/* Marital Status and summary */}
                      <div className="flex justify-between items-center">
                        <span className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider">Marital Status Status</span>
                        <span className="font-bold text-on-surface bg-surface-container-high px-2 py-0.5 rounded flex items-center gap-1">
                          <Heart className="w-3 h-3 text-primary fill-primary" /> {selectedEmployee.maritalStatus || 'Single'}
                        </span>
                      </div>

                      {/* Married -> Spouse Details */}
                      {selectedEmployee.maritalStatus === 'Married' ? (
                        <div className="p-3 bg-white border border-neutral-border/60 rounded-md space-y-2">
                          <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5" /> Spouse Details
                          </span>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                            <div>
                              <span className="text-outline text-[9px] uppercase font-bold block">Spouse Name</span>
                              <span className="font-semibold text-on-surface">{selectedEmployee.spouseName || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-outline text-[9px] uppercase font-bold block">Spouse NRIC</span>
                              <span className="font-mono font-semibold text-on-surface">{selectedEmployee.spouseNric || 'N/A'}</span>
                            </div>
                            <div className="col-span-2 border-t border-neutral-border/30 pt-1.5 mt-1">
                              <span className="text-outline text-[9px] uppercase font-bold block mb-0.5">Employment Status</span>
                              <span className={`inline-block font-bold px-1.5 py-0.25 rounded text-[10px] ${
                                selectedEmployee.spouseIsWorking === 'Yes' ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-600'
                              }`}>
                                {selectedEmployee.spouseIsWorking === 'Yes' ? 'Working' : 'Not Working'}
                              </span>
                            </div>
                            {selectedEmployee.spouseIsWorking === 'Yes' && (
                              <>
                                <div>
                                  <span className="text-outline text-[9px] uppercase font-bold block">Company</span>
                                  <span className="font-semibold text-on-surface flex items-center gap-1">
                                    <Building2 className="w-3 h-3 text-outline shrink-0" /> {selectedEmployee.spouseCompany || 'N/A'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-outline text-[9px] uppercase font-bold block">Position Title</span>
                                  <span className="font-semibold text-on-surface-variant">{selectedEmployee.spousePosition || 'N/A'}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ) : null}

                      {true ? (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider">Has Dependants?</span>
                            <span className={`font-bold px-2 py-0.25 rounded text-[10px] ${
                              selectedEmployee.hasDependants === 'Yes' ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-600'
                            }`}>
                              {selectedEmployee.hasDependants === 'Yes' ? 'Yes' : 'No'}
                            </span>
                          </div>

                          {selectedEmployee.hasDependants === 'Yes' && (
                            <div className="bg-white border border-neutral-border/60 rounded-md overflow-hidden">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-neutral-light border-b border-neutral-border text-[10px] uppercase text-on-surface-variant font-bold">
                                  <tr>
                                    <th className="p-2">Name</th>
                                    <th className="p-2 w-20">Gender</th>
                                    <th className="p-2 w-24">DOB</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-border/30">
                                  {(() => {
                                    let depsArray: any[] = [];
                                    if (Array.isArray(selectedEmployee.dependants)) {
                                      depsArray = selectedEmployee.dependants;
                                    } else if (typeof selectedEmployee.dependants === 'string' && selectedEmployee.dependants) {
                                      try {
                                        depsArray = JSON.parse(selectedEmployee.dependants);
                                      } catch (err) {
                                        depsArray = [];
                                      }
                                    }
                                    return depsArray.length > 0 ? (
                                      depsArray.map((dep: any) => (
                                        <tr key={dep.id} className="hover:bg-neutral-light/20">
                                          <td className="p-2 font-semibold text-on-surface">{dep.name}</td>
                                          <td className="p-2">{dep.gender}</td>
                                          <td className="p-2 font-mono">{formatToDDMMMYYYY(dep.dob)}</td>
                                        </tr>
                                      ))
                                    ) : (
                                      <tr>
                                        <td colSpan={3} className="p-3 text-center italic text-on-surface-variant">
                                          No dependants listed
                                        </td>
                                      </tr>
                                    );
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Single */
                        <div className="p-3 bg-zinc-50 border border-neutral-border/40 rounded text-center text-on-surface-variant italic">
                          Single status. Spouse & Dependant details are not applicable for this profile category.
                        </div>
                      )}
                    </div>
                  ) : (
                    /* EDIT MODE */
                    <div className="space-y-4 text-xs">
                      {/* Marital Status select */}
                      <div>
                        <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Marital Status Status</label>
                        <select
                          value={editMaritalStatus} onChange={(e) => setEditMaritalStatus(e.target.value as any)}
                          className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs focus:ring-1 focus:ring-primary outline-none font-semibold"
                        >
                          <option value="Single">Single</option>
                          <option value="Married">Married</option>
                          <option value="Divorced">Divorced</option>
                          <option value="Widowed">Widowed</option>
                        </select>
                      </div>

                      {/* Married -> Spouse Details */}
                      {editMaritalStatus === 'Married' && (
                        <div className="p-3 bg-primary/5 border border-primary/25 rounded-md space-y-3 animate-in fade-in duration-150">
                          <span className="text-xs font-bold text-primary block">Spouse Details Form</span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Spouse Name</label>
                              <input 
                                type="text"
                                value={editSpouseName} onChange={(e) => setEditSpouseName(toUppercase(e.target.value))}
                                className="w-full bg-white border border-neutral-border rounded p-1 text-[11px] outline-none"
                                placeholder="Name"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Spouse NRIC</label>
                              <input 
                                type="text"
                                value={editSpouseNric} onChange={(e) => setEditSpouseNric(toUppercase(e.target.value))}
                                className="w-full bg-white border border-neutral-border rounded p-1 text-[11px] outline-none"
                                placeholder="NRIC"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Spouse Working?</label>
                              <select
                                value={editSpouseIsWorking} onChange={(e) => setEditSpouseIsWorking(e.target.value as any)}
                                className="w-full bg-white border border-neutral-border rounded p-1 text-[11px] outline-none font-semibold"
                              >
                                <option value="No">No</option>
                                <option value="Yes">Yes</option>
                              </select>
                            </div>
                          </div>

                          {editSpouseIsWorking === 'Yes' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1.5 border-t border-primary/10 animate-in slide-in-from-top-1">
                              <div>
                                <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Working Company</label>
                                <input 
                                  type="text"
                                  value={editSpouseCompany} onChange={(e) => setEditSpouseCompany(toUppercase(e.target.value))}
                                  className="w-full bg-white border border-neutral-border rounded p-1 text-[11px] outline-none"
                                  placeholder="Company"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Position Title</label>
                                <input 
                                  type="text"
                                  value={editSpousePosition} onChange={(e) => setEditSpousePosition(toUppercase(e.target.value))}
                                  className="w-full bg-white border border-neutral-border rounded p-1 text-[11px] outline-none"
                                  placeholder="Position"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Dependants details */}
                      {true && (
                        <div className="p-3 bg-zinc-50 border border-neutral-border rounded-md space-y-3 animate-in fade-in duration-150">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-on-surface uppercase tracking-wider block">Do you have dependants?</span>
                            <select
                              value={editHasDependants} onChange={(e) => setEditHasDependants(e.target.value as any)}
                              className="bg-white border border-neutral-border rounded p-1 text-xs focus:ring-1 focus:ring-primary outline-none"
                            >
                              <option value="No">No</option>
                              <option value="Yes">Yes</option>
                            </select>
                          </div>

                          {editHasDependants === 'Yes' && (
                            <div className="space-y-2 pt-2 border-t border-neutral-border/60">
                              <span className="text-[10px] font-bold text-primary uppercase block">Dependants (Max 10 Pax)</span>
                              
                              {editDependants.length > 0 ? (
                                <div className="border border-neutral-border/50 rounded overflow-hidden max-h-[140px] overflow-y-auto">
                                  <table className="w-full text-xs text-left bg-white">
                                    <thead className="bg-neutral-light border-b border-neutral-border text-[10px] text-on-surface-variant font-bold">
                                      <tr>
                                        <th className="p-1.5">Name</th>
                                        <th className="p-1.5 w-16">Gender</th>
                                        <th className="p-1.5 w-20">DOB</th>
                                        <th className="p-1.5 text-right w-10"></th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-border/30">
                                      {editDependants.map((dep) => (
                                        <tr key={dep.id} className="hover:bg-neutral-light/10">
                                          <td className="p-1.5 font-semibold text-on-surface">{dep.name}</td>
                                          <td className="p-1.5">{dep.gender}</td>
                                          <td className="p-1.5 font-mono">{formatToDDMMMYYYY(dep.dob)}</td>
                                          <td className="p-1.5 text-right">
                                            <button 
                                              type="button"
                                              onClick={() => handleRemoveDetailDependant(dep.id)}
                                              className="text-error hover:text-red-700 p-0.5 cursor-pointer"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="text-[11px] italic text-on-surface-variant bg-white p-2 rounded border border-neutral-border/40 text-center">
                                  No dependants added yet. Specify fields below to add.
                                </div>
                              )}

                              {editDependants.length < 10 && (
                                <div className="bg-white p-2.5 rounded border border-neutral-border/40 space-y-2">
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                                    <div>
                                      <label className="block text-[8px] font-bold text-on-surface-variant uppercase mb-0.5">Name</label>
                                      <input 
                                        type="text"
                                        value={detailTempDepName} onChange={(e) => setDetailTempDepName(toUppercase(e.target.value))}
                                        placeholder="Sally"
                                        className="w-full bg-white border border-neutral-border rounded p-1 text-[10px] outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[8px] font-bold text-on-surface-variant uppercase mb-0.5">Gender</label>
                                      <select
                                        value={detailTempDepGender} onChange={(e) => setDetailTempDepGender(e.target.value as any)}
                                        className="w-full bg-white border border-neutral-border rounded p-1 text-[10px] outline-none"
                                      >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[8px] font-bold text-on-surface-variant uppercase mb-0.5">DOB</label>
                                      <input 
                                        type="date"
                                        value={detailTempDepDob} onChange={(e) => setDetailTempDepDob(e.target.value)}
                                        className="w-full bg-white border border-neutral-border rounded p-1 text-[10px] outline-none"
                                      />
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={handleAddDetailDependant}
                                    className="px-2.5 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-bold hover:bg-primary/20 transition-all cursor-pointer block ml-auto"
                                  >
                                    + Add Dependant ({editDependants.length}/10)
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Single status view inside edit */}
                      {editMaritalStatus === 'Single' && (
                        <div className="p-3 bg-zinc-100 border border-neutral-border/50 rounded text-center text-on-surface-variant italic">
                          Single status active. Spouse details are bypassed.
                        </div>
                      )}

                      <div className="flex gap-2 justify-end pt-2 border-t border-neutral-border/40 font-semibold">
                        <button 
                          type="button"
                          onClick={() => setIsEditingFamily(false)}
                          className="px-3 py-1.5 text-on-surface-variant hover:bg-surface-container rounded text-xs cursor-pointer border border-neutral-border"
                        >
                          Cancel
                        </button>
                        <button 
                          type="button"
                          onClick={handleSaveFamilyUpdates}
                          disabled={savingAction === 'family'}
                          className="px-3 py-1.5 bg-primary text-white hover:bg-primary-container rounded text-xs cursor-pointer"
                        >
                          {savingAction === 'family' ? 'Saving...' : 'Save Family Registry'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                            {/* Right Column: Career Progression Form & Historic Timeline */}
              <div className="lg:col-span-5 p-6 flex flex-col justify-between space-y-6">
                
                {/* Section 1: Change Employment Status (The Action) */}
                <div className="bg-surface-container-low border border-neutral-border p-4 rounded-lg space-y-4">
                  <div className="border-b border-neutral-border pb-2">
                    <h4 className="font-bold text-xs text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-primary" /> Log Career Progression & Status
                    </h4>
                    <p className="text-[10px] text-on-surface-variant">Update active status, promotion, transfers, or base salary revisions.</p>
                  </div>

                  <form onSubmit={handleProgressionSubmit} className="space-y-3 text-xs">
                    
                    {/* Progression Event Selection */}
                    <div>
                      <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Progression Event Type</label>
                      <select 
                        value={progressionType} 
                        onChange={(e) => {
                          setProgressionType(e.target.value as any);
                          setProgressionValue('');
                        }}
                        className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs outline-none"
                      >
                        <option value="Status Change">Status Change</option>
                        <option value="Promotion">Promotion (Designation)</option>
                        <option value="Department Transfer">Department Transfer</option>
                        <option value="Employment Type Change">Employment Type Change</option>
                        <option value="Salary Revision">Salary Revision</option>

                      </select>
                    </div>

                    {/* New Value input dependent on the Selection Type */}
                    <div>
                      <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">
                        New Value / Assignment *
                      </label>
                      
                      {progressionType === 'Status Change' && (
                        <select 
                          value={progressionValue} 
                          onChange={(e) => setProgressionValue(e.target.value)}
                          className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs outline-none"
                          required
                        >
                          <option value="">-- Choose Status --</option>
                          {EMPLOYEE_STATUS_OPTIONS.map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      )}

                      {progressionType === 'Promotion' && (
                        <input 
                          type="text" 
                          required
                          value={progressionValue} 
                          onChange={(e) => setProgressionValue(e.target.value)}
                          placeholder="e.g. Lead Product Architect"
                          className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs outline-none"
                        />
                      )}

                      {progressionType === 'Department Transfer' && (
                        <select 
                          value={progressionValue} 
                          onChange={(e) => setProgressionValue(e.target.value)}
                          className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs outline-none"
                          required
                        >
                          <option value="">-- Choose Department --</option>
                          <option value="Engineering">Engineering</option>
                          <option value="Product">Product</option>
                          <option value="Product & Engineering">Product & Engineering</option>
                          <option value="Human Resources">Human Resources</option>
                        </select>
                      )}

                      {progressionType === 'Employment Type Change' && (
                        <select 
                          value={progressionValue} 
                          onChange={(e) => setProgressionValue(e.target.value)}
                          className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs outline-none font-semibold text-primary"
                          required
                        >
                          <option value="">-- Choose Employment Type --</option>
                          <option value="Internship">Internship</option>
                          <option value="Probation">Probation</option>
                          <option value="Permanent">Permanent</option>
                          <option value="Fixed Term Contract">Fixed Term Contract</option>
                          <option value="Independent Contractor">Independent Contractor</option>
                          <option value="Part Time">Part Time</option>
                        </select>
                      )}

                      {progressionType === 'Subsidiary Transfer' && (
                        <select 
                          value={progressionValue} 
                          onChange={(e) => setProgressionValue(e.target.value)}
                          className="w-full bg-white border border-primary/40 rounded p-1.5 text-xs outline-none font-semibold text-primary"
                          required
                        >
                          <option value="">-- Choose New Subsidiary --</option>
                          {entities.map(ent => (
                            <option key={ent.id} value={ent.id}>{ent.name}</option>
                          ))}
                        </select>
                      )}

                      {progressionType === 'Salary Revision' && (
                        <div className="relative">
                          <span className="absolute left-2.5 top-1.5 text-outline text-[10px]">RM</span>
                          <input 
                            type="number" 
                            required 
                            min="1000"
                            value={progressionValue} 
                            onChange={(e) => setProgressionValue(e.target.value)}
                            placeholder="e.g. 10500"
                            className="w-full bg-white border border-neutral-border rounded pl-8 pr-2 py-1.5 text-xs outline-none"
                          />
                        </div>
                      )}
                    </div>

                    {/* Effective Date & Notes */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Effective Date</label>
                        <input 
                          type="date" 
                          required
                          value={progressionDate} 
                          onChange={(e) => setProgressionDate(e.target.value)}
                          className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Administrative Notes</label>
                        <input 
                          type="text" 
                          value={progressionNotes} 
                          onChange={(e) => setProgressionNotes(e.target.value)}
                          placeholder="e.g. Approved by Director"
                          className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs outline-none"
                        />
                      </div>
                    </div>

                    <button 
                      type="submit"
                      className="w-full bg-primary text-white py-2 rounded text-xs font-semibold hover:bg-primary-container transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <History className="w-4 h-4" /> Save Career Progression Event
                    </button>

                  </form>
                </div>

                {/* Section 3: Progression History Log Timeline */}
                <div className="flex-1 space-y-3 min-h-[160px] overflow-hidden flex flex-col">
                  <div className="border-b border-neutral-border pb-2 shrink-0">
                    <h4 className="font-bold text-xs text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <History className="w-4 h-4 text-primary" /> Career Progression Timeline History
                    </h4>
                  </div>

                  <div className="overflow-y-auto max-h-[180px] pr-1 space-y-3 flex-1">
                    {localCareerHistory && localCareerHistory.length > 0 ? (
                      localCareerHistory.map((item, index) => {
                        let badgeColor = "bg-blue-100 text-blue-700";
                        if (item.type === 'Status Change') badgeColor = "bg-amber-100 text-amber-700";
                        if (item.type === 'Salary Revision') badgeColor = "bg-green-100 text-green-700";
                        if (item.type === 'Promotion') badgeColor = "bg-purple-100 text-purple-700";

                        return (
                          <div key={item.id || index} className="relative pl-5 border-l-2 border-neutral-border/60 text-xs text-left">
                            {/* Dot indicator */}
                            <div className="absolute -left-[6px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary" />
                            
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-on-surface text-[11px]">{item.type}</span>
                              <span className="text-[10px] text-outline font-mono">{formatToDDMMMYYYY(item.date)}</span>
                            </div>
                            
                            <span className={`inline-block text-[9px] font-bold px-1.5 py-0.25 rounded my-1 ${badgeColor}`}>
                              {item.previousValue} → {item.newValue}
                            </span>
                            
                            <p className="text-on-surface-variant text-[10px] leading-tight italic bg-zinc-50 p-1.5 rounded border border-zinc-100 mt-1">
                              {item.notes}
                            </p>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-6 text-center text-on-surface-variant italic text-xs">
                        No previous progression events logged. Use the form above to record changes.
                      </div>
                    )}
                  </div>
                </div>

                {/* Staged Career & Salary changes global Save Button */}
                <div className="pt-2 border-t border-neutral-border/40 shrink-0">
                  <button
                    type="button"
                    onClick={handleSaveCareerChanges}
                    disabled={savingAction === 'career'}
                    className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-2.5 rounded text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Save className="w-4 h-4 text-white animate-pulse" /> {savingAction === 'career' ? 'Saving Career & Salary Changes...' : 'Save Career & Salary Changes'}
                  </button>
                </div>

              </div>     </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-border flex justify-end bg-surface-container-low shrink-0">
              <button
                type="button"
                onClick={() => setIsDetailOpen(false)}
                className="px-5 py-2 bg-primary text-white rounded text-xs font-semibold hover:bg-primary-container"
              >
                Close Profile File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Modal: Add Employee Form */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-neutral-border rounded-lg shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-border flex justify-between items-center bg-primary text-white">
              <h3 className="font-bold text-base text-[#f7f0e0] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#f7f0e0]" /> Register New Enterprise Employee Profile
              </h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white transition-colors"
              >
                <X className="w-4 h-4 text-[#f7f0e0]" />
              </button>
            </div>

            {/* Modal Form Submit */}
            <form onSubmit={handleAddSubmit} className="flex-1 flex flex-col overflow-hidden text-left">
              <div className="p-6 overflow-y-auto space-y-4 text-sm">
                
                {/* SECTION 1: Personal Particulars */}
                <div className="border-b border-neutral-border pb-2">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider block">1. PERSONAL PARTICULARS</span>
                </div>

                {/* Profile Graphic Upload */}
                <div className="flex items-center gap-4 p-3 bg-neutral-50 rounded-lg border border-neutral-border/60">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-neutral-200 border border-neutral-border shrink-0 flex items-center justify-center">
                    {formAvatarUrl ? (
                      <img src={formAvatarUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">No Photo</span>
                    )}
                  </div>
                  <div className="text-left">
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">
                      Upload Profile Graphic (Photo)
                    </label>
                    <FilePond
                      allowImagePreview={true}
                      maxFiles={1}
                      acceptedFileTypes={['image/*']}
                      labelIdle='Drag & Drop photo or <span class="filepond--label-action">Browse</span>'
                      onupdatefiles={(fileItems) => {
                        const file = fileItems[0]?.file;
                        if (file) {
                          uploadAvatarFile(file as File);
                        }
                      }}
                    />
                    <span className="block text-[9px] text-zinc-400 mt-1">
                      Supports JPEG, PNG, or GIF. Max 5MB.
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Employee Name *</label>
                    <input 
                      type="text" required
                      value={formName} onChange={(e) => setFormName(toUppercase(e.target.value))}
                      placeholder="Jane Cooper"
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">NRIC / Passport Number *</label>
                    <input 
                      type="text" required
                      value={formNricPassport}
                      onChange={(e) => {
                        const nextNric = formatNricOrPassport(e.target.value);
                        setFormNricPassport(nextNric);
                        setFormSocsoNumber(nextNric.replace(/-/g, ''));
                      }}
                      placeholder="950124-14-5226 / Passport ID"
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Nationality *</label>
                    <input 
                      type="text" required
                      value={formNationality} onChange={(e) => setFormNationality(toUppercase(e.target.value))}
                      placeholder="e.g. Malaysian"
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Contact Number</label>
                    <input
                      type="text"
                      disabled={formContactNumberFillLater}
                      value={formContactNumberFillLater ? '' : formContactNumber}
                      onChange={(e) => setFormContactNumber(e.target.value)}
                      placeholder="+60 12-345 6789"
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none disabled:bg-neutral-100"
                    />
                    <label className="mt-1.5 flex items-center gap-2 text-[10px] font-semibold text-on-surface-variant cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formContactNumberFillLater}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFormContactNumberFillLater(checked);
                          if (checked) setFormContactNumber('');
                        }}
                        className="h-3.5 w-3.5 rounded accent-primary"
                      />
                      Fill up later
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Marital Status</label>
                    <select
                      value={formMaritalStatus} onChange={(e) => setFormMaritalStatus(e.target.value as any)}
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option>Single</option>
                      <option>Married</option>
                      <option>Divorced</option>
                      <option>Widowed</option>
                    </select>
                  </div>
                </div>

                {/* Spouse Details (Only if Marital Status = Married) */}
                {formMaritalStatus === 'Married' && (
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-3 animate-in fade-in duration-200">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider block">Spouse Details</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Spouse Name *</label>
                        <input 
                          type="text" required
                          value={formSpouseName} onChange={(e) => setFormSpouseName(toUppercase(e.target.value))}
                          placeholder="e.g. John Doe"
                          className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Spouse NRIC *</label>
                        <input 
                          type="text" required
                          value={formSpouseNric} onChange={(e) => setFormSpouseNric(toUppercase(e.target.value))}
                          placeholder="e.g. 850320-14-1123"
                          className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Spouse Working?</label>
                        <select
                          value={formSpouseIsWorking} onChange={(e) => setFormSpouseIsWorking(e.target.value as any)}
                          className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                        >
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </select>
                      </div>
                    </div>

                    {/* Enable Column for Working Company and Position Title only if Spouse Working = Yes */}
                    {formSpouseIsWorking === 'Yes' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-in slide-in-from-top-1 duration-150">
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Working Company *</label>
                          <input 
                            type="text" required
                            value={formSpouseCompany} onChange={(e) => setFormSpouseCompany(toUppercase(e.target.value))}
                            placeholder="e.g. Tech Corp Sdn Bhd"
                            className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Position Title *</label>
                          <input 
                            type="text" required
                          value={formSpousePosition} onChange={(e) => setFormSpousePosition(toUppercase(e.target.value))}
                            placeholder="e.g. Software Engineer"
                            className="w-full bg-white border border-neutral-border rounded p-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Email Address</label>
                    <input
                      type="email"
                      disabled={formEmailFillLater}
                      value={formEmailFillLater ? '' : formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="j.cooper@enterprise.com"
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none disabled:bg-neutral-100"
                    />
                    <label className="mt-1.5 flex items-center gap-2 text-[10px] font-semibold text-on-surface-variant cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formEmailFillLater}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFormEmailFillLater(checked);
                          if (checked) setFormEmail('');
                        }}
                        className="h-3.5 w-3.5 rounded accent-primary"
                      />
                      Fill up later
                    </label>
                  </div>
                </div>

                {/* Do you have dependants? */}
                <div className="p-4 bg-zinc-50 border border-neutral-border rounded-lg space-y-4 animate-in fade-in duration-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-on-surface uppercase tracking-wider block">Do you have dependants?</span>
                    <select
                      value={formHasDependants} onChange={(e) => setFormHasDependants(e.target.value as any)}
                      className="bg-white border border-neutral-border rounded p-1 text-xs focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </div>

                  {/* Dependant list & addition if Has Dependants = Yes */}
                  {formHasDependants === 'Yes' && (
                    <div className="space-y-3 pt-2 border-t border-neutral-border/60 animate-in slide-in-from-top-1 duration-150">
                      <span className="text-[11px] font-bold text-primary uppercase block">Dependants Registry (Max. 10 Pax)</span>

                      {/* Dynamic List */}
                      {formDependants.length > 0 ? (
                        <div className="border border-neutral-border/50 rounded overflow-hidden">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-neutral-light border-b border-neutral-border">
                              <tr>
                                <th className="p-2 font-bold text-on-surface-variant">Name</th>
                                <th className="p-2 font-bold text-on-surface-variant w-24">Gender</th>
                                <th className="p-2 font-bold text-on-surface-variant w-28">DOB</th>
                                <th className="p-2 text-right w-12"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-border/40">
                              {formDependants.map((dep, idx) => (
                                <tr key={idx} className="bg-white hover:bg-neutral-light/30">
                                  <td className="p-2 font-semibold text-on-surface">{dep.name}</td>
                                  <td className="p-2">{dep.gender}</td>
                                  <td className="p-2 font-mono">{formatToDDMMMYYYY(dep.dob)}</td>
                                  <td className="p-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveFormDependant(idx)}
                                      className="text-error hover:text-red-700 p-1 cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-xs italic text-on-surface-variant bg-white p-3 rounded border border-neutral-border/40 text-center">
                          No dependants added yet. Please specify details below to add.
                        </div>
                      )}

                      {/* Interactive addition fields */}
                      {formDependants.length < 10 && (
                        <div className="bg-white p-3 rounded border border-neutral-border/40 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Dependant Name</label>
                              <input
                                type="text"
                                value={tempDepName}
                                onChange={(e) => setTempDepName(toUppercase(e.target.value))}
                                placeholder="e.g. Sally Doe"
                                className="w-full bg-white border border-neutral-border rounded p-1 text-[11px] outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Gender</label>
                              <select
                                value={tempDepGender}
                                onChange={(e) => setTempDepGender(e.target.value as any)}
                                className="w-full bg-white border border-neutral-border rounded p-1 text-[11px] outline-none"
                              >
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-on-surface-variant uppercase mb-1">Date of Birth</label>
                              <input
                                type="date"
                                value={tempDepDob}
                                onChange={(e) => setTempDepDob(e.target.value)}
                                className="w-full bg-white border border-neutral-border rounded p-1 text-[11px] outline-none"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleAddFormDependant}
                            className="px-3 py-1 bg-primary/10 text-primary rounded text-[11px] font-bold hover:bg-primary/20 transition-all cursor-pointer block ml-auto"
                          >
                            + Add Dependant ({formDependants.length}/10)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* SECTION 2: Corporate & Contract Mapping */}
                <div className="border-b border-neutral-border pb-2 pt-2">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider block">2. CORPORATE REGISTRY</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div style={{ display: 'none' }}>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Company Subsidiary *</label>
                    <select
                      value={formEntityId} onChange={(e) => setFormEntityId(e.target.value)}
                      className="w-full bg-white border border-primary/30 rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none font-semibold text-primary"
                    >
                      {entities.map(ent => (
                        <option key={ent.id} value={ent.id}>{ent.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Department</label>
                    <select
                      value={formDepartment} onChange={(e) => setFormDepartment(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none font-semibold text-primary"
                    >
                      {availableDepartments.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Designation / Role *</label>
                    <select
                      value={formDesignation} onChange={(e) => setFormDesignation(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none font-semibold text-primary"
                    >
                      {availableRoles.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Type of Employment</label>
                    <select
                      value={formEmploymentType} onChange={(e) => setFormEmploymentType(e.target.value as any)}
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none font-semibold text-primary"
                    >
	                      <option value="Internship">Internship</option>
	                      <option value="Probation">Probation</option>
	                      <option value="Confirmation">Confirmation</option>
	                      <option value="Permanent">Permanent</option>
	                      <option value="Contract">Contract</option>
	                      <option value="Fixed Term Contract">Fixed Term Contract</option>
	                      <option value="Independent Contractor">Independent Contractor</option>
	                      <option value="Part Time">Part Time</option>
	                    </select>
	                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Date Joined</label>
                    <input 
                      type="date"
                      value={formDateOfJoined} onChange={(e) => setFormDateOfJoined(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Initial Status</label>
                    <select
                      value={formStatus} onChange={(e) => setFormStatus(e.target.value as any)}
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                    >
                      {EMPLOYEE_STATUS_OPTIONS.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
	                  </div>
	                </div>

                {isFormProbationStatus && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-md border border-primary/25 bg-primary/5 p-3">
                    <div>
                      <label className="block text-xs font-bold text-primary uppercase mb-1">Duration of Probation (Months)</label>
                      <input
                        type="number"
                        min="1"
                        value={formProbationDurationMonths}
                        onChange={(e) => {
                          setFormProbationDurationMonths(Number(e.target.value));
                          setFormConfirmationDateAuto(true);
                        }}
                        className="w-full bg-white border border-primary/30 rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-primary uppercase mb-1">Date of Confirmation</label>
                      <input
                        type="date"
                        value={formDateOfConfirmation}
                        onChange={(e) => {
                          setFormDateOfConfirmation(e.target.value);
                          setFormConfirmationDateAuto(false);
                        }}
                        className="w-full bg-white border border-primary/30 rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>
                    <div className="flex flex-col justify-end gap-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-primary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formProbationExtend}
                          onChange={(e) => {
                            setFormProbationExtend(e.target.checked);
                            setFormConfirmationDateAuto(true);
                          }}
                          className="h-4 w-4 rounded accent-primary"
                        />
                        Probation Extend
                      </label>
                      {formProbationExtend && (
                        <input
                          type="number"
                          min="1"
                          value={formProbationExtensionMonths}
                          onChange={(e) => {
                            setFormProbationExtensionMonths(Number(e.target.value));
                            setFormConfirmationDateAuto(true);
                          }}
                          placeholder="Additional months"
                          className="w-full bg-white border border-primary/30 rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                      )}
                    </div>
                  </div>
                )}

                {isFormConfirmationStatus && !isFormProbationStatus && (
                  <div className="max-w-xs">
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Date of Confirmation</label>
                    <input
                      type="date"
                      value={formDateOfConfirmation}
                      onChange={(e) => setFormDateOfConfirmation(e.target.value)}
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                )}

	                {isContractEmploymentType(formEmploymentType) && (
	                  <div className="p-3 bg-primary/5 border border-primary/25 rounded-md animate-in slide-in-from-top-1 duration-150">
	                    <label className="block text-xs font-bold text-primary uppercase mb-1">Contract Payroll Treatment *</label>
	                    <select
	                      value={formContractStatutoryTreatment}
	                      onChange={(e) => {
	                        const nextTreatment = e.target.value as NonNullable<Employee['contractStatutoryTreatment']>;
	                        setFormContractStatutoryTreatment(nextTreatment);
	                        setFormEligibleForStatutory(nextTreatment === 'with_statutory' ? 'Yes' : 'No');
	                      }}
	                      className="w-full bg-white border border-primary/40 rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none font-semibold"
	                    >
	                      <option value="with_statutory">Salary with Statutory</option>
	                      <option value="without_statutory">Service Fees without Statutory</option>
	                    </select>
	                  </div>
	                )}

	                <div className={`p-3 rounded-md border text-xs ${
	                  formPayrollDocumentProfile.statutoryEnabled
	                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
	                    : 'bg-amber-50 border-amber-200 text-amber-800'
	                }`}>
	                  <span className="font-bold uppercase tracking-wider block">Payroll Output</span>
	                  <span className="mt-1 block font-semibold">
	                    {formPayrollDocumentProfile.documentType} / {formPayrollDocumentProfile.compensationLabel}
	                    {formPayrollDocumentProfile.statutoryEnabled ? ' with statutory.' : ' without statutory.'}
	                  </span>
	                </div>

	                <div className="p-3 bg-primary/5 border border-primary/25 rounded-md space-y-2">
	                  <span className="text-xs font-bold text-primary uppercase tracking-wider block">Statutory Opt In / Opt Out Defaults</span>
	                  {!formPayrollDocumentProfile.statutoryEnabled && (
	                    <p className="text-[11px] font-semibold text-amber-800">
	                      Not applicable for this employment type. Statutory values will stay at RM 0.00.
	                    </p>
	                  )}
	                  <div className="grid grid-cols-2 gap-2 text-xs">
	                    <div>
	                      <label className="block text-[10px] font-bold text-primary uppercase mb-1">KWSP (EPF)</label>
	                      <select
	                        value={formOptInEpf ? 'Yes' : 'No'}
	                        onChange={(e) => setFormOptInEpf(e.target.value === 'Yes')}
	                        disabled={!formPayrollDocumentProfile.statutoryEnabled}
	                        className="w-full bg-white border border-primary/40 rounded p-1.5 text-xs focus:ring-1 focus:ring-primary outline-none font-semibold"
	                      >
                        <option value="Yes">Opt In (Active)</option>
                        <option value="No">Opt Out (Inactive)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-primary uppercase mb-1">PERKESO (SOCSO)</label>
	                      <select
	                        value={formOptInSocso ? 'Yes' : 'No'}
	                        onChange={(e) => setFormOptInSocso(e.target.value === 'Yes')}
	                        disabled={!formPayrollDocumentProfile.statutoryEnabled}
	                        className="w-full bg-white border border-primary/40 rounded p-1.5 text-xs focus:ring-1 focus:ring-primary outline-none font-semibold"
	                      >
                        <option value="Yes">Opt In (Active)</option>
                        <option value="No">Opt Out (Inactive)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-primary uppercase mb-1">EIS</label>
                      <select
                        value={formOptInEis ? 'Yes' : 'No'}
                        onChange={(e) => setFormOptInEis(e.target.value === 'Yes')}
                        disabled={!formPayrollDocumentProfile.statutoryEnabled}
                        className="w-full bg-white border border-primary/40 rounded p-1.5 text-xs focus:ring-1 focus:ring-primary outline-none font-semibold"
                      >
                        <option value="Yes">Opt In (Active)</option>
                        <option value="No">Opt Out (Inactive)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-primary uppercase mb-1">Income Tax (PCB)</label>
                      <select
                        value={formOptInPcb ? 'Yes' : 'No'}
                        onChange={(e) => setFormOptInPcb(e.target.value === 'Yes')}
                        disabled={!formPayrollDocumentProfile.statutoryEnabled}
                        className="w-full bg-white border border-primary/40 rounded p-1.5 text-xs focus:ring-1 focus:ring-primary outline-none font-semibold"
                      >
                        <option value="Yes">Opt In (Active)</option>
                        <option value="No">Opt Out (Inactive)</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-primary uppercase mb-1">PERKESO - Lindung 24 Jam</label>
                      <select
                        value={formEnableLindung24 ? 'Yes' : 'No'}
                        onChange={(e) => setFormEnableLindung24(e.target.value === 'Yes')}
                        disabled={!formPayrollDocumentProfile.statutoryEnabled}
                        className="w-full bg-white border border-primary/40 rounded p-1.5 text-xs focus:ring-1 focus:ring-primary outline-none font-semibold"
                      >
                        <option value="No">Opt Out (Inactive)</option>
                        <option value="Yes">Opt In (Active)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: Financials & Bank */}
                <div className="border-b border-neutral-border pb-2 pt-2">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider block">3. FINANCIAL & BANK BASELINE</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Recipient Bank Name</label>
                    <input
                      type="text"
                      list="employee-bank-options"
                      value={formBank} onChange={(e) => setFormBank(toUppercase(e.target.value))}
                      placeholder="Select or enter bank name"
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                    <datalist id="employee-bank-options">
                      {MALAYSIAN_BANK_NAMES.map(bank => <option key={bank} value={bank} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Bank Account Number *</label>
                    <input 
                      type="text" required
                      value={formAccount} onChange={(e) => setFormAccount(toUppercase(e.target.value))}
                      placeholder="1642 9845 2210"
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">TIN Number (Tax Number)</label>
                    <input
                      type="text"
                      value={formTaxNumber}
                      onChange={(e) => setFormTaxNumber(toUppercase(e.target.value))}
                      placeholder="TIN number"
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">KWSP Number (EPF)</label>
                    <input
                      type="text"
                      value={formEpfNumber}
                      onChange={(e) => setFormEpfNumber(toUppercase(e.target.value))}
                      placeholder="KWSP number"
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">SOCSO Number</label>
                    <input
                      type="text"
                      value={formSocsoNumber}
                      onChange={(e) => setFormSocsoNumber(e.target.value.replace(/-/g, ''))}
                      placeholder="Auto-filled from NRIC"
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
                  <div className="lg:max-w-[220px]">
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Basic Salary *</label>
                    <div className="relative">
                      <span className="absolute left-2 top-2 text-[10px] text-outline">RM</span>
                      <input 
                        type="number" required min="1000"
                        value={formSalary} onChange={(e) => setFormSalary(Number(e.target.value))}
                        className="w-full bg-white border border-neutral-border rounded pl-8 pr-2 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-dashed border-neutral-border bg-surface-container-low p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="block text-xs font-bold text-on-surface-variant uppercase">Allowances</span>
                        <p className="mt-0.5 text-[10px] text-on-surface-variant">Add allowance rows only when needed.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddFormAllowance}
                        disabled={!getNextAllowanceType(formAllowances)}
                        className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:bg-neutral-border disabled:text-on-surface-variant"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Allowance
                      </button>
                    </div>

                    {formAllowances.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {formAllowances.map((allowance) => (
                          <div key={allowance.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_auto]">
                            <select
                              value={allowance.type}
                              onChange={(e) => handleUpdateFormAllowance(allowance.id, { type: e.target.value as AddEmployeeAllowanceKey })}
                              className="w-full rounded border border-neutral-border bg-white p-2 text-xs font-semibold text-on-surface outline-none focus:ring-1 focus:ring-primary"
                            >
                              {ADD_EMPLOYEE_ALLOWANCE_OPTIONS
                                .filter(option =>
                                  option.value === allowance.type ||
                                  !formAllowances.some(existing => existing.id !== allowance.id && existing.type === option.value)
                                )
                                .map(option => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            <div className="relative">
                              <span className="absolute left-2 top-2 text-[10px] text-outline">RM</span>
                              <input
                                type="number"
                                min="0"
                                value={allowance.amount}
                                onChange={(e) => handleUpdateFormAllowance(allowance.id, { amount: Number(e.target.value) })}
                                className="w-full rounded border border-neutral-border bg-white py-2 pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveFormAllowance(allowance.id)}
                              className="inline-flex h-9 items-center justify-center rounded border border-red-200 bg-red-50 px-3 text-red-600 transition hover:bg-red-100"
                              aria-label="Remove allowance"
                            >
                              <Trash className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded border border-neutral-border bg-white px-3 py-2 text-[11px] font-medium text-on-surface-variant">
                        No allowance added yet. Click + Add Allowance to include one.
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION 4: Emergency Contacts */}
                <div className="border-b border-neutral-border pb-2 pt-2">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider block">4. STATUTORY EMERGENCY CONTACT</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Emergency Name</label>
                    <input 
                      type="text"
                      disabled={formEmergencyContactFillLater}
                      value={formEmergencyContactFillLater ? '' : formEmergencyContactName}
                      onChange={(e) => setFormEmergencyContactName(toUppercase(e.target.value))}
                      placeholder="Emma Jenkins"
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none disabled:bg-neutral-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Relationship</label>
                    <input 
                      type="text"
                      disabled={formEmergencyContactFillLater}
                      value={formEmergencyContactFillLater ? '' : formEmergencyContactRelation}
                      onChange={(e) => setFormEmergencyContactRelation(toUppercase(e.target.value))}
                      placeholder="e.g. Spouse / Mother"
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none disabled:bg-neutral-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Emergency Phone</label>
                    <input 
                      type="text"
                      disabled={formEmergencyContactFillLater}
                      value={formEmergencyContactFillLater ? '' : formEmergencyContactPhone}
                      onChange={(e) => setFormEmergencyContactPhone(toUppercase(e.target.value))}
                      placeholder="+60 12-987 6543"
                      className="w-full bg-white border border-neutral-border rounded p-2 text-xs focus:ring-1 focus:ring-primary outline-none disabled:bg-neutral-100"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[10px] font-semibold text-on-surface-variant cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formEmergencyContactFillLater}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setFormEmergencyContactFillLater(checked);
                      if (checked) {
                        setFormEmergencyContactName('');
                        setFormEmergencyContactRelation('');
                        setFormEmergencyContactPhone('');
                      }
                    }}
                    className="h-3.5 w-3.5 rounded accent-primary"
                  />
                  Fill up later
                </label>

                <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formCreateAccount}
                      onChange={(event) => setFormCreateAccount(event.target.checked)}
                      disabled={!canManageAccountActions}
                      className="mt-0.5 h-4 w-4 rounded accent-primary"
                    />
                    <span>
                      <span className="block text-xs font-bold text-primary uppercase tracking-wider">
                        Create employee login and send setup link
                      </span>
                      <span className="mt-1 block text-[11px] text-on-surface-variant">
                        The employee receives a one-time password setup link by email. No password is stored or shown here.
                      </span>
                    </span>
                  </label>
                  {!canManageAccountActions && (
                    <p className="text-[10px] font-semibold text-amber-800">
                      Only hr.redpoint can provision employee accounts.
                    </p>
                  )}
                  {accountPreviewMode && (
                    <p className="text-[10px] font-semibold text-amber-800">
                      Local preview is active. The saved employee will receive copyable handoff links instead of external delivery.
                    </p>
                  )}
                </div>

              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-neutral-border flex justify-end gap-2 bg-surface-container-low shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-white border border-neutral-border hover:bg-surface-container rounded text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploadingAvatar || isSavingForm}
                  className={`px-4 py-2 rounded text-xs font-semibold ${
                    isUploadingAvatar || isSavingForm
                      ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed' 
                      : 'bg-primary text-white hover:bg-primary-container'
                  }`}
                >
                  {isUploadingAvatar ? 'Uploading photo...' : (isSavingForm ? 'Saving to Database...' : 'Enlist & Enroll Employee')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAccountActionModalOpen && accountActionEmployee && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 overflow-y-auto backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-lg border border-neutral-border bg-white shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-border bg-primary p-4 text-white">
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold text-[#f7f0e0]">
                  <KeyRound className="h-5 w-5" />
                  {accountActionMode === 'provision'
                    ? 'Create Employee Account'
                    : accountActionMode === 'reset_password'
                      ? 'Reset Employee Password'
                      : 'Share Account Details'}
                </h3>
                <p className="mt-1 text-xs text-[#f7f0e0]/75">{accountActionEmployee.name} · {accountActionEmployee.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAccountActionModalOpen(false)}
                className="rounded-full p-1.5 text-white transition-colors hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 p-5 text-left">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
                The employee will receive a one-time setup or recovery link. The existing password is never displayed, stored in the browser, or included in audit history.
              </div>

              {!accountActionResult && (
                <>
                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Delivery channel</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {([
                        ['email', 'Email', Mail],
                        ['whatsapp', 'WhatsApp', MessageCircle],
                        ['both', 'Both', Send],
                      ] as const).map(([value, label, Icon]) => (
                        <label
                          key={value}
                          className={`flex cursor-pointer items-center gap-2 rounded border p-2.5 text-xs font-semibold ${
                            accountActionChannel === value
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-neutral-border bg-white text-on-surface-variant'
                          }`}
                        >
                          <input
                            type="radio"
                            name="account-delivery-channel"
                            value={value}
                            checked={accountActionChannel === value}
                            onChange={() => setAccountActionChannel(value)}
                            className="accent-primary"
                          />
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {accountActionChannel !== 'email' && (
                    <div className="rounded border border-neutral-border bg-surface-container-low p-3 text-[11px] text-on-surface-variant">
                      WhatsApp delivery requires an E.164 contact number such as <span className="font-mono font-bold">+60123456789</span>. Local preview will generate a handoff link when provider credentials are not configured.
                    </div>
                  )}

                  <div className="flex justify-end gap-2 border-t border-neutral-border pt-4">
                    <button
                      type="button"
                      onClick={() => setIsAccountActionModalOpen(false)}
                      className="rounded border border-neutral-border bg-white px-4 py-2 text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAccountActionSubmit}
                      disabled={isAccountActionSaving}
                      className="inline-flex items-center gap-1.5 rounded bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isAccountActionSaving ? 'Working...' : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          {accountActionMode === 'reset_password' ? 'Generate & Send Reset Link' : 'Generate & Send Link'}
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}

              {accountActionResult && (
                <div className="space-y-3">
                  <div className={`rounded border p-3 text-xs font-semibold ${
                    accountActionResult.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}>
                    {accountActionResult.message || 'Account action completed.'}
                  </div>
                  {accountActionResult.deliveries.map((delivery) => (
                    <div key={`${delivery.channel}-${delivery.provider}`} className="rounded border border-neutral-border bg-surface-container-low p-3">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 font-bold text-on-surface">
                          {delivery.channel === 'email'
                            ? <Mail className="h-3.5 w-3.5 text-primary" />
                            : <MessageCircle className="h-3.5 w-3.5 text-emerald-700" />}
                          {delivery.channel === 'email' ? 'Email' : 'WhatsApp'}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          delivery.status === 'sent' || delivery.status === 'handoff'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {delivery.status}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-on-surface-variant">
                        {delivery.provider}{delivery.recipient ? ` · ${delivery.recipient}` : ''}
                      </p>
                      {delivery.error && (
                        <p className="mt-1 text-[11px] font-semibold text-rose-700">{delivery.error}</p>
                      )}
                      {delivery.handoffUrl && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <a
                            href={delivery.handoffUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-primary-container"
                          >
                            <ExternalLink className="h-3 w-3" /> Open handoff
                          </a>
                          <button
                            type="button"
                            onClick={() => copyHandoffUrl(delivery.handoffUrl || '')}
                            className="inline-flex items-center gap-1 rounded border border-neutral-border bg-white px-2.5 py-1.5 text-[10px] font-bold text-on-surface-variant hover:bg-surface-container"
                          >
                            <Copy className="h-3 w-3" /> Copy link
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-end border-t border-neutral-border pt-4">
                    <button
                      type="button"
                      onClick={() => setIsAccountActionModalOpen(false)}
                      className="rounded bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-container"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
