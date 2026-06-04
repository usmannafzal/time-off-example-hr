"use client";

function toInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
}: {
  startDate: Date | null;
  endDate: Date | null;
  onChange: (next: { startDate: Date | null; endDate: Date | null }) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">
          Start date
        </span>
        <input
          type="date"
          aria-label="Start date"
          value={toInputValue(startDate)}
          onChange={(e) =>
            onChange({
              startDate: e.target.value ? new Date(e.target.value) : null,
              endDate,
            })
          }
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-slate-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">
          End date
        </span>
        <input
          type="date"
          aria-label="End date"
          value={toInputValue(endDate)}
          onChange={(e) =>
            onChange({
              startDate,
              endDate: e.target.value ? new Date(e.target.value) : null,
            })
          }
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-slate-900"
        />
      </label>
    </div>
  );
}
