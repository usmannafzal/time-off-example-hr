"use client";

/**
 * Renders non-blocking toast notifications (TRD §4.1 anniversary bonus toast).
 */

import { useEffect } from "react";
import { useToastStore } from "@/lib/store/toast-store";
import { cx } from "@/components/ui/primitives";

const TONE_CLASSES = {
  info: "bg-sky-600",
  success: "bg-emerald-600",
  warning: "bg-amber-600",
  error: "bg-red-600",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          id={t.id}
          tone={t.tone}
          message={t.message}
          onDismiss={dismiss}
        />
      ))}
    </div>
  );
}

function ToastItem({
  id,
  tone,
  message,
  onDismiss,
}: {
  id: string;
  tone: keyof typeof TONE_CLASSES;
  message: string;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), 6000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div
      role="status"
      className={cx(
        "pointer-events-auto flex items-start justify-between gap-2 rounded-lg px-3 py-2 text-sm text-white shadow-lg",
        TONE_CLASSES[tone],
      )}
    >
      <span>{message}</span>
      <button
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="text-white/80 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
