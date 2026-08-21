import { jsPDF } from 'jspdf';
import {
  AppraisalKpiRow,
  AppraisalScoreSummary,
  PerformanceAppraisalDraft,
} from './performanceAppraisalDraft';

export interface AppraisalPdfExportOptions {
  draft: PerformanceAppraisalDraft;
  scores: AppraisalScoreSummary;
  mode: 'manager' | 'employee';
  companyName?: string;
  branding?: Partial<AppraisalPdfBranding>;
  generatedAt?: Date;
}

export interface AppraisalPdfResult {
  filename: string;
  bytes: Uint8Array;
}

export interface AppraisalPdfBranding {
  primary: [number, number, number];
  accent: [number, number, number];
  dark: [number, number, number];
  surface: [number, number, number];
  background: [number, number, number];
  border: [number, number, number];
  ink: [number, number, number];
  muted: [number, number, number];
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
const CONTENT_BOTTOM = 277;
const LINE_HEIGHT = 4.2;
const DEFAULT_COMPANY_NAME = 'YSYD HRMS';
const WHITE: [number, number, number] = [255, 255, 255];
const DEFAULT_BRANDING: AppraisalPdfBranding = {
  primary: [130, 85, 0],
  accent: [244, 163, 0],
  dark: [44, 49, 52],
  surface: [239, 244, 248],
  background: [245, 250, 254],
  border: [217, 222, 226],
  ink: [23, 28, 31],
  muted: [82, 69, 51],
};

const parseCssColor = (value: string, fallback: [number, number, number]): [number, number, number] => {
  const normalized = value.trim();
  const hex = normalized.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return [
      Number.parseInt(hex[1].slice(0, 2), 16),
      Number.parseInt(hex[1].slice(2, 4), 16),
      Number.parseInt(hex[1].slice(4, 6), 16),
    ] as [number, number, number];
  }

  const rgb = normalized.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }

  return fallback;
};

export const getAppraisalPdfBranding = (companyName = DEFAULT_COMPANY_NAME): {
  companyName: string;
  branding: AppraisalPdfBranding;
} => {
  if (typeof document === 'undefined') {
    return { companyName, branding: DEFAULT_BRANDING };
  }

  const styles = window.getComputedStyle(document.documentElement);
  const read = (variable: string, fallback: [number, number, number]) => (
    parseCssColor(styles.getPropertyValue(variable), fallback)
  );

  return {
    companyName,
    branding: {
      primary: read('--color-primary', DEFAULT_BRANDING.primary),
      accent: read('--color-primary-container', DEFAULT_BRANDING.accent),
      dark: read('--color-inverse-surface', DEFAULT_BRANDING.dark),
      surface: read('--color-surface-container-low', DEFAULT_BRANDING.surface),
      background: read('--color-background', DEFAULT_BRANDING.background),
      border: read('--color-neutral-border', DEFAULT_BRANDING.border),
      ink: read('--color-on-background', DEFAULT_BRANDING.ink),
      muted: read('--color-on-surface-variant', DEFAULT_BRANDING.muted),
    },
  };
};

const asText = (value: unknown, fallback = '-') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const asScore = (value: number | '') => (value === '' ? '-' : Number(value).toFixed(1));

const toValidDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getKualaLumpurParts = (value: string | Date) => {
  const date = toValidDate(value);
  if (!date) return null;

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
};

export const formatAppraisalTimestamp = (value: string | Date) => {
  const parts = getKualaLumpurParts(value);
  if (!parts) return '-';
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} GMT+8`;
};

const formatFilenameTimestamp = (value: string | Date) => {
  const parts = getKualaLumpurParts(value);
  if (!parts) return 'unknown_date';
  return `${parts.year}_${parts.month}_${parts.day}_${parts.hour}${parts.minute}${parts.second}`;
};

export const sanitizeAppraisalFilename = (value: string) => {
  const sanitized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'Appraisal';
};

const splitText = (doc: jsPDF, value: unknown, width: number) => (
  doc.splitTextToSize(asText(value), width) as string[]
);

const drawTextLines = (
  doc: jsPDF,
  lines: string[],
  x: number,
  y: number,
  lineHeight = LINE_HEIGHT
) => {
  doc.text(lines, x, y, { baseline: 'top' });
  return y + (Math.max(lines.length, 1) * lineHeight);
};

const getKpiEvidenceSummary = (row: AppraisalKpiRow) => {
  const evidence = row.evidence;
  return [
    asText(evidence.evidenceType),
    `Completion: ${evidence.completionPercent === '' ? '-' : `${evidence.completionPercent}%`}`,
    evidence.evidenceLink ? `Link: ${evidence.evidenceLink}` : '',
  ].filter(Boolean).join('\n');
};

const buildFilename = (draft: PerformanceAppraisalDraft, generatedAt: Date) => {
  const employee = sanitizeAppraisalFilename(draft.employeeInfo.employeeName || draft.employeeId);
  const review = sanitizeAppraisalFilename(draft.reviewType || draft.subtitle || 'Performance_Appraisal');
  return `SANDBOX_REVIEW_COPY_${employee}_${review}_${formatFilenameTimestamp(generatedAt)}.pdf`;
};

const addPageFooter = (doc: jsPDF, branding: AppraisalPdfBranding) => {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...branding.border);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, PAGE_HEIGHT - 13, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...branding.muted);
    doc.text('SANDBOX REVIEW COPY', MARGIN, PAGE_HEIGHT - 8);
    doc.text(`Page ${page} of ${pageCount}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 8, { align: 'right' });
  }
};

