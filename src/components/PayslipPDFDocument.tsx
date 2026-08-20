import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { Employee, CorporateEntity, PayrollDocumentDisplaySettings, PayrollRecord2026 } from '../types';
import { calculatePayslip, getPayrollDocumentDisplaySettings, getPayrollDocumentFieldLabels, getPayrollDocumentProfile, getPayrollDocumentProfileForRecord, getDirectLogoUrl, getPayrollBasicSalary, getSalaryProration, calculateSocsoContribution, getEmployeeForMonth, getEffectiveTerminationDateForDate, getSeparatePayoutConfig, isSeparatePayrollRecord } from '../data';
import { formatToDDMMMYYYY } from '../lib/dateUtils';

// Create styles for React PDF
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    paddingHorizontal: 30,
    paddingVertical: 25,
    lineHeight: 1.35,
    flexDirection: 'column',
    backgroundColor: '#ffffff',
  },
  watermark: {
    position: 'absolute',
    top: 10,
    right: 30,
    fontSize: 6,
    color: '#d1d5db',
    fontFamily: 'Helvetica-Bold',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    borderBottomWidth: 3,
    borderBottomColor: '#825500',
    paddingBottom: 8,
    marginBottom: 10,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  logoPlaceholder: {
    width: 120,
    height: 44,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 120,
    height: 44,
    objectFit: 'contain',
    borderRadius: 4,
  },
  logoText: {
    fontSize: 12,
    color: '#825500',
    fontFamily: 'Helvetica-Bold',
  },
  companyName: {
    fontSize: 14.5,
    fontFamily: 'Helvetica-Bold',
    color: '#825500',
    marginBottom: 3,
    lineHeight: 1.15,
  },
  companyReg: {
    fontSize: 7,
    color: '#333333',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  companyAddress: {
    fontSize: 7,
    color: '#333333',
    maxWidth: 240,
    lineHeight: 1.2,
  },
  rightHeaderBlock: {
    backgroundColor: '#825500',
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 3,
    minWidth: 90,
  },
  rightHeaderLabel: {
    color: '#f5fafe',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
  },
  rightHeaderMonth: {
    color: '#ffffff',
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginTop: 1,
  },
  detailsCard: {
    backgroundColor: '#eff4f8',
    borderWidth: 1,
    borderColor: '#d9dee2',
    borderRadius: 5,
    padding: 8,
    marginBottom: 10,
  },
  detailsTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#d9dee2',
    paddingBottom: 2,
    marginBottom: 4,
  },
  detailsTitle: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#825500',
    textTransform: 'uppercase',
  },
  employeeName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#333333',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  detailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailsCol: {
    width: '32%',
  },
  detailItem: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  detailLabelLeft: {
    width: 80,
    fontSize: 7,
    color: '#6b7280',
    fontFamily: 'Helvetica-Bold',
  },
  detailLabelMiddle: {
    width: 60,
    fontSize: 7,
    color: '#6b7280',
    fontFamily: 'Helvetica-Bold',
  },
  detailLabel: {
    fontSize: 7,
    color: '#6b7280',
    fontFamily: 'Helvetica-Bold',
  },
  detailValue: {
    flex: 1,
    fontSize: 7,
    color: '#333333',
    fontFamily: 'Helvetica-Bold',
    textAlign: 'left',
  },
  bankTitle: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#825500',
    marginBottom: 3,
  },
  bankBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 1,
    borderColor: '#d9dee2',
    borderRadius: 3,
    padding: 3,
  },
  bankText: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#333333',
  },
  tableContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  tableCol: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d9dee2',
    borderRadius: 5,
    padding: 6,
    backgroundColor: '#ffffff',
  },
  tableHeaderBlock: {
    backgroundColor: '#825500',
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginBottom: 4,
  },
  tableHeaderTitle: {
    color: '#ffffff',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  tableThRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#d9dee2',
    paddingBottom: 2,
    marginBottom: 3,
  },
  tableThText: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#6b7280',
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f3f4f6',
  },
  tableTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#825500',
    paddingVertical: 3,
    marginTop: 4,
  },
  tableTotalText: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#825500',
  },
  tableRowSocsoTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2.5,
    backgroundColor: '#eff4f8',
    paddingHorizontal: 3,
    borderRadius: 2,
    marginVertical: 1,
  },
  itemName: {
    fontSize: 7,
    color: '#333333',
  },
  itemDescriptionGroup: {
    flex: 1,
    paddingRight: 4,
  },
  itemDescription: {
    fontSize: 6,
    color: '#6b7280',
    marginTop: 1,
  },
  itemVal: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#333333',
    textAlign: 'right',
  },
  summaryStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#eff4f8',
    borderWidth: 1,
    borderColor: '#d9dee2',
    borderRadius: 5,
    padding: 6,
    flexDirection: 'column',
    justifyContent: 'center',
    height: 38,
  },
  summaryCardNetPay: {
    flex: 1,
    backgroundColor: '#825500',
    borderRadius: 5,
    padding: 6,
    flexDirection: 'column',
    justifyContent: 'center',
    height: 38,
  },
  summaryLabel: {
    fontSize: 7,
    color: '#6b7280',
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
  },
  summaryLabelNetPay: {
    fontSize: 7,
    color: '#f5fafe',
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#333333',
    marginTop: 1,
  },
  summaryValueNetPay: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    marginTop: 1,
  },
  contributionsCard: {
    backgroundColor: '#F2E8D8',
    borderWidth: 1.5,
    borderColor: '#d7c3ad',
    borderRadius: 5,
    padding: 6,
    marginBottom: 10,
  },
  contributionsTitle: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#825500',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  contributionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contributionCol: {
    flex: 1,
    alignItems: 'center',
  },
  contributionDivider: {
    width: 1.5,
    height: 16,
    backgroundColor: '#d7c3ad',
  },
  footerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#d9dee2',
    paddingTop: 6,
    marginBottom: 6,
  },
  footerCol: {
    width: '48%',
  },
  footerTitle: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#825500',
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  footerText: {
    fontSize: 7,
    color: '#6b7280',
    lineHeight: 1.25,
  },
  footerTextBold: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#333333',
  },
  confidentialBar: {
    backgroundColor: '#825500',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confidentialBarText: {
    color: '#ffffff',
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
  },
  confidentialBarLabel: {
    color: '#f5fafe',
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  }
});

