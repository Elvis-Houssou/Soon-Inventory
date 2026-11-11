import { AppShell } from "@/components/layout/AppShell";
import { HistoryScreen } from "@/features/shipments/ShipmentScreens";

export default function Page() {
  return (
    <AppShell title="Historique">
      <HistoryScreen />
    </AppShell>
  );
}
