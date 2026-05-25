import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { usePreferencesMutation, usePreferencesQuery } from "./usePreferences";

export function PreferencesCard() {
  const prefsQuery = usePreferencesQuery(true);
  const prefsMutation = usePreferencesMutation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <Label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={Boolean(prefsQuery.data?.showZeroAssets)}
            onCheckedChange={(checked) => prefsMutation.mutate(checked === true)}
          />
          Show zero-value assets
        </Label>
      </CardContent>
    </Card>
  );
}
