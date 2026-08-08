'use client';

import { useRef } from 'react';
import { AccessibleDialog } from './accessible-dialog';

export function OperationalConfirmationDialog({
  busy,
  confirmLabel,
  consequence,
  onClose,
  onConfirm,
  open,
  title,
}: {
  busy: boolean;
  confirmLabel: string;
  consequence: string;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AccessibleDialog
      descriptionId="operational-confirm-description"
      initialFocusRef={cancelRef}
      onClose={() => {
        if (!busy) onClose();
      }}
      open={open}
      titleId="operational-confirm-title"
    >
      <div className="p-5 sm:p-6">
        <h2 className="text-xl font-semibold" id="operational-confirm-title">
          {title}
        </h2>
        <p
          className="mt-3 text-sm leading-6 text-muted-foreground"
          id="operational-confirm-description"
        >
          {consequence}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="min-h-11 rounded-lg border px-4 py-2 font-semibold"
            disabled={busy}
            onClick={onClose}
            ref={cancelRef}
            type="button"
          >
            Keep current state
          </button>
          <button
            className="min-h-11 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? 'Recording…' : confirmLabel}
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
}
