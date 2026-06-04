import { AppShell } from "@/components/system/app-shell";
import { EmployeeDashboard } from "@/components/employee/employee-dashboard";

export default function DashboardPage() {
  return (
    <AppShell role="employee">
      <EmployeeDashboard />
    </AppShell>
  );
}
