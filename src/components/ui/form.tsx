'use client';

import { useRef, useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';
import { classNames } from '@/lib/format';

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={classNames('input', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={classNames('input min-h-[84px] resize-y', props.className)} />;
}

export function Select({
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select {...props} className={classNames('input appearance-none bg-white pr-8', props.className)}>
      {children}
    </select>
  );
}

export interface UploadedFile {
  name: string;
  dataUrl?: string;
  type: string;
  sizeKb: number;
}

/**
 * File drop that reads the selected file into a data URL so uploaded receipts /
 * documents can be previewed in-app (no backend). Images are previewed inline.
 */
export function FileDrop({
  label = 'Upload proof of payment',
  accept = 'image/jpeg,image/png,application/pdf',
  onFile,
  value,
}: {
  label?: string;
  accept?: string;
  onFile: (file: UploadedFile | null) => void;
  value?: UploadedFile | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const meta: UploadedFile = {
      name: file.name,
      type: file.type,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
    };
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => onFile({ ...meta, dataUrl: String(reader.result) });
      reader.readAsDataURL(file);
    } else {
      onFile(meta);
    }
  };

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3">
        {value.dataUrl ? (
          <img src={value.dataUrl} alt={value.name} className="h-14 w-14 rounded-lg object-cover ring-1 ring-ink-200" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-white text-ink-400 ring-1 ring-ink-200">
            <FileText className="h-6 w-6" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-800">{value.name}</p>
          <p className="text-xs text-ink-500">{value.sizeKb} KB</p>
        </div>
        <button type="button" onClick={() => onFile(null)} className="btn-ghost p-2" aria-label="Remove file">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={classNames(
        'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
        dragging ? 'border-brand-500 bg-brand-50' : 'border-ink-300 hover:border-brand-400 hover:bg-ink-50',
      )}
    >
      <UploadCloud className="mb-2 h-6 w-6 text-ink-400" />
      <p className="text-sm font-semibold text-ink-700">{label}</p>
      <p className="mt-0.5 text-xs text-ink-400">JPG, PNG or PDF · click or drag & drop</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
