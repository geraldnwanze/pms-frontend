'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { classNames } from '@/lib/format';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  // Keyboard users: when the dialog opens, focus moves into it (so a screen reader announces it and Tab starts inside it); Tab and
  // Shift+Tab stay inside while it is open; and when it closes, focus goes back to whatever opened it. Only `open` matters here, not
  // the identity of onClose, so a re-render with a new callback does not yank focus around.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    return () => {
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      else if (!panel.current.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    };
    document.addEventListener('keydown', onTab);
    return () => document.removeEventListener('keydown', onTab);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const maxW = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={classNames('relative z-10 my-8 w-full animate-fade-in', maxW)}>
        <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabIndex={-1} className="card overflow-hidden outline-none">
          {(title || subtitle) && (
            <div className="flex items-start justify-between gap-3 border-b border-ink-200/70 px-5 py-4">
              <div>
                {title && <h3 id={titleId} className="text-base font-bold text-ink-900">{title}</h3>}
                {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="btn-ghost -mr-2 -mt-1 p-2" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-200/70 bg-ink-50/50 px-5 py-3">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink-600">{message}</p>
    </Modal>
  );
}
