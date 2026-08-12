import { Employee, EmployeePerformance, CorporateEntity } from '../types';

const googleScriptUrl = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_GOOGLE_SCRIPT_URL : process.env.VITE_GOOGLE_SCRIPT_URL) || '';

export const isGoogleConfigured = !!googleScriptUrl && !googleScriptUrl.includes('placeholder') && googleScriptUrl.trim() !== '';

if (!isGoogleConfigured) {
  console.warn(
    '[Google Sheets Config] Missing VITE_GOOGLE_SCRIPT_URL in your .env.local file. ' +
    'The app will fall back to local mock data until configuration is completed.'
  );
}

// Interface for what doGet returns
export interface SheetsDataPayload {
  corporate_entities: any[];
  employees: any[];
  performances: any[];
  users: any[];
  audit_logs: any[];
  candidates?: any[];
  payroll_records_2026?: any[];
}

export const googleSheetsClient = {
  async loadData(customScriptUrl?: string): Promise<SheetsDataPayload> {
    const targetUrl = customScriptUrl || googleScriptUrl;
    if (!targetUrl) {
      throw new Error('Google Sheets client is not configured.');
    }
    const response = await fetch(targetUrl, {
      method: 'GET'
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Failed to load data from Google Sheets');
    }
    return result.data;
  },

  async insert(sheetName: string, data: any, customScriptUrl?: string): Promise<any> {
    const targetUrl = customScriptUrl || googleScriptUrl;
    if (!targetUrl) return;
    console.log('[Google Sheets Client] Inserting record:', { sheetName, data });
    console.log('[Google Sheets Client] Target Web App URL:', targetUrl);
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'insert',
        sheetName,
        data
      }),
      redirect: 'follow'
    });
    const result = await response.json();
    if (!result.success) {
      console.error('[Google Sheets Client Error]', result.error, result.stack);
      throw new Error(result.error || `Failed to insert record into ${sheetName}`);
    }
    return result.record || data;
  },

  async update(sheetName: string, keyValue: string, data: any, keyName: string = 'id', customScriptUrl?: string): Promise<any> {
    const targetUrl = customScriptUrl || googleScriptUrl;
    if (!targetUrl) return;
    console.log('[Google Sheets Client] Updating record:', { sheetName, keyName, keyValue, data });
    console.log('[Google Sheets Client] Target Web App URL:', targetUrl);
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'update',
        sheetName,
        keyName,
        keyValue,
        data
      }),
      redirect: 'follow'
    });
    const result = await response.json();
    if (!result.success) {
      console.error('[Google Sheets Client Error]', result.error, result.stack);
      throw new Error(result.error || `Failed to update record in ${sheetName}`);
    }
    return result.record || data;
  },

  async delete(sheetName: string, keyValue: string, keyName: string = 'id', customScriptUrl?: string): Promise<any> {
    const targetUrl = customScriptUrl || googleScriptUrl;
    if (!targetUrl) return;
    console.log('[Google Sheets Client] Deleting record:', { sheetName, keyName, keyValue });
    console.log('[Google Sheets Client] Target Web App URL:', targetUrl);
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'delete',
        sheetName,
        keyName,
        keyValue
      }),
      redirect: 'follow'
    });
    const result = await response.json();
    if (!result.success) {
      console.error('[Google Sheets Client Error]', result.error, result.stack);
      throw new Error(result.error || `Failed to delete record from ${sheetName}`);
    }
    return result;
  },

  async clearData(
    sheetNames: string[],
    customScriptUrl?: string
  ): Promise<{ clearedSheets: string[] }> {
    const targetUrl = customScriptUrl || googleScriptUrl;
    if (!targetUrl) {
      return { clearedSheets: [] };
    }
    console.log('[Google Sheets Client] Clearing data from sheets:', { sheetNames, targetUrl });
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'clear_data',
        sheetNames
      }),
      redirect: 'follow'
    });
    const result = await response.json();
    if (!result.success) {
      console.error('[Google Sheets Client Error]', result.error, result.stack);
      throw new Error(result.error || 'Failed to clear Google Sheets data');
    }
    return {
      clearedSheets: Array.isArray(result.clearedSheets) ? result.clearedSheets : sheetNames
    };
  },

  async upsert(sheetName: string, query: Record<string, string>, data: any, customScriptUrl?: string): Promise<any> {
    const targetUrl = customScriptUrl || googleScriptUrl;
    if (!targetUrl) return;
    console.log('[Google Sheets Client] Upserting record:', { sheetName, query, data });
    console.log('[Google Sheets Client] Target Web App URL:', targetUrl);
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'upsert',
        sheetName,
        query,
        data
      }),
      redirect: 'follow'
    });
    const result = await response.json();
    if (!result.success) {
      console.error('[Google Sheets Client Error]', result.error, result.stack);
      throw new Error(result.error || `Failed to upsert record in ${sheetName}`);
    }
    return result.record || data;
  },

  async diagnose(customScriptUrl?: string): Promise<any> {
    const targetUrl = customScriptUrl || googleScriptUrl;
    if (!targetUrl) {
      throw new Error('Google Sheets client is not configured.');
    }
    console.log('[Google Sheets Client] Running Backend Diagnostics on:', targetUrl);
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'diagnose'
      }),
      redirect: 'follow'
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Diagnostic endpoint check failed.');
    }
    return result.diagnostics;
  },

  async uploadFile(file: File, customScriptUrl?: string): Promise<string> {
    const targetUrl = customScriptUrl || googleScriptUrl;
    if (!targetUrl) {
      throw new Error('Google Sheets client is not configured.');
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
              action: 'upload_file',
              base64,
              filename: file.name,
              contentType: file.type
            }),
            redirect: 'follow'
          });
          const result = await response.json();
          if (result.success && result.url) {
            resolve(result.url);
          } else {
            reject(new Error(result.error || 'Failed to upload file to Google Drive'));
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }
};
