'use client';

import { useMemo, useState } from 'react';
import { FolderOpen, Upload, Trash2, FileText, Download } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectData, selectCurrentUser, scopedPropertyIds } from '@/store/selectors';
import { dataActions } from '@/store/dataSlice';
import { pushToast } from '@/store/uiSlice';
import {
  PageHeader, Card, StatCard, Badge, DataTable, type Column, ExportMenu,
  Modal, Field, Select, FileDrop, ConfirmDialog, type UploadedFile,
} from '@/components/ui';
import { can } from '@/config/roles';
import { formatDate, uid, classNames } from '@/lib/format';
import type { DocumentRecord, DocumentCategory } from '@/types';

const CATEGORIES: DocumentCategory[] = ['deed', 'lease-agreement', 'tenant-id', 'guarantor', 'inspection', 'invoice', 'receipt', 'maintenance', 'vendor-contract', 'insurance', 'tax', 'other'];
const catLabel = (c: DocumentCategory) => c.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const TYPE_CLASS: Record<DocumentRecord['fileType'], string> = {
  pdf: 'bg-red-50 text-red-600',
  docx: 'bg-blue-50 text-blue-600',
  jpg: 'bg-purple-50 text-purple-600',
  png: 'bg-green-50 text-green-600',
};
const fileTypeFromName = (name: string): DocumentRecord['fileType'] => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'png') return 'png';
  return 'jpg';
};

