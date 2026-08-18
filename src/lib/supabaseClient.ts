import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_URL : process.env.VITE_SUPABASE_URL) || '';
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_ANON_KEY : process.env.VITE_SUPABASE_ANON_KEY) || '';
const employeeSupabaseUrl = (
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_EMPLOYEE_SUPABASE_URL
    : process.env.VITE_EMPLOYEE_SUPABASE_URL
) || supabaseUrl;
const employeeSupabaseAnonKey = (
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_EMPLOYEE_SUPABASE_ANON_KEY
    : process.env.VITE_EMPLOYEE_SUPABASE_ANON_KEY
) || supabaseAnonKey;

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey && !supabaseUrl.includes('placeholder');
export const isEmployeeSupabaseConfigured = (
  !!employeeSupabaseUrl
  && !!employeeSupabaseAnonKey
  && !employeeSupabaseUrl.includes('placeholder')
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
export const employeeSupabase: SupabaseClient | null = isEmployeeSupabaseConfigured
  ? createClient(employeeSupabaseUrl, employeeSupabaseAnonKey)
  : null;

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase Config] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in your .env.local file. ' +
    'The app will operate using local persistence fallback.'
  );
}

export interface SupabaseDataPayload {
  corporate_entities: any[];
  employees: any[];
  performances: any[];
  users: any[];
  audit_logs: any[];
  candidates?: any[];
  payroll_records_2026?: any[];
  candidate_pipeline_history?: any[];
  candidate_interviews?: any[];
  candidate_evaluations?: any[];
  candidate_offers?: any[];
  candidate_share_links?: any[];
  candidate_share_deliveries?: any[];
}

function extractMissingColumn(errorMessage: string): string | null {
  if (!errorMessage) return null;
  const match1 = errorMessage.match(/Could not find the '([^']+)' column/i);
  if (match1) return match1[1];
  const match2 = errorMessage.match(/column "([^"]+)" of relation/i);
  if (match2) return match2[1];
  return null;
}

// Helper to convert camelCase objects to snake_case for PostgreSQL columns
function toSnakeCase(obj: any): any {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const result: any = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) continue;
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    let val = obj[key];
    
    // PostgreSQL strict typing protection: Convert empty strings to null for date/number/fk fields
    if (val === '') {
      if (
        snakeKey.includes('date') || 
        snakeKey.includes('time') || 
        snakeKey === 'progress' ||
        snakeKey === 'basic_salary' ||
        (snakeKey.includes('_id') && snakeKey !== 'id')
      ) {
        val = null;
      }
    }
    
    result[snakeKey] = val;
  }
  return result;
}