interface PayslipPDFDocumentProps {
  employee: Employee;
  entity: CorporateEntity;
  month?: number;
  year?: number;
  payrollRecordOverride?: PayrollRecord2026;
  displaySettingsOverride?: Partial<PayrollDocumentDisplaySettings>;
  hrdCorpLocalWorkerCount?: number;
}

export const PayslipPDFDocument = ({ employee: sourceEmployee, entity, month = 10, year = 2026, payrollRecordOverride, displaySettingsOverride, hrdCorpLocalWorkerCount = 0 }: PayslipPDFDocumentProps) => {
  const activePayrollRecord = payrollRecordOverride || null;
  const baseEmployee = getEmployeeForMonth(sourceEmployee, month, year);
  const isSeparatePayoutDocument = !!activePayrollRecord && isSeparatePayrollRecord(activePayrollRecord);
  const payoutConfig = isSeparatePayoutDocument && activePayrollRecord?.payoutKind && activePayrollRecord.payoutKind !== 'regular'
    ? getSeparatePayoutConfig(activePayrollRecord.payoutKind)
    : null;
  const payoutAmount = isSeparatePayoutDocument && payoutConfig
    ? Number(activePayrollRecord?.[payoutConfig.amountField] || 0)
    : 0;
  const payslipEmployee = activePayrollRecord
    ? {
      ...baseEmployee,
      basicSalary: isSeparatePayoutDocument ? 0 : (activePayrollRecord.basicSalary ?? baseEmployee.basicSalary),
      allowanceGeneral: isSeparatePayoutDocument ? 0 : activePayrollRecord.allowanceGeneral ?? baseEmployee.allowanceGeneral,
      allowanceTransport: isSeparatePayoutDocument ? 0 : activePayrollRecord.allowanceTransport ?? baseEmployee.allowanceTransport,
      allowanceParking: isSeparatePayoutDocument ? 0 : activePayrollRecord.allowanceParking ?? baseEmployee.allowanceParking,
      allowanceMeal: isSeparatePayoutDocument ? 0 : activePayrollRecord.allowanceMeal ?? baseEmployee.allowanceMeal,
      allowanceAccommodation: isSeparatePayoutDocument ? 0 : activePayrollRecord.allowanceAccommodation ?? baseEmployee.allowanceAccommodation,
      allowancePhone: isSeparatePayoutDocument ? 0 : activePayrollRecord.allowancePhone ?? baseEmployee.allowancePhone,
      overtime: isSeparatePayoutDocument ? 0 : activePayrollRecord.overtime ?? baseEmployee.overtime,
      bonusAmount: isSeparatePayoutDocument ? Number(activePayrollRecord.bonusAmount || 0) : (activePayrollRecord.bonusAmount ?? baseEmployee.bonusAmount),
      bonusDesc: activePayrollRecord.bonusDesc ?? baseEmployee.bonusDesc,
      commissionAmount: isSeparatePayoutDocument ? Number(activePayrollRecord.commissionAmount || 0) : (activePayrollRecord.commissionAmount ?? baseEmployee.commissionAmount),
      commissionDesc: activePayrollRecord.commissionDesc ?? baseEmployee.commissionDesc,
      backPayAmount: isSeparatePayoutDocument ? 0 : activePayrollRecord.backPayAmount ?? baseEmployee.backPayAmount,
      backPayDesc: activePayrollRecord.backPayDesc ?? baseEmployee.backPayDesc,
      awsAmount: isSeparatePayoutDocument ? 0 : activePayrollRecord.awsAmount ?? baseEmployee.awsAmount,
      awsDesc: activePayrollRecord.awsDesc ?? baseEmployee.awsDesc,
      compensationAmount: isSeparatePayoutDocument ? Number(activePayrollRecord.compensationAmount || 0) : activePayrollRecord.compensationAmount ?? baseEmployee.compensationAmount,
      compensationDesc: activePayrollRecord.compensationDesc ?? baseEmployee.compensationDesc,
      reimbursementAmount: isSeparatePayoutDocument ? Number(activePayrollRecord.reimbursementAmount || 0) : (activePayrollRecord.reimbursementAmount ?? baseEmployee.reimbursementAmount),
      reimbursementDesc: activePayrollRecord.reimbursementDesc ?? baseEmployee.reimbursementDesc,
      unpaidLeave: activePayrollRecord.unpaidLeave ?? baseEmployee.unpaidLeave,
      incompleteMonthDeduction: activePayrollRecord.incompleteMonthDeduction ?? baseEmployee.incompleteMonthDeduction,
      deductionInLieu: activePayrollRecord.deductionInLieu ?? baseEmployee.deductionInLieu,
      deductionCp38: activePayrollRecord.deductionCp38 ?? baseEmployee.deductionCp38,
      deductionOthers: activePayrollRecord.deductionOthers ?? baseEmployee.deductionOthers,
      deductionOthersDesc: activePayrollRecord.deductionOthersDesc ?? baseEmployee.deductionOthersDesc,
      payslipDescriptions: activePayrollRecord.payslipDescriptions ?? baseEmployee.payslipDescriptions,
      contractStatutoryTreatment: activePayrollRecord.statutoryTreatment ?? baseEmployee.contractStatutoryTreatment,
      eligibleForStatutory: activePayrollRecord.statutoryTreatment === 'with_statutory' ? 'Yes' : activePayrollRecord.statutoryTreatment === 'without_statutory' ? 'No' : baseEmployee.eligibleForStatutory,
      paymentDate: activePayrollRecord.paymentDate || baseEmployee.paymentDate
    }
    : baseEmployee;
  const documentProfile = activePayrollRecord
    ? getPayrollDocumentProfileForRecord(payslipEmployee, activePayrollRecord)
    : getPayrollDocumentProfile(payslipEmployee);
  const documentFieldLabels = getPayrollDocumentFieldLabels(documentProfile);
  const displaySettings = {
    ...(activePayrollRecord?.displaySettingsSnapshot || getPayrollDocumentDisplaySettings(payslipEmployee)),
    ...(displaySettingsOverride || {})
  };
  if (!documentProfile.statutoryEnabled) {
    displaySettings.showEpfNumber = false;
    displaySettings.showEmployerContributions = false;
  }
  const employee = payslipEmployee;
  const breakdown = activePayrollRecord
    ? calculatePayslip(employee, month, year, {
      basicSalaryOverride: isSeparatePayoutDocument ? 0 : employee.basicSalary,
      statutorySalaryOverride: isSeparatePayoutDocument ? payoutAmount : undefined,
      statutoryEligibilityOverride: isSeparatePayoutDocument ? documentProfile.statutoryEnabled : undefined,
      ignoreSavedStatutory: true,
      hrdCorpLocalWorkerCount,
      hrdCorpVoluntaryOptIn: true,
      statutoryOverrides: {
        epfEmployee: activePayrollRecord.epfEmployee,
        epfEmployer: activePayrollRecord.epfEmployer,
        socsoEmployee: activePayrollRecord.socsoEmployee,
        socsoEmployer: activePayrollRecord.socsoEmployer,
        lindung24Employee: activePayrollRecord.lindung24Employee,
        eisEmployee: activePayrollRecord.eisEmployee,
        eisEmployer: activePayrollRecord.eisEmployer,
        taxPcb: activePayrollRecord.actualPCBDeducted
      }
    })
    : calculatePayslip(employee, month, year, {
      hrdCorpLocalWorkerCount,
      hrdCorpVoluntaryOptIn: true
    });
  const lastWorkingDay = getEffectiveTerminationDateForDate(
    employee,
    `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`
  );
  const getDescription = (key: keyof NonNullable<Employee['payslipDescriptions']>, fallback: string) =>
    payslipEmployee.payslipDescriptions?.[key] || fallback;
  const getLineNote = (field: string) => activePayrollRecord?.lineNotes?.[field] || '';
  const renderItemDescription = (label: string, field: string) => {
    const note = getLineNote(field);
    return (
      <View style={styles.itemDescriptionGroup}>
        <Text style={styles.itemName}>{label}</Text>
        {note && <Text style={styles.itemDescription}>{note}</Text>}
      </View>
    );
  };

  const formatCurrency = (val: number) => {
    return `RM ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Complete allowances list matching the HTML Payslip preview
  const allowanceGen = employee.allowanceGeneral || 0;
  const allowanceTrans = employee.allowanceTransport !== undefined ? employee.allowanceTransport : (employee.transportAllowance || 0);
  const allowanceAccom = employee.allowanceAccommodation !== undefined ? employee.allowanceAccommodation : (employee.housingAllowance || 0);
  const allowancePark = employee.allowanceParking || 0;
  const allowanceMeal = employee.allowanceMeal || 0;
  const allowancePhone = employee.allowancePhone || 0;

  const overtimeVal = employee.overtime || 0;
  const bonusVal = employee.bonusAmount !== undefined ? employee.bonusAmount : (employee.performanceBonus || 0);
  const commissionVal = employee.commissionAmount || 0;
  const backPayVal = employee.backPayAmount || 0;
  const awsVal = employee.awsAmount || 0;
  const compensationVal = employee.compensationAmount || 0;
  const reimbursementVal = employee.reimbursementAmount || 0;
  const unpaidLeaveVal = employee.unpaidLeave || 0;

  const basicSalaryForSocso = isSeparatePayoutDocument ? 0 : getPayrollBasicSalary(sourceEmployee, month, year);
  const payrollItemsForSocso = [
    { code: 'basic_salary', amount: basicSalaryForSocso },
    { code: 'overtime', amount: overtimeVal },
    { code: 'commission', amount: commissionVal },
    { code: 'allowance_general', amount: allowanceGen },
    { code: 'allowance_transport', amount: allowanceTrans },
    { code: 'allowance_parking', amount: allowancePark },
    { code: 'allowance_meal', amount: allowanceMeal },
    { code: 'allowance_accommodation', amount: allowanceAccom },
    { code: 'allowance_phone', amount: allowancePhone },
    { code: 'backpay', amount: backPayVal }
  ];
  if (unpaidLeaveVal > 0) {
    payrollItemsForSocso.push({ code: 'unpaid_leave', amount: unpaidLeaveVal });
  }

  const socsoRes = calculateSocsoContribution({
    employee,
    payrollPeriod: `${year}-${String(month).padStart(2, '0')}`,
    payrollItems: payrollItemsForSocso
  });
  const socsoEmployerScale = socsoRes.employerSocsoTotal > 0
    ? breakdown.socsoEmployerVal / socsoRes.employerSocsoTotal
    : 0;
  const socsoEmployerInjury = socsoRes.employerEmploymentInjury * socsoEmployerScale;
  const socsoEmployerInvalidity = breakdown.socsoEmployerVal - socsoEmployerInjury;
  const skbbkEmployeeVal = breakdown.skbbkEmpVal;

  // Deductions breakdown
  const epfRateEmp = employee.epfRateEmployee || 11;
  const epfEmployeeValue = breakdown.epfEmployeeValue;
  const socsoEmployeeVal = breakdown.socsoEmployeeVal;
  const eisEmployeeVal = breakdown.eisEmployeeVal;
  const taxPcbVal = breakdown.taxPcbVal;
  const deductionInLieuVal = employee.deductionInLieu || 0;
  const incompleteMonthDeductionVal = employee.incompleteMonthDeduction || 0;
  const deductionCp38Val = employee.deductionCp38 || 0;
  const deductionOthersVal = employee.deductionOthers || 0;

  // Employer breakdown
  const epfRateEmployer = employee.epfRateEmployer || (employee.basicSalary <= 5000 ? 13 : 12);
  const epfEmployerValue = breakdown.epfEmployerValue;

  // Proration Deduction details
  const salaryProration = getSalaryProration(employee, month, year);
  const actualBasic = isSeparatePayoutDocument ? 0 : employee.basicSalary;

  // Calendar dates
  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const lastDay = new Date(year, month, 0).getDate();
  const payPeriodText = `01 ${monthsList[month - 1]} ${year} - ${lastDay} ${monthsList[month - 1]} ${year}`;

  const getBankAccount = () => {
    const acc = String(employee.accountNo || '');
    if (!acc) return 'Bank account not available.';
    return `${employee.bankName || 'N/A'} - ${acc}`;
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Watermark */}
        <Text style={styles.watermark}>CONFIDENTIAL - STRICTLY PRIVATE</Text>

        {/* Option A Branding Header */}
        <View style={styles.headerContainer}>
          <View style={styles.logoContainer}>
              <Image 
                src="/redpoint-logo.png" 
                style={styles.logoImage} 
              />
            <View>
              <Text style={styles.companyName}>{entity?.name || 'Company not configured'}</Text>
              {entity?.registrationNumber && (
                <Text style={styles.companyReg}>Co. Reg: {entity.registrationNumber}</Text>
              )}
              {displaySettings.showCompanyAddress && (
                <Text style={styles.companyAddress}>
                  {entity?.address || 'No registered corporate address'}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.rightHeaderBlock}>
            <Text style={styles.rightHeaderLabel}>{documentProfile.documentType.toUpperCase()}</Text>
            <Text style={styles.rightHeaderMonth}>{monthsList[month - 1].substring(0, 3)} {year}</Text>
            {activePayrollRecord?.payoutTitle && (
              <Text style={styles.rightHeaderMonth}>{activePayrollRecord.payoutTitle}</Text>
            )}
          </View>
        </View>

        {activePayrollRecord?.payoutDescription && (
          <View style={styles.detailsCard}>
            <View style={styles.detailsTitleContainer}>
              <Text style={styles.detailsTitle}>Payout Notes</Text>
            </View>
            <Text style={styles.detailValue}>{activePayrollRecord.payoutDescription}</Text>
          </View>
        )}

        {/* Employee Details Card */}
        <View style={styles.detailsCard}>
          <View style={styles.detailsTitleContainer}>
            <Text style={styles.detailsTitle}>{documentFieldLabels.detailsTitle}</Text>
          </View>
          <Text style={styles.employeeName}>{employee.name}</Text>
          
          <View style={styles.detailsGrid}>
            {/* Left Group */}
            <View style={styles.detailsCol}>
              {displaySettings.showTin && <View style={styles.detailItem}>
                <Text style={styles.detailLabelLeft}>TIN / Tax Number</Text>
                <Text style={styles.detailValue}>{employee.taxNumber || 'IG 29068110030'}</Text>
              </View>}
              {displaySettings.showEpfNumber && <View style={styles.detailItem}>
                <Text style={styles.detailLabelLeft}>EPF Member Number</Text>
                <Text style={styles.detailValue}>{employee.epfNumber || '-'}</Text>
              </View>}
              {displaySettings.showNricPassport && <View style={styles.detailItem}>
                <Text style={styles.detailLabelLeft}>NRIC / Passport</Text>
                <Text style={styles.detailValue}>{employee.nricPassport || '-'}</Text>
              </View>}
              {displaySettings.showDateJoined && <View style={styles.detailItem}>
                <Text style={styles.detailLabelLeft}>{documentFieldLabels.dateJoined}</Text>
                <Text style={styles.detailValue}>{formatToDDMMMYYYY(employee.dateOfJoined)}</Text>
              </View>}
              {lastWorkingDay && displaySettings.showLastWorkingDay && (
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabelLeft}>Last Working Day</Text>
                  <Text style={styles.detailValue}>{formatToDDMMMYYYY(lastWorkingDay)}</Text>
                </View>
              )}
              <View style={styles.detailItem}>
                <Text style={styles.detailLabelLeft}>{documentFieldLabels.employmentStatus}</Text>
                <Text style={styles.detailValue}>{employee.employmentType || 'Confirmation'}</Text>
              </View>
            </View>

            {/* Middle Group */}
            <View style={styles.detailsCol}>
              {displaySettings.showEmail && <View style={styles.detailItem}>
                <Text style={styles.detailLabelMiddle}>Email Address</Text>
                <Text style={styles.detailValue}>{employee.email}</Text>
              </View>}
              {displaySettings.showDepartment && <View style={styles.detailItem}>
                <Text style={styles.detailLabelMiddle}>Department</Text>
                <Text style={styles.detailValue}>{employee.department}</Text>
              </View>}
              {displaySettings.showDesignation && <View style={styles.detailItem}>
                <Text style={styles.detailLabelMiddle}>{documentFieldLabels.designation}</Text>
                <Text style={styles.detailValue}>{employee.designation}</Text>
              </View>}
              <View style={styles.detailItem}>
                <Text style={styles.detailLabelMiddle}>Payment Date</Text>
                <Text style={styles.detailValue}>{formatToDDMMMYYYY(employee.paymentDate || `${year}-${String(month).padStart(2, '0')}-28`)}</Text>
              </View>
            </View>

            {/* Right Group (Bank details) */}
            {displaySettings.showBankAccount && <View style={styles.detailsCol}>
              <Text style={styles.bankTitle}>Bank Details</Text>
              <Text style={[styles.detailLabel, { marginBottom: 2 }]}>Bank Account</Text>
              <View style={styles.bankBox}>
                <Text style={styles.bankText}>{getBankAccount()}</Text>
              </View>
            </View>}
          </View>
        </View>

        {/* Side-by-side Tables */}
        <View style={styles.tableContainer}>
          {/* Earnings Column */}
          <View style={styles.tableCol}>
            <View style={styles.tableHeaderBlock}>
              <Text style={styles.tableHeaderTitle}>Earnings & Additions</Text>
            </View>
            <View style={styles.tableThRow}>
              <Text style={styles.tableThText}>Description</Text>
              <Text style={styles.tableThText}>Amount (RM)</Text>
            </View>

            {!isSeparatePayoutDocument && (
              <View style={styles.tableRow}>
                {renderItemDescription(
                  salaryProration.isProrated ? `Prorated ${getDescription('basicSalary', documentProfile.compensationLabel)}` : getDescription('basicSalary', documentProfile.compensationLabel),
                  'basicSalary'
                )}
                <Text style={styles.itemVal}>{formatCurrency(actualBasic)}</Text>
              </View>
            )}

            {displaySettings.showEarningsDetails && (
              <>
            {allowanceGen > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('allowanceGeneral', 'General Allowance'), 'allowanceGeneral')}
                <Text style={styles.itemVal}>{formatCurrency(allowanceGen)}</Text>
              </View>
            )}
            {allowanceTrans > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('allowanceTransport', 'Transport Allowance'), 'allowanceTransport')}
                <Text style={styles.itemVal}>{formatCurrency(allowanceTrans)}</Text>
              </View>
            )}
            {allowancePark > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('allowanceParking', 'Parking Allowance'), 'allowanceParking')}
                <Text style={styles.itemVal}>{formatCurrency(allowancePark)}</Text>
              </View>
            )}
            {allowanceMeal > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('allowanceMeal', 'Meal Allowance'), 'allowanceMeal')}
                <Text style={styles.itemVal}>{formatCurrency(allowanceMeal)}</Text>
              </View>
            )}
            {allowanceAccom > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('allowanceAccommodation', 'Accommodation Allowance'), 'allowanceAccommodation')}
                <Text style={styles.itemVal}>{formatCurrency(allowanceAccom)}</Text>
              </View>
            )}
            {allowancePhone > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('allowancePhone', 'Phone Allowance'), 'allowancePhone')}
                <Text style={styles.itemVal}>{formatCurrency(allowancePhone)}</Text>
              </View>
            )}

            {overtimeVal > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('overtime', 'Overtime'), 'overtime')}
                <Text style={styles.itemVal}>{formatCurrency(overtimeVal)}</Text>
              </View>
            )}

            {bonusVal > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(payslipEmployee.bonusDesc || 'Performance Bonus', 'bonusAmount')}
                <Text style={styles.itemVal}>{formatCurrency(bonusVal)}</Text>
              </View>
            )}
            {commissionVal > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(payslipEmployee.commissionDesc || 'Commissions', 'commissionAmount')}
                <Text style={styles.itemVal}>{formatCurrency(commissionVal)}</Text>
              </View>
            )}
            {backPayVal > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(payslipEmployee.backPayDesc || 'BackPay / Arrears', 'backPayAmount')}
                <Text style={styles.itemVal}>{formatCurrency(backPayVal)}</Text>
              </View>
            )}
            {awsVal > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(payslipEmployee.awsDesc || 'AWS (13th Month)', 'awsAmount')}
                <Text style={styles.itemVal}>{formatCurrency(awsVal)}</Text>
              </View>
            )}
            {compensationVal > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(payslipEmployee.compensationDesc || 'Compensation / Severance', 'compensationAmount')}
                <Text style={styles.itemVal}>{formatCurrency(compensationVal)}</Text>
              </View>
            )}
            {reimbursementVal > 0 && (
              <View style={[styles.tableRow, { backgroundColor: '#f9fafb' }]}>
                <View style={styles.itemDescriptionGroup}>
                  <Text style={[styles.itemName, { fontFamily: 'Helvetica-Bold' }]}>{payslipEmployee.reimbursementDesc || 'Reimbursements (Tax-Free)'}</Text>
                  {getLineNote('reimbursementAmount') && (
                    <Text style={styles.itemDescription}>{getLineNote('reimbursementAmount')}</Text>
                  )}
                </View>
                <Text style={styles.itemVal}>{formatCurrency(reimbursementVal)}</Text>
              </View>
            )}
              </>
            )}

            <View style={styles.tableTotalRow}>
              <Text style={styles.tableTotalText}>{documentProfile.isPaymentVoucher ? 'Gross Amount' : 'Total Earnings & Additions'}</Text>
              <Text style={styles.tableTotalText}>{formatCurrency(breakdown.grossPay + breakdown.reimbursementsSum)}</Text>
            </View>
          </View>

          {/* Deductions Column */}
          <View style={styles.tableCol}>
            <View style={styles.tableHeaderBlock}>
              <Text style={styles.tableHeaderTitle}>Deductions</Text>
            </View>
            <View style={styles.tableThRow}>
              <Text style={styles.tableThText}>Description</Text>
              <Text style={styles.tableThText}>Amount (RM)</Text>
            </View>

            {documentProfile.statutoryEnabled && epfEmployeeValue > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('epfEmployee', `EPF (Employee ${epfRateEmp}%)`), 'epfEmployee')}
                <Text style={styles.itemVal}>{formatCurrency(epfEmployeeValue)}</Text>
              </View>
            )}

            {documentProfile.statutoryEnabled && (skbbkEmployeeVal > 0 ? (
              <>
                <View style={styles.tableRow}>
                  {renderItemDescription(getDescription('socsoEmployee', 'SOCSO - Invalidity'), 'socsoEmployee')}
                  <Text style={styles.itemVal}>{formatCurrency(socsoEmployeeVal)}</Text>
                </View>
                <View style={styles.tableRow}>
                  {renderItemDescription(getDescription('lindung24Employee', 'SOCSO - LINDUNG 24 Jam'), 'lindung24Employee')}
                  <Text style={styles.itemVal}>{formatCurrency(skbbkEmployeeVal)}</Text>
                </View>
                <View style={styles.tableRowSocsoTotal}>
                  <Text style={[styles.itemName, { fontFamily: 'Helvetica-Bold' }]}>SOCSO Employee Total</Text>
                  <Text style={[styles.itemVal, { fontFamily: 'Helvetica-Bold' }]}>{formatCurrency(socsoEmployeeVal + skbbkEmployeeVal)}</Text>
                </View>
              </>
            ) : (
              socsoEmployeeVal > 0 && (
                <View style={styles.tableRow}>
                  {renderItemDescription(getDescription('socsoEmployee', 'SOCSO'), 'socsoEmployee')}
                  <Text style={styles.itemVal}>{formatCurrency(socsoEmployeeVal)}</Text>
                </View>
              )
            ))}

            {documentProfile.statutoryEnabled && eisEmployeeVal > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('eisEmployee', 'EIS'), 'eisEmployee')}
                <Text style={styles.itemVal}>{formatCurrency(eisEmployeeVal)}</Text>
              </View>
            )}

            {documentProfile.statutoryEnabled && taxPcbVal > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('taxPcb', 'Income Tax (PCB)'), 'taxPcb')}
                <Text style={styles.itemVal}>{formatCurrency(taxPcbVal)}</Text>
              </View>
            )}

            {displaySettings.showDeductionDetails && unpaidLeaveVal > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('unpaidLeave', 'Unpaid Leave'), 'unpaidLeave')}
                <Text style={styles.itemVal}>{formatCurrency(unpaidLeaveVal)}</Text>
              </View>
            )}
            {displaySettings.showDeductionDetails && incompleteMonthDeductionVal > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('incompleteMonthDeduction', 'Incomplete-month deduction'), 'incompleteMonthDeduction')}
                <Text style={styles.itemVal}>{formatCurrency(incompleteMonthDeductionVal)}</Text>
              </View>
            )}
            {displaySettings.showDeductionDetails && deductionInLieuVal > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('deductionInLieu', 'Payment in Lieu'), 'deductionInLieu')}
                <Text style={styles.itemVal}>{formatCurrency(deductionInLieuVal)}</Text>
              </View>
            )}
            {displaySettings.showDeductionDetails && documentProfile.statutoryEnabled && deductionCp38Val > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('deductionCp38', 'CP38 Direct Tax'), 'deductionCp38')}
                <Text style={styles.itemVal}>{formatCurrency(deductionCp38Val)}</Text>
              </View>
            )}
            {displaySettings.showDeductionDetails && deductionOthersVal > 0 && (
              <View style={styles.tableRow}>
                {renderItemDescription(getDescription('deductionOthers', payslipEmployee.deductionOthersDesc || 'Other Deduction'), 'deductionOthers')}
                <Text style={styles.itemVal}>{formatCurrency(deductionOthersVal)}</Text>
              </View>
            )}

            <View style={styles.tableTotalRow}>
              <Text style={styles.tableTotalText}>{documentProfile.isPaymentVoucher ? 'Other Deductions' : 'Total Deductions'}</Text>
              <Text style={styles.tableTotalText}>{formatCurrency(breakdown.totalDeductions)}</Text>
            </View>
            {(unpaidLeaveVal > 0 || incompleteMonthDeductionVal > 0) && (
              <Text style={{ ...styles.itemDescription, marginTop: 4 }}>
                Gross Pay v2 includes unpaid leave and incomplete-month reductions; they are not deducted again.
              </Text>
            )}
          </View>
        </View>

        {/* Summary Strip (Option A Layout) */}
        <View style={styles.summaryStrip}>
          {/* Gross Pay */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{documentProfile.isPaymentVoucher ? 'Gross Amount' : 'Gross Pay'}</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(breakdown.grossPay + breakdown.reimbursementsSum)}
            </Text>
          </View>

          {/* Total Deductions */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{documentProfile.isPaymentVoucher ? 'Other Deductions' : 'Total Deductions'}</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(breakdown.totalDeductions)}
            </Text>
          </View>

          {/* Net Pay (Deep Red Block) */}
          <View style={styles.summaryCardNetPay}>
            <Text style={styles.summaryLabelNetPay}>{documentProfile.isPaymentVoucher ? 'Net Payable' : 'Net Pay'}</Text>
            <Text style={styles.summaryValueNetPay}>{formatCurrency(breakdown.netPay)}</Text>
          </View>
        </View>

        {/* Employer Contributions (Option A Card Layout) */}
        {documentProfile.statutoryEnabled && displaySettings.showEmployerContributions && (
        <View style={styles.contributionsCard}>
          <Text style={styles.contributionsTitle}>Employer Contributions (Not Paid to Employee)</Text>
          <View style={styles.contributionsGrid}>
            {/* EPF */}
            <View style={styles.contributionCol}>
              <Text style={[styles.detailLabel, { color: '#6b7280' }]}>EPF ({epfRateEmployer}%)</Text>
              <Text style={[styles.detailValue, { color: '#333333' }]}>{formatCurrency(epfEmployerValue)}</Text>
            </View>

            <View style={styles.contributionDivider} />

            {/* SOCSO Injury */}
            <View style={styles.contributionCol}>
              <Text style={[styles.detailLabel, { color: '#6b7280' }]}>SOCSO - Injury</Text>
              <Text style={[styles.detailValue, { color: '#333333' }]}>{formatCurrency(socsoEmployerInjury)}</Text>
            </View>

            <View style={styles.contributionDivider} />

            {/* SOCSO Invalidity */}
            <View style={styles.contributionCol}>
              <Text style={[styles.detailLabel, { color: '#6b7280' }]}>SOCSO - Invalidity</Text>
              <Text style={[styles.detailValue, { color: '#333333' }]}>{formatCurrency(socsoEmployerInvalidity)}</Text>
            </View>

            <View style={styles.contributionDivider} />

            {/* SOCSO Employer Total */}
            <View style={styles.contributionCol}>
              <Text style={[styles.detailLabel, { color: '#825500' }]}>SOCSO Employer Total</Text>
              <Text style={[styles.detailValue, { color: '#825500' }]}>{formatCurrency(breakdown.socsoEmployerVal)}</Text>
            </View>

            <View style={styles.contributionDivider} />

            {/* EIS */}
            <View style={styles.contributionCol}>
              <Text style={[styles.detailLabel, { color: '#6b7280' }]}>EIS</Text>
              <Text style={[styles.detailValue, { color: '#333333' }]}>{formatCurrency(breakdown.eisEmployerVal)}</Text>
            </View>

          </View>
        </View>
        )}

        {/* Footer Notes (Option A) */}
        {displaySettings.showNotesFooter && (
        <View style={styles.footerSection}>
          <View style={styles.footerCol}>
            <Text style={styles.footerTitle}>Important Note</Text>
            <Text style={styles.footerText}>
              This is a computer generated document.
            </Text>
            <Text style={styles.footerText}>
              No signature is required.
            </Text>
          </View>
          <View style={[styles.footerCol, { alignItems: 'flex-end' }]}>
            <Text style={styles.footerTitle}>Pay Period</Text>
            <Text style={styles.footerTextBold}>{payPeriodText}</Text>
          </View>
        </View>
        )}

        {/* Bottom Confidential Bar */}
        {displaySettings.showNotesFooter && (
        <View style={styles.confidentialBar}>
          <Text style={styles.confidentialBarText}>
            Thank you for your continued contribution to {entity?.name || 'Company not configured'}.
          </Text>
          <Text style={styles.confidentialBarLabel}>CONFIDENTIAL</Text>
        </View>
        )}

      </Page>
    </Document>
  );
};