export const buildAppraisalPdf = ({
  draft,
  scores,
  mode,
  companyName = DEFAULT_COMPANY_NAME,
  branding: brandingOverrides,
  generatedAt = new Date(),
}: AppraisalPdfExportOptions): AppraisalPdfResult => {
  const branding: AppraisalPdfBranding = { ...DEFAULT_BRANDING, ...brandingOverrides } as AppraisalPdfBranding;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: false,
  });
  doc.setProperties({
    title: `Sandbox Appraisal Review - ${draft.employeeInfo.employeeName}`,
    subject: 'Timestamped appraisal sandbox review copy',
    author: companyName,
    creator: companyName,
  });

  let y = 0;

  const drawPageHeader = (firstPage: boolean) => {
    if (firstPage) {
      doc.setFillColor(...branding.dark);
      doc.rect(0, 0, PAGE_WIDTH, 27, 'F');
      doc.setTextColor(...WHITE);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(companyName, MARGIN, 8);
      doc.setFontSize(10);
      doc.text('Performance Appraisal Review', MARGIN, 15);
      doc.setFontSize(8);
      doc.text('SANDBOX REVIEW COPY', PAGE_WIDTH - MARGIN, 8, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.text(mode === 'manager' ? 'Manager report' : 'Employee report', PAGE_WIDTH - MARGIN, 15, { align: 'right' });
      doc.setFillColor(...branding.accent);
      doc.rect(0, 27, PAGE_WIDTH, 1.5, 'F');
      y = 36;
      return;
    }

    doc.setFillColor(...branding.dark);
    doc.rect(0, 0, PAGE_WIDTH, 13, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`${companyName} | Performance Appraisal | SANDBOX REVIEW COPY`, MARGIN, 8);
    y = 20;
  };

  const addPage = () => {
    doc.addPage();
    drawPageHeader(false);
  };

  const ensureSpace = (height: number) => {
    if (y + height > CONTENT_BOTTOM) addPage();
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(11);
    doc.setFillColor(...branding.primary);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 8, 1, 1, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(title, MARGIN + 3, y + 2.1, { baseline: 'top' });
    y += 11;
  };

  const drawLabeledBlock = (label: string, value: unknown, width = CONTENT_WIDTH) => {
    ensureSpace(8);
    doc.setTextColor(...branding.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(label.toUpperCase(), MARGIN, y, { baseline: 'top' });
    y += 3.7;

    const lines = splitText(doc, value, width);
    let remaining = lines;
    while (remaining.length > 0) {
      const availableLines = Math.max(1, Math.floor((CONTENT_BOTTOM - y) / LINE_HEIGHT));
      const currentLines = remaining.splice(0, availableLines);
      doc.setTextColor(...branding.ink);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      y = drawTextLines(doc, currentLines, MARGIN, y);
      if (remaining.length > 0) {
        addPage();
      }
    }
    y += 2.5;
  };

  const drawKeyValueGrid = (items: Array<[string, unknown]>, columns = 2) => {
    const gap = 5;
    const cellWidth = (CONTENT_WIDTH - (gap * (columns - 1))) / columns;
    const rows: Array<Array<[string, unknown]>> = [];
    for (let index = 0; index < items.length; index += columns) {
      rows.push(items.slice(index, index + columns));
    }

    rows.forEach((row) => {
      const cellLines = row.map(([, value]) => splitText(doc, value, cellWidth - 6));
      const rowHeight = Math.max(...cellLines.map((lines) => Math.max(lines.length, 1) * LINE_HEIGHT + 10), 16);
      ensureSpace(rowHeight + 2);
      row.forEach(([label, value], index) => {
        const x = MARGIN + (index * (cellWidth + gap));
        doc.setFillColor(...branding.surface);
        doc.setDrawColor(...branding.border);
        doc.roundedRect(x, y, cellWidth, rowHeight, 1.5, 1.5, 'FD');
        doc.setTextColor(...branding.primary);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text(label.toUpperCase(), x + 3, y + 2.5);
        doc.setTextColor(...branding.ink);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(cellLines[index], x + 3, y + 6, { baseline: 'top' });
      });
      y += rowHeight + 3;
    });
  };

  const drawTable = (
    headers: string[],
    rows: string[][],
    widths: number[]
  ) => {
    const headerHeight = 9;
    const cellPadding = 1.5;
    const fontSize = 7;
    const lineHeight = 3.4;

    const drawHeader = () => {
      doc.setFillColor(...branding.primary);
      doc.setTextColor(...WHITE);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fontSize);
      let x = MARGIN;
      headers.forEach((header, index) => {
        doc.setFillColor(...branding.primary);
        doc.setTextColor(...WHITE);
        doc.rect(x, y, widths[index], headerHeight, 'F');
        doc.text(splitText(doc, header, widths[index] - (cellPadding * 2)), x + cellPadding, y + 2, { baseline: 'top' });
        x += widths[index];
      });
      y += headerHeight;
    };

    ensureSpace(headerHeight + 2);
    drawHeader();
    rows.forEach((row) => {
      const cellLines = row.map((cell, index) => splitText(doc, cell, widths[index] - (cellPadding * 2)));
      const rowHeight = Math.max(...cellLines.map((lines) => Math.max(lines.length, 1) * lineHeight + (cellPadding * 2)), 7);
      if (y + rowHeight > CONTENT_BOTTOM) {
        addPage();
        drawHeader();
      }

      let x = MARGIN;
      row.forEach((_, index) => {
        doc.setFillColor(index % 2 === 0 ? WHITE[0] : branding.background[0], index % 2 === 0 ? WHITE[1] : branding.background[1], index % 2 === 0 ? WHITE[2] : branding.background[2]);
        doc.setDrawColor(...branding.border);
        doc.rect(x, y, widths[index], rowHeight, 'FD');
        doc.setTextColor(...branding.ink);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSize);
        doc.text(cellLines[index], x + cellPadding, y + cellPadding, { baseline: 'top' });
        x += widths[index];
      });
      y += rowHeight;
    });
    y += 4;
  };

  const drawCommentGrid = (items: Array<[string, unknown]>) => {
    items.forEach(([label, value]) => drawLabeledBlock(label, value));
  };

  drawPageHeader(true);
  doc.setTextColor(...branding.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(asText(draft.title, 'Performance Appraisal'), MARGIN, y);
  y += 5;
  doc.setTextColor(...branding.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(asText(draft.subtitle), MARGIN, y);
  y += 5;
  drawKeyValueGrid([
    ['Status', draft.status],
    ['Report mode', mode === 'manager' ? 'Manager' : 'Employee'],
    ['Generated at', formatAppraisalTimestamp(generatedAt)],
    ['Last saved at', formatAppraisalTimestamp(draft.updatedAt)],
  ]);

  drawSectionTitle('1. Employee and Review Information');
  drawKeyValueGrid([
    ['Employee name', draft.employeeInfo.employeeName],
    ['Employee ID / IC', draft.employeeInfo.employeeIdOrIc],
    ['Position title', draft.employeeInfo.positionTitle],
    ['Department', draft.employeeInfo.department],
    ['Appraiser name', draft.appraiserName],
    ['Review type', draft.reviewType],
    ['Review period', `${asText(draft.reviewFrom)} to ${asText(draft.reviewTo)}`],
    ['Probation stage', draft.probationStage],
    ['Probation end date', draft.probationEndDate],
    ['Project name', draft.projectName],
    ['Project client', draft.projectClient],
  ]);
  drawLabeledBlock('Review purpose', draft.reviewPurpose);

  drawSectionTitle('2. Key Performance Indicators - 60%');
  draft.kpiCategories.forEach((category) => {
    ensureSpace(10);
    doc.setFillColor(...branding.surface);
    doc.setTextColor(...branding.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 7, 1, 1, 'F');
    doc.text(asText(category.name, 'KPI Category'), MARGIN + 3, y + 2, { baseline: 'top' });
    y += 9;

    const kpiRows = category.rows.map((row) => [
      asText(row.kra),
      asText(row.outcome),
      `${row.weight}%`,
      asScore(row.appraiseeScore),
      asScore(row.agreedScore),
      asText(row.evidence.achievement),
      asText(row.evidence.managerVerification),
      getKpiEvidenceSummary(row),
      asText(row.evidence.status),
    ]);
    drawTable(
      ['KRA', 'Expected outcome', 'Wt.', 'Self', 'Agreed', 'Achievement / result', 'Verification', 'Evidence', 'Status'],
      kpiRows,
      [24, 29, 9, 10, 13, 31, 28, 25, 13]
    );
  });
  if (draft.kpiCategories.length === 0) drawLabeledBlock('KPI categories', 'No KPI categories recorded.');

  drawSectionTitle('3. Competency and Behavioural Assessment - 40%');
  drawTable(
    ['Competency', 'Description', 'Self', 'Agreed', 'Appraisee comment', 'Manager comment', 'Supporting example'],
    draft.competencies.map((competency) => [
      asText(competency.name),
      asText(competency.description),
      asScore(competency.appraiseeRating),
      asScore(competency.agreedRating),
      asText(competency.appraiseeComment),
      asText(competency.managerComment),
      asText(competency.supportingExample),
    ]),
    [27, 37, 10, 10, 31, 31, 36]
  );

  drawSectionTitle('4. Overall Scoring Summary');
  drawTable(
    ['Measure', 'Raw / average', 'Weighted points', 'Notes'],
    [
      ['KPI score', `${scores.kpiRawPercent.toFixed(2)}%`, `${scores.kpiWeightedPoints.toFixed(2)} / 60`, `Weight total: ${scores.kpiWeightTotal.toFixed(1)}%`],
      ['Competency score', `${scores.competencyRawPercent.toFixed(2)}%`, `${scores.competencyWeightedPoints.toFixed(2)} / 40`, `Average: ${scores.competencyAgreedAverage.toFixed(2)} / 5`],
      ['Total score', `${scores.totalPoints.toFixed(2)} / 100`, `${scores.finalRating || '-'} / 5`, scores.tierLabel],
    ],
    [38, 38, 43, 63]
  );

  drawSectionTitle('5. Qualitative Comments and Development');
  drawCommentGrid([
    ['Employee overall comment', draft.qualitative.employeeOverallComment],
    ['Key strengths', draft.qualitative.keyStrengths],
    ['Main areas for improvement', draft.qualitative.improvementAreas],
    ['Support and training required', draft.qualitative.supportTraining],
    ['Next review objectives', draft.qualitative.nextObjectives],
    ['Manager overall feedback', draft.qualitative.managerOverallComment],
  ]);

  if (mode === 'manager') {
    drawSectionTitle('6. Management Usage Only');
    drawKeyValueGrid([
      ['Management decision', draft.management.decision],
      ['Effective date', draft.management.effectiveDate],
      ['New position', draft.management.newPosition],
      ['New probation end date', draft.management.newProbationEndDate],
    ]);
    drawLabeledBlock('Reason / notes', draft.management.decision === 'Other' ? draft.management.other : draft.management.reason);
  }

  drawSectionTitle(mode === 'manager' ? '7. Acknowledgement and Signatures' : '6. Acknowledgement and Signatures');
  drawLabeledBlock(
    'Acknowledgement',
    'I acknowledge that this appraisal has been reviewed and discussed with me. Acknowledgement confirms receipt and discussion, not necessarily agreement with every rating or comment.'
  );
  ensureSpace(38);
  const signatureGap = 4;
  const signatureWidth = (CONTENT_WIDTH - (signatureGap * 2)) / 3;
  const signatureItems = [
    ['Appraisee', draft.signatures.appraiseeName, draft.signatures.appraiseeDate],
    ['Appraiser', draft.signatures.appraiserName, draft.signatures.appraiserDate],
    ['HR reviewer', draft.signatures.hrReviewerName, draft.signatures.hrReviewerDate],
  ];
  signatureItems.forEach(([label, name, date], index) => {
    const x = MARGIN + (index * (signatureWidth + signatureGap));
    doc.setDrawColor(...branding.border);
    doc.setFillColor(...branding.surface);
    doc.roundedRect(x, y, signatureWidth, 34, 1.5, 1.5, 'FD');
    doc.setTextColor(...branding.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(label.toUpperCase(), x + 3, y + 3);
    doc.setDrawColor(...branding.muted);
    doc.line(x + 3, y + 19, x + signatureWidth - 3, y + 19);
    doc.setTextColor(...branding.ink);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(asText(name, 'Signature / name'), x + 3, y + 22);
    doc.setFontSize(7);
    doc.setTextColor(...branding.muted);
    doc.text(`Date: ${asText(date)}`, x + 3, y + 29);
  });

  addPageFooter(doc, branding);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  return {
    filename: buildFilename(draft, generatedAt),
    bytes,
  };
};

export const downloadAppraisalPdf = (options: AppraisalPdfExportOptions) => {
  const result = buildAppraisalPdf(options);
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('PDF downloads are only available in a browser.');
  }

  const blob = new Blob([result.bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return result.filename;
};
