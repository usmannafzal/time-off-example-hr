import { AppShell } from "@/components/system/app-shell";
import { EmployeeDashboard } from "@/components/employee/employee-dashboard";

/**
 * The "My requests" route reuses the employee dashboard so balances, the form,
 * and the request list stay together (the lifecycle actions need all three).
 */
export default function RequestsPage() {
  return (
    <AppShell role="employee">
      <EmployeeDashboard />
    </AppShell>
  );
}
