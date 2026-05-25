import { useNavigate } from "@tanstack/react-router";
import { PreferencesCard } from "./PreferencesCard";
import { AssetStylesCard } from "./AssetStylesCard";
import { BackupCard } from "./BackupCard";
import { DangerZoneCard } from "./DangerZoneCard";

export function SettingsPanel() {
  const navigate = useNavigate();
  const onPurged = () => navigate({ to: "/dashboard" });
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <PreferencesCard />
      <AssetStylesCard />
      <BackupCard />
      <DangerZoneCard onPurged={onPurged} />
    </div>
  );
}
