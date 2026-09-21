import { Select } from "@/components/ui/select";
import type { MidiPortInfo } from "../midi/webMidi";

const NONE = "__none__";

/** A MIDI port picker (React Aria Select), with a "none" choice. */
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
    <Select
      label={label}
      options={[{ id: NONE, label: noneLabel }, ...ports.map((p) => ({ id: p.id, label: p.name }))]}
      value={value ?? NONE}
      onChange={(id) => onChange(id === NONE ? undefined : id)}
    />
  );
}
