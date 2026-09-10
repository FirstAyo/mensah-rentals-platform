'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

export function AccessibleDialog({
  children,
  descriptionId,
  initialFocusRef,
  onClose,
  open,
  titleId,
}: {
  children: ReactNode;
  descriptionId?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  open: boolean;
  titleId: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    initialFocusRef?.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      window.setTimeout(() => returnFocus.current?.focus(), 0);
    };
  }, [initialFocusRef, open]);
  if (!open) return null;
  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/60"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      {children}
    </dialog>
  );
}
