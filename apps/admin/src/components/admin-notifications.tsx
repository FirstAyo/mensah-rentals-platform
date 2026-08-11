'use client';

import type { QueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  mutationNotificationFor,
  responseErrorMessage,
} from '@/lib/mutation-notifications';

type ToastKind = 'success' | 'error';
type Toast = { id: number; kind: ToastKind; message: string; closing: boolean };
type NotificationContextValue = {
  notify: (kind: ToastKind, message: string) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

export function useAdminNotifications() {
  const context = useContext(NotificationContext);
  if (!context)
    throw new Error('useAdminNotifications requires AdminNotificationProvider');
  return context;
}

export function AdminNotificationProvider({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>[]>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) =>
      current.map((toast) =>
        toast.id === id ? { ...toast, closing: true } : toast,
      ),
    );
    const remove = setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      timers.current.delete(id);
    }, 250);
    timers.current.set(id, [...(timers.current.get(id) ?? []), remove]);
  }, []);

  const notify = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [
        ...current.slice(-4),
        { id, kind, message, closing: false },
      ]);
      const fade = setTimeout(() => dismiss(id), 4_250);
      timers.current.set(id, [fade]);
    },
    [dismiss],
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const handles of activeTimers.values())
        for (const handle of handles) clearTimeout(handle);
      activeTimers.clear();
    };
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const instrumentedFetch: typeof window.fetch = async (input, init) => {
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.origin,
      );
      const notification =
        url.origin === window.location.origin
          ? mutationNotificationFor(method, url.pathname)
          : null;
      let response: Response;
      try {
        response = await originalFetch(input, init);
      } catch (error) {
        if (notification)
          notify(
            'error',
            `${notification.error}. Check your connection and try again.`,
          );
        throw error;
      }
      if (!notification) return response;
      if (response.ok) {
        notify('success', notification.success);
        void queryClient.invalidateQueries({ refetchType: 'none' });
      } else {
        void response
          .clone()
          .json()
          .catch(() => null)
          .then((body: unknown) =>
            notify('error', responseErrorMessage(body, notification.error)),
          );
      }
      return response;
    };
    window.fetch = instrumentedFetch;
    return () => {
      if (window.fetch === instrumentedFetch) window.fetch = originalFetch;
    };
  }, [notify, queryClient]);

  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-3 top-3 z-[100] flex flex-col items-end gap-2 sm:left-auto sm:right-4 sm:top-4 sm:w-full sm:max-w-sm"
        role="region"
      >
        {toasts.map((toast) => (
          <div
            aria-atomic="true"
            className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-lg transition duration-200 motion-reduce:transition-none ${toast.closing ? 'translate-y-[-0.25rem] opacity-0' : 'translate-y-0 opacity-100'} ${toast.kind === 'error' ? 'border-destructive/50' : 'border-emerald-500/50'}`}
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            {toast.kind === 'error' ? (
              <CircleX
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
              />
            ) : (
              <CircleCheck
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
              />
            )}
            <p className="min-w-0 flex-1 text-sm font-medium">
              {toast.message}
            </p>
            <button
              aria-label="Dismiss notification"
              className="-m-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => dismiss(toast.id)}
              type="button"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}
