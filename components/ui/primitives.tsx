import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  TONE_BADGE_CLASSES,
  type StatusTone,
} from "@/lib/domain/status-presentation";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  /** Optional accent border colour. */
  tone?: "default" | "info" | "amber" | "green" | "red";
}) {
  const toneBorder = {
    default: "border-slate-200 dark:border-slate-800",
    info: "border-sky-300",
    amber: "border-amber-300",
    green: "border-emerald-300",
    red: "border-red-400",
  }[tone ?? "default"];
  return (
    <div
      className={cx(
        "rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900",
        toneBorder,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: StatusTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE_BADGE_CLASSES[tone],
      )}
    >
      {children}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonProps) {
  const variants = {
    primary:
      "bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300 dark:bg-slate-100 dark:text-slate-900",
    secondary:
      "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-900 dark:text-slate-100",
    danger:
      "bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300",
    ghost: "text-slate-600 hover:bg-slate-100 disabled:opacity-50",
  };
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx("h-4 w-4 animate-spin text-current", className)}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      data-testid="skeleton"
      className={cx(
        "animate-pulse rounded-md bg-slate-200 dark:bg-slate-700",
        className,
      )}
    />
  );
}

/** A small contextual banner used for warnings / info above forms etc. */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "error" | "success";
  children: ReactNode;
}) {
  const tones = {
    info: "bg-sky-50 text-sky-900 ring-sky-200",
    warning: "bg-amber-50 text-amber-900 ring-amber-200",
    error: "bg-red-50 text-red-900 ring-red-200",
    success: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-lg px-3 py-2 text-sm ring-1 ring-inset",
        tones[tone],
      )}
    >
      {children}
    </div>
  );
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
