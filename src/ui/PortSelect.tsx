import type { MidiPortInfo } from "../midi/webMidi";

/** A compact native select of MIDI ports, with an optional "none" choice. */
export function PortSelect({
  label,
  ports,
  value,
  onChange,
  noneLabel,
}: {
  label: string;
  ports: MidiPortInfo[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  noneLabel: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="h-8 max-w-48 rounded-md border bg-card px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">{noneLabel}</option>
        {ports.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
