"use client";

import { useEffect } from "react";

export type ToastType = "success" | "warning" | "error" | "info";

export type ToastMessage = {
  id: number;
  type: ToastType;
  title: string;
  detail?: string;
};

const toastLabels: Record<ToastType, string> = {
  success: "Success",
  warning: "Warning",
  error: "Error",
  info: "Info",
};

export function Toast({
  message,
  onClose,
  duration = 4200,
}: {
  message: ToastMessage | null;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!message) {
      return;
    }

    const timeout = window.setTimeout(onClose, duration);

    return () => window.clearTimeout(timeout);
  }, [duration, message, onClose]);

  if (!message) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[calc(100%-2rem)] justify-end sm:w-auto">
      <div className="pointer-events-auto w-full max-w-sm animate-[toast-in_180ms_ease-out] rounded-md border border-neutral-300 bg-white px-4 py-3 text-neutral-950 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
              {toastLabels[message.type]}
            </p>
            <p className="mt-1 text-sm font-semibold">{message.title}</p>
            {message.detail ? (
              <p className="mt-1 text-sm leading-5 text-neutral-600">
                {message.detail}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notification"
            className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
          >
            X
          </button>
        </div>
      </div>
    </div>
  );
}
