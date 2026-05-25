import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePurgeMutation } from "./usePurgeMutation";

type Props = {
  onPurged?: () => void;
};

export function DangerZoneCard({ onPurged }: Props) {
  const purgeMutation = usePurgeMutation(onPurged);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          size="sm"
          disabled={purgeMutation.isPending}
          onClick={() => {
            if (purgeMutation.isPending) return;
            if (confirm("Delete all money data for this account?")) purgeMutation.mutate();
          }}
        >
          Purge all data
        </Button>
      </CardContent>
    </Card>
  );
}