export function Documents() {
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const dispatch = useAppDispatch();
  const [category, setCategory] = useState<DocumentCategory | 'all'>('all');
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canManage = can(user?.role, 'manage_documents');

  const all = useMemo(
    () => data.documents.filter((d) => !d.propertyId || scoped.has(d.propertyId)).slice().sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    [data.documents, scoped],
  );
  const rows = category === 'all' ? all : all.filter((d) => d.category === category);

  const totalMb = (all.reduce((s, d) => s + d.sizeKb, 0) / 1024).toFixed(1);
  const propName = (id?: string) => id ? data.properties.find((p) => p.id === id)?.name : undefined;
  const unitCode = (id?: string) => id ? data.units.find((u) => u.id === id)?.code : undefined;
  const tenantName = (id?: string) => id ? data.tenants.find((t) => t.id === id)?.name : undefined;
  const uploader = (id: string) => data.users.find((u) => u.id === id)?.name ?? '—';

  const linkedTo = (d: DocumentRecord) => {
    const t = tenantName(d.tenantId); if (t) return t;
    const u = unitCode(d.unitId); if (u) return `Unit ${u}`;
    const p = propName(d.propertyId); if (p) return p;
    return 'Portfolio';
  };

  const exportRows = rows.map((d) => ({ Name: d.name, Category: catLabel(d.category), Type: d.fileType.toUpperCase(), Size_KB: d.sizeKb, LinkedTo: linkedTo(d), Uploaded: d.uploadedAt, By: uploader(d.uploadedById) }));

  const columns: Column<DocumentRecord>[] = [
    { key: 'name', header: 'Document', sortValue: (d) => d.name, render: (d) => <div className="flex items-center gap-2.5"><span className={classNames('flex h-9 w-9 items-center justify-center rounded-lg text-[11px] font-bold uppercase', TYPE_CLASS[d.fileType])}>{d.fileType}</span><div className="min-w-0"><p className="truncate font-medium text-ink-800">{d.name}</p><p className="text-xs capitalize text-ink-400">{catLabel(d.category)}</p></div></div> },
    { key: 'linked', header: 'Linked to', sortValue: (d) => linkedTo(d), render: (d) => <span className="text-sm text-ink-600">{linkedTo(d)}</span> },
    { key: 'size', header: 'Size', align: 'right', sortValue: (d) => d.sizeKb, render: (d) => <span className="text-sm text-ink-500">{d.sizeKb.toLocaleString()} KB</span> },
    { key: 'uploaded', header: 'Uploaded', sortValue: (d) => d.uploadedAt, render: (d) => <div><p className="text-sm text-ink-600">{formatDate(d.uploadedAt)}</p><p className="text-xs text-ink-400">{uploader(d.uploadedById)}</p></div> },
    { key: 'actions', header: '', align: 'right', render: (d) => (
      <div className="flex items-center justify-end gap-1">
        <button className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600" title="Download" onClick={() => dispatch(pushToast({ id: uid('t'), kind: 'info', message: `Preparing "${d.name}"…` }))}><Download className="h-4 w-4" /></button>
        {canManage && <button className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Delete" onClick={() => setDeleteId(d.id)}><Trash2 className="h-4 w-4" /></button>}
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Documents" subtitle="Central library for deeds, agreements, receipts and files"
        actions={<>
          <ExportMenu filename="documents" title="Document register" rows={exportRows} size="md" />
          {canManage && <button className="btn-primary" onClick={() => setUploading(true)}><Upload className="h-4 w-4" /> Upload</button>}
        </>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Documents" value={all.length} icon={<FolderOpen className="h-5 w-5" />} tone="blue" />
        <StatCard label="Total size" value={`${totalMb} MB`} icon={<FileText className="h-5 w-5" />} tone="purple" />
        <StatCard label="Agreements" value={all.filter((d) => d.category === 'lease-agreement').length} icon={<FileText className="h-5 w-5" />} tone="green" />
        <StatCard label="Categories" value={new Set(all.map((d) => d.category)).size} icon={<FolderOpen className="h-5 w-5" />} tone="amber" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm text-ink-500">Category</label>
        <Select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory | 'all')} className="max-w-[220px]">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
        </Select>
        {category !== 'all' && <Badge tone="gray">{rows.length} shown</Badge>}
      </div>

      <Card padded={false}>
        <DataTable columns={columns} rows={rows} keyOf={(d) => d.id}
          searchable searchAccessor={(d) => `${d.name} ${catLabel(d.category)} ${linkedTo(d)}`} searchPlaceholder="Search documents…"
          initialSort={{ key: 'uploaded', dir: 'desc' }} emptyTitle="No documents" />
      </Card>

      {uploading && <UploadModal onClose={() => setUploading(false)} />}
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} danger
        title="Delete document?" message="This will permanently remove the document from the library. This action is logged in the audit trail."
        confirmLabel="Delete" onConfirm={() => { if (deleteId) { dispatch(dataActions.deleteDocument({ id: deleteId, actorId: user!.id })); dispatch(pushToast({ id: uid('t'), kind: 'success', message: 'Document deleted.' })); } setDeleteId(null); }} />
    </div>
  );
}

function UploadModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectData);
  const user = useAppSelector(selectCurrentUser);
  const scoped = useAppSelector(scopedPropertyIds);
  const properties = useMemo(() => data.properties.filter((p) => scoped.has(p.id)), [data.properties, scoped]);

  const [file, setFile] = useState<UploadedFile | null>(null);
  const [category, setCategory] = useState<DocumentCategory>('other');
  const [propertyId, setPropertyId] = useState('');

  const submit = () => {
    if (!file) { dispatch(pushToast({ id: uid('t'), kind: 'error', message: 'Choose a file to upload.' })); return; }
    dispatch(dataActions.addDocument({
      name: file.name, category, fileType: fileTypeFromName(file.name), sizeKb: file.sizeKb || 100,
      propertyId: propertyId || undefined, uploadedById: user!.id,
    }));
    dispatch(pushToast({ id: uid('t'), kind: 'success', message: `"${file.name}" uploaded.` }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Upload document" size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}><Upload className="h-4 w-4" /> Upload</button></>}>
      <div className="space-y-4">
        <FileDrop label="File" accept=".pdf,.docx,.doc,.jpg,.jpeg,.png" value={file ?? undefined} onFile={setFile} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>{CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</Select></Field>
          <Field label="Property (optional)"><Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">Portfolio-wide</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        </div>
      </div>
    </Modal>
  );
}
