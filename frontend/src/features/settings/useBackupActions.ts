import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch } from "@/lib";

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

const okSchema = apiEnvelopeSchema(z.object({ ok: z.boolean() }));
const anySchema = apiEnvelopeSchema(z.any());

export function useBackupActions() {
  const queryClient = useQueryClient();

  const exportJson = async () => {
    const payload = await apiFetch("/api/v1/backup/json", { method: "GET" }, (raw) => anySchema.parse(raw).data);
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `money-backup-${dateStamp()}.json`
    );
  };

  const importJson = async (file: File) => {
    const parsed = JSON.parse(await file.text());
    await apiFetch(
      "/api/v1/backup/json/import",
      { method: "POST", body: JSON.stringify(parsed) },
      (raw) => okSchema.parse(raw).data
    );
    await queryClient.invalidateQueries();
  };

  const exportXlsx = async () => {
    const res = await fetch("/api/v1/backup/xlsx", { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    downloadBlob(await res.blob(), `money-export-${dateStamp()}.xlsx`);
  };

  const importXlsx = async (file: File) => {
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/v1/backup/xlsx/import", { method: "POST", credentials: "include", body: form });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await queryClient.invalidateQueries();
  };

  return { exportJson, importJson, exportXlsx, importXlsx };
}
