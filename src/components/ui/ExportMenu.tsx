'use client';

import { useState } from 'react';
import { Download, FileText, FileSpreadsheet, FileType } from 'lucide-react';
import { useOnClickOutside } from '@/lib/hooks';
import { exportToCsv, exportToExcel, exportToPdf, type Row } from '@/lib/export';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import { selectCurrentUser } from '@/store/selectors';
import { uid } from '@/lib/format';

/**
 * Reusable export control. Give it a flat array of row objects; it derives the
 * PDF columns from the keys. Emits an audit log + toast on export.
 */
export function ExportMenu({
  filename,
  title,
  rows,
  subtitle,
  size = 'sm',
}: {
  filename: string;
  title: string;
  rows: Row[];
  subtitle?: string;
  size?: 'sm' | 'md';
}) {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const [open, setOpen] = useState(false);
  const ref = useOnClickOutside<HTMLDivElement>(() => setOpen(false));

  const columns = rows.length ? Object.keys(rows[0]) : [];

  const audit = (fmt: string) => {
    dispatch(dataActions.recordAudit({
      action: 'export', entity: title, userId: user?.id ?? 'system',
      summary: `Exported ${rows.length} ${title} row(s) as ${fmt}`,
    }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `${title} exported as ${fmt}.` }));
    setOpen(false);
  };

  const disabled = rows.length === 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className={size === 'md' ? 'btn-secondary' : 'btn-secondary px-3 py-2 text-xs'}
      >
        <Download className="h-4 w-4" />
        Export
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-44 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-pop">
          <ExpRow icon={<FileSpreadsheet className="h-4 w-4 text-emerald-600" />} label="Excel (.xlsx)" onClick={() => { exportToExcel(filename, title, rows); audit('Excel'); }} />
          <ExpRow icon={<FileText className="h-4 w-4 text-blue-600" />} label="CSV (.csv)" onClick={() => { exportToCsv(filename, rows); audit('CSV'); }} />
          <ExpRow icon={<FileType className="h-4 w-4 text-red-600" />} label="PDF (.pdf)" onClick={() => { exportToPdf({ filename, title, subtitle, columns, rows: rows.map((r) => columns.map((c) => r[c])) }); audit('PDF'); }} />
        </div>
      )}
    </div>
  );
}

function ExpRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-ink-700 hover:bg-ink-50">
      {icon}
      {label}
    </button>
  );
}
