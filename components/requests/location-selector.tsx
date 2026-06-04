"use client";

import type { Balance } from "@/lib/domain/types";

export function LocationSelector({
  balances,
  value,
  onChange,
}: {
  balances: Balance[];
  value: string;
  onChange: (locationId: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700 dark:text-slate-200">
        Location
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-slate-900"
        aria-label="Location"
      >
        {balances.map((b) => (
          <option key={b.locationId} value={b.locationId}>
            {b.locationName}
          </option>
        ))}
      </select>
    </label>
  );
}
