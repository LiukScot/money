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
    <label className="zero-toggle" htmlFor={INPUT_ID}>
      <input
        id={INPUT_ID}
        name={INPUT_ID}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      Show zero-value assets
    </label>
  );
}
