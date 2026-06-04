import { AppShell } from "@/components/system/app-shell";
import { ManagerDashboard } from "@/components/manager/manager-dashboard";

export default function ApprovalsPage() {
  return (
    <AppShell role="manager">
      <ManagerDashboard />
    </AppShell>
  );
}
