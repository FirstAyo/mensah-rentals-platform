'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

export function AccessibleDialog({
  children,
  descriptionId,
  initialFocusRef,
  onClose,
  open,
  returnFocusRef,
  titleId,
}: {
  children: ReactNode;
  descriptionId?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  open: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  titleId: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    restoreFocusRef.current =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    if (!dialog.open) dialog.showModal();
    initialFocusRef?.current?.focus();
    return () => {
      const restoreFocus = restoreFocusRef.current;
      if (dialog.open) dialog.close();
      window.setTimeout(() => restoreFocus?.focus(), 0);
    };
  }, [initialFocusRef, open, returnFocusRef]);

  if (!open) return null;
  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/60"
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
