export type PayrollExportFormat = 'pdf' | 'xlsx' | 'csv' | 'txt';

export interface PayrollExportFilters {
  entityId?: string;
  entityName?: string;
  department?: string;
  payrollMonth: number;
  payrollYear: number;
  selectedRecordIds?: string[];
}

export interface PayrollExportAudit {
  userId?: string;
  userName?: string;
  role?: string;
  module: 'payroll';
  format: PayrollExportFormat;
  scope?: string;
  recordCount: number;
  selectedFields: string[];
  filters: PayrollExportFilters;
  status: 'success' | 'failure';
  errorMessage?: string;
  ipAddress?: string;
  createdAt: string;
}