// Helper to convert snake_case DB columns to camelCase for TypeScript objects
function toCamelCase(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  const result: any = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

export const supabaseClient = {
  async loadData(): Promise<SupabaseDataPayload> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }
    console.log('[Supabase Client] Fetching all tables...');

    const [
      entitiesRes,
      employeesRes,
      candidatesRes,
      performancesRes,
      payrollRes,
      logsRes,
      pipelineHistoryRes,
      interviewsRes,
      evaluationsRes,
      offersRes,
      shareLinksRes,
      shareDeliveriesRes
    ] = await Promise.all([
      supabase.from('corporate_entities').select('*'),
      supabase.from('employees').select('*'),
      supabase.from('candidates').select('*'),
      supabase.from('performances').select('*'),
      supabase.from('payroll_records_2026').select('*'),
      supabase.from('audit_logs').select('*'),
      supabase.from('candidate_pipeline_history').select('*'),
      supabase.from('candidate_interviews').select('*'),
      supabase.from('candidate_evaluations').select('*'),
      supabase.from('candidate_offers').select('*'),
      supabase.from('candidate_share_links').select('*'),
      supabase.from('candidate_share_deliveries').select('*')
    ]);

    if (entitiesRes.error) console.error('[Supabase Error] Entities:', entitiesRes.error);
    if (employeesRes.error) console.error('[Supabase Error] Employees:', employeesRes.error);

    return {
      corporate_entities: (entitiesRes.data || []).map(toCamelCase),
      employees: (employeesRes.data || []).map(toCamelCase),
      candidates: (candidatesRes.data || []).map(toCamelCase),
      performances: (performancesRes.data || []).map(toCamelCase),
      payroll_records_2026: (payrollRes.data || []).map(toCamelCase),
      // Credentials are server-only. LoginView uses the secure admin session
      // endpoint or employee Auth instead of loading public.users.password.
      users: [],
      audit_logs: (logsRes.data || []).map(toCamelCase),
      candidate_pipeline_history: (pipelineHistoryRes.data || []).map(toCamelCase),
      candidate_interviews: (interviewsRes.data || []).map(toCamelCase),
      candidate_evaluations: (evaluationsRes.data || []).map(toCamelCase),
      candidate_offers: (offersRes.data || []).map(toCamelCase),
      candidate_share_links: (shareLinksRes.data || []).map(toCamelCase),
      candidate_share_deliveries: (shareDeliveriesRes.data || []).map(toCamelCase)
    };
  },

  async insert(table: string, data: any): Promise<any> {
    if (!supabase) return data;
    console.log('[Supabase Client] Inserting record into:', table, data);
    let snakeData = toSnakeCase(data);
    let inserted: any = null;
    let error: any = null;
    let retries = 0;
    const maxRetries = Object.keys(snakeData).length + 1;

    while (retries < maxRetries) {
      const res = await supabase.from(table).insert(snakeData).select().single();
      error = res.error;
      inserted = res.data;
      if (error) {
        const missingCol = extractMissingColumn(error.message || '');
        if (missingCol && snakeData[missingCol] !== undefined) {
          console.warn(`[Supabase Client] Removing missing column '${missingCol}' and retrying insert...`);
          delete snakeData[missingCol];
          retries++;
          continue;
        }
      }
      break;
    }

    if (error) {
      console.error('[Supabase Insert Error]', error);
      throw new Error(`Supabase Insert Failed: ${error.message}`);
    }
    return toCamelCase(inserted);
  },

  async update(table: string, idValue: string, data: any, idColumn: string = 'id'): Promise<any> {
    if (!supabase) return data;
    console.log('[Supabase Client] Updating record in:', table, { idColumn, idValue, data });
    const snakeColumn = idColumn.replace(/([A-Z])/g, '_$1').toLowerCase();
    let snakeData = toSnakeCase(data);
    let updated: any = null;
    let error: any = null;
    let retries = 0;
    const maxRetries = Object.keys(snakeData).length + 1;

    while (retries < maxRetries) {
      const updateResult = await supabase
        .from(table)
        .update(snakeData)
        .eq(snakeColumn, idValue)
        .select();
      updated = updateResult.data;
      error = updateResult.error;

      if (error) {
        const missingCol = extractMissingColumn(error.message || '');
        if (missingCol && snakeData[missingCol] !== undefined) {
          console.warn(`[Supabase Client] Removing missing column '${missingCol}' and retrying update...`);
          delete snakeData[missingCol];
          retries++;
          continue;
        }
      }
      break;
    }

    // Fallback: If 0 rows were updated by primary idColumn on 'employees', attempt matching by email if available
    if (!error && (!updated || updated.length === 0) && table === 'employees') {
      const emailValue = idValue.includes('@') ? idValue : data.email;
      if (emailValue) {
        console.log('[Supabase Client] Retrying employee update by email:', emailValue);
        const retryRes = await supabase
          .from(table)
          .update(snakeData)
          .eq('email', emailValue)
          .select();
        if (retryRes.data && retryRes.data.length > 0) {
          updated = retryRes.data;
        } else if (retryRes.error) {
          error = retryRes.error;
        }
      }
    }

    if (error) {
      console.error('[Supabase Update Error]', error);
      throw new Error(`Supabase Update Failed: ${error.message}`);
    }
    if (!updated || updated.length === 0) {
      throw new Error(
        `Supabase Update Failed: no ${table} row matched ${snakeColumn}=${idValue}.`
      );
    }

    return toCamelCase(updated[0]);
  },

  async delete(table: string, idValue: string, idColumn: string = 'id'): Promise<any> {
    if (!supabase) return;
    console.log('[Supabase Client] Deleting record from:', table, { idColumn, idValue });
    const snakeColumn = idColumn.replace(/([A-Z])/g, '_$1').toLowerCase();
    let { data: deleted, error } = await supabase
      .from(table)
      .delete()
      .eq(snakeColumn, idValue)
      .select();

    if (!error && (!deleted || deleted.length === 0) && table === 'employees' && idValue.includes('@')) {
      const retryRes = await supabase
        .from(table)
        .delete()
        .eq('email', idValue)
        .select();
      deleted = retryRes.data;
      error = retryRes.error;
    }

    if (error) {
      console.error('[Supabase Delete Error]', error);
      throw new Error(`Supabase Delete Failed: ${error.message}`);
    }
    if (!deleted || deleted.length === 0) {
      throw new Error(
        `Supabase Delete Failed: no ${table} row matched ${snakeColumn}=${idValue}.`
      );
    }
    return toCamelCase(deleted[0]);
  },

  async upsert(table: string, data: any): Promise<any> {
    if (!supabase) return data;
    console.log('[Supabase Client] Upserting record in:', table, data);
    let snakeData = toSnakeCase(data);
    let upserted: any = null;
    let error: any = null;
    let retries = 0;
    const maxRetries = Object.keys(snakeData).length + 1;

    while (retries < maxRetries) {
      const res = await supabase.from(table).upsert(snakeData).select().single();
      error = res.error;
      upserted = res.data;
      if (error) {
        const missingCol = extractMissingColumn(error.message || '');
        if (missingCol && snakeData[missingCol] !== undefined) {
          console.warn(`[Supabase Client] Removing missing column '${missingCol}' and retrying upsert...`);
          delete snakeData[missingCol];
          retries++;
          continue;
        }
      }
      break;
    }

    if (error) {
      console.error('[Supabase Upsert Error]', error);
      throw new Error(`Supabase Upsert Failed: ${error.message}`);
    }
    return toCamelCase(upserted);
  },

  async uploadFile(file: File): Promise<string> {
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }
    const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const { data, error } = await supabase.storage.from('hr-documents').upload(fileName, file);
    if (error) {
      console.error('[Supabase Storage Error]', error);
      throw new Error(`Upload Failed: ${error.message}`);
    }
    const { data: publicUrlData } = supabase.storage.from('hr-documents').getPublicUrl(data.path);
    return publicUrlData.publicUrl;
  }
};
