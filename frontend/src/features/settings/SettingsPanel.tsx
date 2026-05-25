import { PreferencesCard } from "./PreferencesCard";
import { AssetStylesCard } from "./AssetStylesCard";
import { BackupCard } from "./BackupCard";
import { DangerZoneCard } from "./DangerZoneCard";

type Props = {
  onPurged?: () => void;
};

export function SettingsPanel({ onPurged }: Props) {
  return (
    <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
      <PreferencesCard />
      <AssetStylesCard />
      <BackupCard />
      <DangerZoneCard onPurged={onPurged} />
    </div>
  );
}
