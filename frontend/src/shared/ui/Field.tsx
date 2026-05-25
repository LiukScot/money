import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/**
 * Label + control wrapper that gives the form a consistent vertical rhythm.
 */
export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
