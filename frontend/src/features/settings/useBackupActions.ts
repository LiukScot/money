import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch, okSchema } from "@/lib";

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  a.href = objectUrl;
  a.download = filename;
  a.click();
  // Revoke after click is dispatched so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

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
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error("File non valido: il file selezionato non è un JSON corretto.");
    }
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
