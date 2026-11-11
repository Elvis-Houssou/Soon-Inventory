import { AppShell } from "@/components/layout/AppShell";
import { HomeScreen } from "@/features/shipments/ShipmentScreens";

export default function Page() {
  return (
    <AppShell title="Bonjour">
      <HomeScreen />
    </AppShell>
  );
}
