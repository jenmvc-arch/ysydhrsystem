import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
  XCircle,
} from 'lucide-react';

export type NotificationTone = 'success' | 'error' | 'warning' | 'info';
export type DialogTone = 'danger' | 'warning' | 'info';

export interface NotificationInput {
  title?: string;
  message: string;
  tone?: NotificationTone;
  duration?: number;
  dedupeKey?: string;
}

export interface DialogOptions {
  title: string;
  message: string;
  tone?: DialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
  acknowledgeLabel?: string;
  onConfirm?: () => void | Promise<void>;
}

interface ToastRecord extends Required<Pick<NotificationInput, 'message'>> {
  id: string;
  title: string;
  tone: NotificationTone;
  duration: number;
  dedupeKey: string;
}

interface DialogRecord extends DialogOptions {
  id: string;
  kind: 'confirm' | 'info';
  isProcessing: boolean;
  errorMessage?: string;
}

interface FeedbackContextValue {
  notify: (input: NotificationInput) => void;
  showSuccess: (title: string, message: string, options?: Partial<NotificationInput>) => void;
  showError: (title: string, message: string, options?: Partial<NotificationInput>) => void;
  showWarning: (title: string, message: string, options?: Partial<NotificationInput>) => void;
  showInfo: (title: string, message: string, options?: Partial<NotificationInput>) => void;
  confirmAction: (options: DialogOptions) => Promise<boolean>;
  showInfoModal: (options: Omit<DialogOptions, 'onConfirm' | 'tone'> & { acknowledgeLabel?: string }) => Promise<void>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const DEFAULT_TOAST_DURATION = 4000;

const toastToneMeta: Record<NotificationTone, {
  Icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  borderClass: string;
  accentClass: string;
}> = {
  success: {
    Icon: CheckCircle2,
    iconClass: 'text-green-600',
    borderClass: 'border-green-200',
    accentClass: 'bg-green-600',
  },
  error: {
    Icon: XCircle,
    iconClass: 'text-red-600',
    borderClass: 'border-red-200',
    accentClass: 'bg-red-600',
  },
  warning: {
    Icon: AlertTriangle,
    iconClass: 'text-amber-600',
    borderClass: 'border-amber-200',
    accentClass: 'bg-amber-500',
  },
  info: {
    Icon: Info,
    iconClass: 'text-blue-600',
    borderClass: 'border-blue-200',
    accentClass: 'bg-blue-600',
  },
};

const dialogToneMeta: Record<DialogTone, {
  Icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  confirmClass: string;
}> = {
  danger: {
    Icon: XCircle,
    iconClass: 'text-red-600',
    confirmClass: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  },
  warning: {
    Icon: AlertTriangle,
    iconClass: 'text-amber-600',
    confirmClass: 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-500',
  },
  info: {
    Icon: Info,
    iconClass: 'text-blue-600',
    confirmClass: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
  },
};

const makeFeedbackId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : 'The action could not be completed.'
);

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => {
        const meta = toastToneMeta[toast.tone];
        const Icon = meta.Icon;
        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto relative overflow-hidden rounded-2xl border bg-white p-4 pr-11 shadow-xl ${meta.borderClass} animate-in slide-in-from-right-4 duration-200`}
          >
            <div className={`absolute inset-y-0 left-0 w-1 ${meta.accentClass}`} />
            <div className="flex items-start gap-3">
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${meta.iconClass}`} aria-hidden="true" />
              <div className="min-w-0 text-left">
                <p className="font-bold leading-tight text-on-background">{toast.title}</p>
                <p className="mt-1 text-sm leading-5 text-on-surface-variant">{toast.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="absolute right-3 top-3 rounded-lg p-1 text-on-surface-variant transition hover:bg-surface-container-low hover:text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label={`Close ${toast.title} notification`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FeedbackDialog({
  dialog,
  onCancel,
  onConfirm,
}: {
  dialog: DialogRecord | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dialog) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const focusableSelector = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const focusPrimaryAction = () => {
      const primary = dialogRef.current?.querySelector<HTMLElement>('[data-dialog-primary]');
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
      (primary || firstFocusable)?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !dialog.isProcessing) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) || []
      ) as HTMLElement[];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const focusTimer = window.setTimeout(focusPrimaryAction, 0);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [dialog?.id, onCancel]);

  if (!dialog) return null;

  const meta = dialogToneMeta[dialog.tone || 'info'];
  const Icon = meta.Icon;
  const isInfoModal = dialog.kind === 'info';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={() => {
          if (!dialog.isProcessing) onCancel();
        }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`feedback-dialog-title-${dialog.id}`}
        aria-describedby={`feedback-dialog-message-${dialog.id}`}
        className="relative w-full max-w-md rounded-3xl border border-neutral-border bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-container-low">
            <Icon className={`h-6 w-6 ${meta.iconClass}`} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id={`feedback-dialog-title-${dialog.id}`} className="text-lg font-bold text-on-background">
              {dialog.title}
            </h2>
            <p id={`feedback-dialog-message-${dialog.id}`} className="mt-2 text-sm leading-6 text-on-surface-variant">
              {dialog.message}
            </p>
          </div>
        </div>

        {dialog.errorMessage && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {dialog.errorMessage}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {!isInfoModal && (
            <button
              type="button"
              onClick={onCancel}
              disabled={dialog.isProcessing}
              className="rounded-xl border border-neutral-border px-4 py-2.5 text-sm font-semibold text-on-surface transition hover:bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {dialog.cancelLabel || 'Cancel'}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={dialog.isProcessing}
            data-dialog-primary
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${meta.confirmClass}`}
          >
            {dialog.isProcessing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {dialog.isProcessing
              ? 'Processing...'
              : isInfoModal
                ? dialog.acknowledgeLabel || 'Got it'
                : dialog.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [dialog, setDialog] = useState<DialogRecord | null>(null);
  const dialogResolverRef = useRef<((result: boolean) => void) | null>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((input: NotificationInput) => {
    const tone = input.tone || 'info';
    const title = input.title?.trim() || (
      tone === 'success' ? 'Success' :
      tone === 'error' ? 'Error' :
      tone === 'warning' ? 'Warning' :
      'Information'
    );
    const message = input.message.trim();
    if (!message) return;
    const dedupeKey = input.dedupeKey || `${tone}|${title}|${message}`;
    const record: ToastRecord = {
      id: makeFeedbackId('toast'),
      title,
      message,
      tone,
      duration: input.duration ?? DEFAULT_TOAST_DURATION,
      dedupeKey,
    };

    setToasts((current) => {
      if (current.some((toast) => toast.dedupeKey === dedupeKey)) return current;
      return [...current, record];
    });

    if (record.duration > 0) {
      window.setTimeout(() => dismissToast(record.id), record.duration);
    }
  }, [dismissToast]);

  const showSuccess = useCallback((title: string, message: string, options?: Partial<NotificationInput>) => {
    notify({ ...options, title, message, tone: 'success' });
  }, [notify]);

  const showError = useCallback((title: string, message: string, options?: Partial<NotificationInput>) => {
    notify({ ...options, title, message, tone: 'error' });
  }, [notify]);

  const showWarning = useCallback((title: string, message: string, options?: Partial<NotificationInput>) => {
    notify({ ...options, title, message, tone: 'warning' });
  }, [notify]);

  const showInfo = useCallback((title: string, message: string, options?: Partial<NotificationInput>) => {
    notify({ ...options, title, message, tone: 'info' });
  }, [notify]);

  const closeDialog = useCallback((result: boolean) => {
    const resolve = dialogResolverRef.current;
    dialogResolverRef.current = null;
    resolve?.(result);
    setDialog(null);
  }, []);

  const confirmAction = useCallback((options: DialogOptions) => new Promise<boolean>((resolve) => {
    dialogResolverRef.current = resolve;
    setDialog({
      ...options,
      id: makeFeedbackId('dialog'),
      kind: 'confirm',
      tone: options.tone || 'info',
      isProcessing: false,
    });
  }), []);

  const showInfoModal = useCallback((options: Omit<DialogOptions, 'onConfirm' | 'tone'> & { acknowledgeLabel?: string }) => new Promise<void>((resolve) => {
    dialogResolverRef.current = () => resolve();
    setDialog({
      ...options,
      id: makeFeedbackId('info'),
      kind: 'info',
      tone: 'info',
      isProcessing: false,
    });
  }), []);

  const handleDialogConfirm = useCallback(async () => {
    if (!dialog || dialog.isProcessing) return;
    if (dialog.kind === 'info') {
      closeDialog(true);
      return;
    }

    setDialog((current) => current ? { ...current, isProcessing: true, errorMessage: undefined } : current);
    try {
      await dialog.onConfirm?.();
      closeDialog(true);
    } catch (error) {
      setDialog((current) => current ? {
        ...current,
        isProcessing: false,
        errorMessage: getErrorMessage(error),
      } : current);
      const resolve = dialogResolverRef.current;
      dialogResolverRef.current = null;
      resolve?.(false);
    }
  }, [closeDialog, dialog]);

  const handleDialogCancel = useCallback(() => {
    closeDialog(false);
  }, [closeDialog]);

  const contextValue = useMemo<FeedbackContextValue>(() => ({
    notify,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    confirmAction,
    showInfoModal,
  }), [confirmAction, notify, showError, showInfo, showInfoModal, showSuccess, showWarning]);

  return (
    <FeedbackContext.Provider value={contextValue}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <FeedbackDialog dialog={dialog} onCancel={handleDialogCancel} onConfirm={() => void handleDialogConfirm()} />
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used inside FeedbackProvider.');
  }
  return context;
}
