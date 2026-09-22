import { useMemo, useState } from "react";
import { Checkbox } from "react-aria-components";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { changedPresets } from "../../pacer/editing";
import {
  FIRST_USER_PRESET_INDEX,
  LAST_USER_PRESET_INDEX,
  isUserPresetIndex,
  presetIndexToLabel,
} from "../../pacer/protocol/constants";
import { usePacerStore } from "../../store/pacerStore";
import type { SendView } from "../../store/sendSlice";

type Scope = "changed" | "current" | "all";

const ALL_USER_PRESETS = Array.from(
  { length: LAST_USER_PRESET_INDEX - FIRST_USER_PRESET_INDEX + 1 },
  (_, i) => FIRST_USER_PRESET_INDEX + i,
);

function usePresetLabel() {
  const presets = usePacerStore((s) => s.board.config.presets);
  return (idx: number) => {
    const name = presets[idx]?.name?.trim();
    return name ? `${presetIndexToLabel(idx)} ${name}` : presetIndexToLabel(idx);
  };
}

function isBusy(send: SendView) {
  return send.status === "sending" || send.status === "verifying";
}

function Progress({ send }: { send: SendView }) {
  const cancelSend = usePacerStore((s) => s.cancelSend);
  if (!isBusy(send)) return null;
  const [value, max, label] =
    send.status === "sending"
      ? [
          send.sent,
          send.total,
          send.sent < send.total
            ? `Sending ${send.sent} / ${send.total} messages`
            : "Sent. Giving the Pacer a moment to store the presets…",
        ]
      : send.status === "verifying"
        ? [send.received, send.expected || 1, `Reading back to verify: ${send.received} / ${send.expected}`]
        : [0, 1, ""];
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <progress className="h-2 flex-1" max={max} value={value} aria-label="Send progress" />
        <Button size="sm" variant="ghost" onPress={cancelSend}>
          Cancel
        </Button>
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">{label}</p>
    </div>
  );
}

function Result({ send }: { send: SendView }) {
  const label = usePresetLabel();
  if (send.status === "done") {
    return (
      <div className="space-y-1 text-sm">
        <p className="text-success">
          Sent {send.presets.map(label).join(", ")}.{" "}
          {send.verified ? "Read back from the Pacer: it matches." : "Not verified."}
        </p>
        <p className="text-xs text-muted-foreground">
          Not yet confirmed on hardware: if the Pacer is showing one of these presets, it may keep running the old
          version until you select that preset again.
        </p>
      </div>
    );
  }
  if (send.status === "error") {
    return (
      <div className="space-y-1 text-sm text-destructive">
        <p>{send.error}</p>
        {send.mismatched && <p>Doesn't match: {send.mismatched.map(label).join(", ")}</p>}
      </div>
    );
  }
  return null;
}

/** The send form. Mounted each time the dialog opens, so the scope starts from what changed. */
function SendForm({ onClose }: { onClose: () => void }) {
  const send = usePacerStore((s) => s.send);
  const sendToPacer = usePacerStore((s) => s.sendToPacer);
  const baseline = usePacerStore((s) => s.sendBaseline);
  const config = usePacerStore((s) => s.board.config);
  const changed = useMemo(() => changedPresets(baseline, config), [baseline, config]);
  const activeIndex = usePacerStore((s) => s.board.activePresetIndex);
  const label = usePresetLabel();
  const [scope, setScope] = useState<Scope>(() => (changed.length > 0 ? "changed" : "current"));
  const [verify, setVerify] = useState(true);
  const busy = isBusy(send);

  const current = isUserPresetIndex(activeIndex) ? [activeIndex] : [];
  const presets = scope === "changed" ? changed : scope === "current" ? current : ALL_USER_PRESETS;

  return (
    <>
      <ToggleGroup<Scope>
        label="Presets to send"
        options={[
          { id: "changed", label: `Changed (${changed.length})` },
          { id: "current", label: `This preset (${presetIndexToLabel(activeIndex)})` },
          { id: "all", label: "All 24" },
        ]}
        value={scope}
        onChange={setScope}
      />
      {scope === "changed" && (
        <p className="text-xs text-muted-foreground">
          Presets edited since this configuration was opened or last sent.
        </p>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {presets.length === 0 ? "Nothing to send." : `Overwrites on the Pacer (${presets.length}):`}
        </p>
        {presets.length > 0 && (
          <p className="max-h-24 overflow-auto rounded-md border bg-card px-2 py-1 font-mono text-xs">
            {presets.map(label).join(", ")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Writes take effect immediately and the Pacer has no undo. Pull a copy first if you want to keep what&apos;s on
          it. Global settings are never sent.
        </p>
      </div>
      <Checkbox
        isSelected={verify}
        onChange={setVerify}
        isDisabled={busy}
        className="group flex items-center gap-2 text-sm"
      >
        <span
          aria-hidden
          className="flex size-5 items-center justify-center rounded border bg-card group-data-[selected]:bg-primary group-data-[selected]:text-primary-foreground"
        >
          {verify ? "✓" : ""}
        </span>
        Read back afterwards to verify (about 8 seconds)
      </Checkbox>
      <Progress send={send} />
      {!busy && <Result send={send} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onPress={onClose}>
          {send.status === "done" ? "Close" : "Cancel"}
        </Button>
        <Button
          variant="destructive"
          isDisabled={busy || presets.length === 0}
          onPress={() => void sendToPacer(presets, { verify })}
        >
          Overwrite {presets.length} preset{presets.length === 1 ? "" : "s"} on the Pacer
        </Button>
      </div>
    </>
  );
}

/** Header control: send presets from the working configuration to the connected Pacer. */
export function SendToPacer() {
  const canSend = usePacerStore(
    (s) => s.midi.status === "connected" && s.midi.sysexEnabled && s.pacerPorts.outputId !== undefined,
  );
  const send = usePacerStore((s) => s.send);
  const dismissSendResult = usePacerStore((s) => s.dismissSendResult);
  const [open, setOpen] = useState(false);

  const openDialog = () => {
    dismissSendResult();
    setOpen(true);
  };

  return (
    <>
      <Button size="sm" variant="outline" isDisabled={!canSend} onPress={openDialog}>
        {isBusy(send) ? "Sending…" : "Send to Pacer…"}
      </Button>
      <ModalDialog isOpen={open} onOpenChange={setOpen} title="Send to Pacer">
        <SendForm onClose={() => setOpen(false)} />
      </ModalDialog>
    </>
  );
}
