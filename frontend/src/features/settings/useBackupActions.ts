import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiEnvelopeSchema, apiFetch, okSchema, todayIso } from "@/lib";

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  a.href = objectUrl;
  a.download = filename;
  a.click();
  // Revoke after click is dispatched so the browser has time to start the download.
  queueMicrotask(() => URL.revokeObjectURL(objectUrl));
}

const anySchema = apiEnvelopeSchema(z.any()); // reason: backup payload is arbitrary JSON passed to JSON.stringify; shape validated server-side

export function useBackupActions() {
  const queryClient = useQueryClient();

  const exportJson = async () => {
    const payload = await apiFetch("/api/v1/backup/json", { method: "GET" }, (raw) => anySchema.parse(raw).data);
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `money-backup-${todayIso()}.json`
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
    downloadBlob(await res.blob(), `money-export-${todayIso()}.xlsx`);
  };

  const importXlsx = async (file: File) => {
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/v1/backup/xlsx/import", { method: "POST", credentials: "include", body: form });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let msg = `HTTP ${res.status}`;
      try { msg = JSON.parse(text)?.error?.message || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    await queryClient.invalidateQueries();
  };

  return { exportJson, importJson, exportXlsx, importXlsx };
}
