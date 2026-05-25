import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
  emptyPlaceholder?: string;
  populatedPlaceholder?: string;
};

const MAX_VISIBLE = 8;
const BLUR_CLOSE_DELAY_MS = 120;

/**
 * Accessible asset autocomplete. Owns its own open/focus state but is
 * controlled by `value`/`onChange` so it can be wired to react-hook-form
 * via Controller.
 */
export function AssetCombobox({
  id,
  label,
  value,
  onChange,
  options,
  emptyPlaceholder = "es. revolut",
  populatedPlaceholder = "digita o scegli"
}: Props) {
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  // Track the pending blur-close timeout so we can clear it on unmount or
  // when the component refocuses (AGENTS.md §13: every setTimeout needs a
  // cleanup path).
  const blurTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const filtered = useMemo(() => {
    const q = (value ?? "").toLowerCase().trim();
    if (!q) return options;
    return options.filter((a) => a.toLowerCase().includes(q) && a.toLowerCase() !== q);
  }, [options, value]);

  const visible = filtered.slice(0, MAX_VISIBLE);

  // Highlight reset lives inside each handler that mutates value or open
  // (avoids react-hooks/set-state-in-effect). The trade-off: a caller that
  // programmatically swaps `value` won't reset focusedIdx — but `value` is
  // bounded to [-1, visible.length - 1] anyway and ArrowUp/Down wrap around.
  const handleChange = (next: string) => {
    setFocusedIdx(-1);
    onChange(next);
  };

  const openPopover = () => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setOpen(true);
    setFocusedIdx(-1);
  };

  const closePopover = () => {
    setOpen(false);
    setFocusedIdx(-1);
  };

  const scheduleBlurClose = () => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
    }
    blurTimeoutRef.current = window.setTimeout(() => {
      blurTimeoutRef.current = null;
      closePopover();
    }, BLUR_CLOSE_DELAY_MS);
  };

  const select = (a: string) => {
    onChange(a);
    closePopover();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setFocusedIdx((i) => (visible.length === 0 ? -1 : (i + 1) % visible.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      setFocusedIdx((i) => {
        if (visible.length === 0) return -1;
        return i <= 0 ? visible.length - 1 : i - 1;
      });
    } else if (e.key === "Enter" && open && focusedIdx >= 0) {
      const choice = visible[focusedIdx];
      if (choice) {
        e.preventDefault();
        select(choice);
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      closePopover();
    }
  };

  const listId = `${id}-combo-list`;

  return (
    <div className="grid gap-1.5 relative">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="text"
        autoComplete="off"
        placeholder={options.length > 0 ? populatedPlaceholder : emptyPlaceholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && focusedIdx >= 0 ? `${id}-opt-${focusedIdx}` : undefined}
        value={value ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={openPopover}
        onBlur={scheduleBlurClose}
        onKeyDown={handleKeyDown}
      />
      {open && visible.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full mt-1 z-20 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {visible.map((a, idx) => (
            <li key={a} id={`${id}-opt-${idx}`} role="option" aria-selected={focusedIdx === idx}>
              <button
                type="button"
                className={`w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground ${focusedIdx === idx ? "bg-accent text-accent-foreground" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(a);
                }}
              >
                {a}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
