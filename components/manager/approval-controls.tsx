"use client";

import { useState } from "react";
import { Button, Spinner } from "@/components/ui/primitives";

/**
 * Approve / deny controls (TRD §5.4). Approve is disabled until a fresh balance
 * has been confirmed (or the stale-balance warning is explicitly overridden)
 * (TRD §4.5). Deny requires a reason.
 */
export function ApprovalControls({
  canApprove,
  busy,
  onApprove,
  onDeny,
}: {
  canApprove: boolean;
  busy?: boolean;
  onApprove: () => void;
  onDeny: (reason: string) => void;
}) {
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {busy && <Spinner className="text-slate-400" />}
        <Button onClick={onApprove} disabled={!canApprove || busy}>
          Approve
        </Button>
        <Button
          variant="secondary"
          onClick={() => setDenying((d) => !d)}
          disabled={busy}
        >
          Deny
        </Button>
      </div>

      {denying && (
        <div className="flex flex-col gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for denial"
            aria-label="Denial reason"
            rows={2}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-slate-900"
          />
          <div>
            <Button
              variant="danger"
              disabled={reason.trim().length === 0 || busy}
              onClick={() => onDeny(reason.trim())}
            >
              Confirm denial
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
