import { useMemo } from "react";
import { useCombobox } from "downshift";
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

export function AssetCombobox({
  id,
  label,
  value,
  onChange,
  options,
  emptyPlaceholder = "es. revolut",
  populatedPlaceholder = "digita o scegli"
}: Props) {
  const filtered = useMemo(() => {
    const q = (value ?? "").toLowerCase().trim();
    if (!q) return options.slice(0, MAX_VISIBLE);
    return options
      .filter((a) => a.toLowerCase().includes(q) && a.toLowerCase() !== q)
      .slice(0, MAX_VISIBLE);
  }, [options, value]);

  const labelId = `${id}-label`;

  const {
    isOpen,
    openMenu,
    getMenuProps,
    getInputProps,
    getItemProps,
    highlightedIndex
  } = useCombobox<string>({
    items: filtered,
    inputValue: value ?? "",
    onInputValueChange: ({ inputValue }) => onChange(inputValue ?? ""),
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem != null) onChange(selectedItem);
    },
    itemToString: (item) => item ?? "",
    // Click default in v9 toggles open; with onFocus opening too the user
    // sees the list flicker shut on first click after focus. Pin click
    // to always open.
    stateReducer: (_state, { type, changes }) => {
      if (type === useCombobox.stateChangeTypes.InputClick) {
        return { ...changes, isOpen: true };
      }
      return changes;
    }
  });

  return (
    <div className="grid gap-1.5 relative">
      <Label id={labelId} htmlFor={id}>{label}</Label>
      <Input
        {...getInputProps({
          id,
          name: id,
          type: "text",
          autoComplete: "off",
          placeholder: options.length > 0 ? populatedPlaceholder : emptyPlaceholder,
          // Point aria-labelledby at the visible <Label> so a11y + tests
          // resolve a single name source.
          "aria-labelledby": labelId,
          // Open the list on focus so users can preview existing assets
          // without typing — matches the prior custom behavior.
          onFocus: () => openMenu()
        })}
      />
      {isOpen && filtered.length > 0 && (
        <ul
          {...getMenuProps()}
          className="absolute inset-x-0 top-full mt-1 z-20 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {filtered.map((a, idx) => (
            <li
              key={a}
              {...getItemProps({ item: a, index: idx })}
              className={`cursor-pointer rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground ${
                highlightedIndex === idx ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              {a}
            </li>
          ))}
        </ul>
      )}
      {/*
        downshift v9 wants getMenuProps called on initial render for the ref.
        When closed we render a hidden ul as a placeholder to satisfy the
        ref requirement without surfacing role=listbox.
      */}
      {!(isOpen && filtered.length > 0) && (
        <ul {...getMenuProps({}, { suppressRefError: true })} hidden />
      )}
    </div>
  );
}
