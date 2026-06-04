/**
 * Presentation mapping for each request status (TRD §4.4 "UI treatment").
 * Centralised so cards, badges and stories stay consistent.
 */

import type { LeaveRequestStatus } from "./types";

export type StatusTone =
  | "neutral"
  | "info"
  | "amber"
  | "green"
  | "red"
  | "slate";

export interface StatusPresentation {
  label: string;
  tone: StatusTone;
  /** Short description of what the status means. */
  description: string;
}

export const STATUS_PRESENTATION: Record<LeaveRequestStatus, StatusPresentation> = {
  "optimistic-pending": {
    label: "Awaiting confirmation",
    tone: "info",
    description: "Submitted; awaiting HCM confirmation.",
  },
  pending: {
    label: "Pending Approval",
    tone: "amber",
    description: "Confirmed by HCM; awaiting a manager decision.",
  },
  approved: {
    label: "Approved",
    tone: "green",
    description: "Approved by your manager.",
  },
  denied: {
    label: "Denied",
    tone: "slate",
    description: "Denied by your manager.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "slate",
    description: "Cancelled — preserved for the audit trail.",
  },
  "optimistic-rolled-back": {
    label: "Rolled Back",
    tone: "red",
    description: "HCM rejected this after it was shown. Please try again.",
  },
};

/** Tailwind classes for a badge of the given tone. */
export const TONE_BADGE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-sky-100 text-sky-800 ring-sky-200",
  amber: "bg-amber-100 text-amber-800 ring-amber-200",
  green: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  red: "bg-red-100 text-red-800 ring-red-200",
  slate: "bg-slate-200 text-slate-700 ring-slate-300",
};
