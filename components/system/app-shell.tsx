"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SessionProvider, useSession } from "./session";
import { SectionErrorBoundary } from "./error-boundary";
import { Toaster } from "./toaster";
import type { UserRole } from "@/lib/domain/types";

/**
 * Global shell (TRD §5.4): session context, top-level error boundary, the
 * toaster, and persona/navigation chrome.
 */
export function AppShell({
  children,
  role,
}: {
  children: ReactNode;
  role?: UserRole;
}) {
  return (
    <SessionProvider initial={role ? { role } : undefined}>
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col">
        <Header />
        <main className="flex-1 px-4 py-6">
          <SectionErrorBoundary section="Page">{children}</SectionErrorBoundary>
        </main>
        <Toaster />
      </div>
    </SessionProvider>
  );
}

function Header() {
  const session = useSession();
  return (
    <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-semibold text-slate-900 dark:text-slate-50">
          ExampleHR · Time Off
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
          <Link href="/dashboard" className="hover:text-slate-900">
            Dashboard
          </Link>
          <Link href="/requests" className="hover:text-slate-900">
            My requests
          </Link>
          <Link href="/approvals" className="hover:text-slate-900">
            Approvals
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-slate-500">
          {session.role === "manager"
            ? session.managerName
            : session.employeeName}
        </span>
        <RoleToggle />
      </div>
    </header>
  );
}

function RoleToggle() {
  const { role, setRole } = useSession();
  return (
    <button
      onClick={() => setRole(role === "employee" ? "manager" : "employee")}
      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
      aria-label="Toggle role"
    >
      View as: {role}
    </button>
  );
}
