import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { panelRow, rearControls } from "../../pacer/hardware";
import { controlLabel } from "../../pacer/simulator";
import { usePacerStore } from "../../store/pacerStore";
import { EditorPanel } from "./EditorPanel";
import { LiveControl } from "./LiveControl";

/** Jump straight to another control without going back to the faceplate. */
function SwitchPicker({ selected, onSelect }: { selected: number; onSelect: (controlId: number) => void }) {
  const groups = [
    { label: "Front", specs: panelRow("front") },
    { label: "Back", specs: panelRow("back").filter((s) => s.controlId !== undefined) },
    { label: "Rear jacks", specs: rearControls() },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {groups.map(({ label, specs }) => (
        <div key={label} className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{label}</span>
          {specs.map((spec) => {
            const id = spec.controlId;
            if (id === undefined) return null;
            return (
              <Button
                key={spec.id}
                size="sm"
                variant={id === selected ? "default" : "outline"}
                aria-label={`Program ${controlLabel(id)}`}
                aria-pressed={id === selected}
                className="min-w-9 px-2"
                onPress={() => onSelect(id)}
              >
                {spec.name}
              </Button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Programming one control, using the whole width: the faceplate is the overview, and picking a
 * switch opens it here. Closing returns to the faceplate.
 */
export function SwitchEditorView({ controlId }: { controlId: number }) {
  const selectControl = usePacerStore((s) => s.selectControl);
  return (
    <section
      aria-label={`Programming ${controlLabel(controlId)}`}
      className="rounded-lg border border-primary/50 bg-card p-4"
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge>Edit mode</Badge>
        <h2 className="text-base font-semibold">{controlLabel(controlId)}</h2>
        <div className="min-w-0 flex-1">
          <SwitchPicker selected={controlId} onSelect={selectControl} />
        </div>
        {/* Closes this control's editor and returns to the faceplate, still in Edit mode. */}
        <Button
          size="icon"
          variant="outline"
          aria-label="Back to faceplate"
          title="Back to faceplate"
          onPress={() => selectControl(undefined)}
        >
          ✕
        </Button>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="lg:order-2 lg:shrink-0">
          <LiveControl controlId={controlId} />
        </div>
        <div className="min-w-0 flex-1">
          <EditorPanel />
        </div>
      </div>
    </section>
  );
}
