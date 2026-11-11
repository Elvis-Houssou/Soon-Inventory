import { AppShell } from "@/components/layout/AppShell";
import { SettingsScreen } from "@/features/settings/SettingsScreen";

export default function Page() {
  return (
    <AppShell title="Paramètres">
      <SettingsScreen />
    </AppShell>
  );
}
