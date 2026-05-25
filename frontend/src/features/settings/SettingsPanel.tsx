import { PreferencesCard } from "./PreferencesCard";
import { AssetStylesCard } from "./AssetStylesCard";
import { BackupCard } from "./BackupCard";
import { DangerZoneCard } from "./DangerZoneCard";

type Props = {
  onPurged?: () => void;
};

export function SettingsPanel({ onPurged }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <PreferencesCard />
      <AssetStylesCard />
      <BackupCard />
      <DangerZoneCard onPurged={onPurged} />
    </div>
  );
}
