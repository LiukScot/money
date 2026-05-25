import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBackupActions } from "./useBackupActions";

export function BackupCard() {
  const { exportJson, importJson, exportXlsx, importXlsx } = useBackupActions();

  const reportError = (err: unknown) => alert((err as Error).message);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Backup</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button variant="outline" size="sm" onClick={() => exportJson().catch(reportError)}>
          Export JSON
        </Button>
        <Label className="grid gap-1.5 rounded-md border border-dashed border-border p-3 cursor-pointer text-sm">
          Import JSON
          <Input
            type="file"
            accept=".json"
            className="border-0 p-0 h-auto file:mr-2"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importJson(file).catch(reportError);
            }}
          />
        </Label>
        <Button variant="outline" size="sm" onClick={() => exportXlsx().catch(reportError)}>
          Export XLSX
        </Button>
        <Label className="grid gap-1.5 rounded-md border border-dashed border-border p-3 cursor-pointer text-sm">
          Import XLSX
          <Input
            type="file"
            accept=".xlsx,.xls"
            className="border-0 p-0 h-auto file:mr-2"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importXlsx(file).catch(reportError);
            }}
          />
        </Label>
      </CardContent>
    </Card>
  );
}
