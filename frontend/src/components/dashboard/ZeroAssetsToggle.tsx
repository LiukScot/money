import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const INPUT_ID = "show-zero-assets";

export function ZeroAssetsToggle({
  checked,
  onChange,
  disabled
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Label htmlFor={INPUT_ID} className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
      <Checkbox
        id={INPUT_ID}
        name={INPUT_ID}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(c) => onChange(c === true)}
      />
      Show zero-value assets
    </Label>
  );
}
