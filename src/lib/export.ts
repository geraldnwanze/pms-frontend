import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type Row = Record<string, string | number>;

/** Download a CSV built from an array of flat objects. */
export function exportToCsv(filename: string, rows: Row[]) {
  if (rows.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
}

/** Download an .xlsx workbook from an array of flat objects. */
export function exportToExcel(filename: string, sheetName: string, rows: Row[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Sheet1');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** Generate a branded PDF table report. */
export function exportToPdf(opts: {
  filename: string;
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number)[][];
  meta?: Record<string, string>;
}) {
  const doc = new jsPDF({ orientation: opts.columns.length > 6 ? 'landscape' : 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(5, 150, 105);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('PMS', 14, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Property Management System', 14, 19);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(opts.title, 14, 38);
  let y = 44;
  if (opts.subtitle) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(opts.subtitle, 14, y);
    y += 6;
  }

  if (opts.meta) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    Object.entries(opts.meta).forEach(([k, v]) => {
      doc.text(`${k}: ${v}`, 14, y);
      y += 5;
    });
  }

  autoTable(doc, {
    head: [opts.columns],
    body: opts.rows,
    startY: y + 2,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Generated ${new Date().toLocaleString('en-NG')} · Page ${i} of ${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 8,
    );
  }

  doc.save(`${opts.filename}.pdf`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
