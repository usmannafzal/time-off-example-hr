"use client";

/**
 * Lightweight session context. Real authentication is out of scope (TRD §3.2);
 * this stands in for "the frontend receives a valid session" (TRD §11.1) and
 * lets the demo switch between the employee and manager personas (TRD §2.2).
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { UserRole } from "@/lib/domain/types";

export interface Session {
  employeeId: string;
  employeeName: string;
  role: UserRole;
  /** Display name used when recording manager actions in the audit trail. */
  managerName: string;
}

interface SessionContextValue extends Session {
  setRole: (role: UserRole) => void;
}

const DEFAULT_SESSION: Session = {
  employeeId: "emp_alice",
  employeeName: "Alice Wu",
  role: "employee",
  managerName: "Dana Manager",
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Partial<Session>;
}) {
  const [role, setRole] = useState<UserRole>(
    initial?.role ?? DEFAULT_SESSION.role,
  );
  const value = useMemo<SessionContextValue>(
    () => ({ ...DEFAULT_SESSION, ...initial, role, setRole }),
    [initial, role],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
