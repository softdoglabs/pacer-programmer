// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { Select, type SelectGroup } from "@/components/ui/select";
import { setPresetMidiType, updatePresetMidi } from "../../pacer/editing";
import { MIDI_CHANNEL_CHOICES, PresetMidiMessageType } from "../../pacer/protocol/constants";
import type { PresetMidiSetting } from "../../pacer/protocol/types";
import { presetMidiTypeInfo, presetMidiTypeName } from "../../pacer/simulator";
import { usePacerStore } from "../../store/pacerStore";

/*
 * One of a preset's load-time messages. It reads like a step card because it is the same idea —
 * a type, a channel and three data bytes — but the code table and the byte meanings are the
 * preset's own (see `presetMidiTypeInfo`), so none of the step machinery is reused.
 */

const TYPE_GROUPS: { title: string; types: number[] }[] = [
  {
    title: "Send MIDI",
    types: [
      PresetMidiMessageType.ProgramAndBank,
      PresetMidiMessageType.Cc,
      PresetMidiMessageType.Note,
      PresetMidiMessageType.NrpnCoarse,
      PresetMidiMessageType.NrpnFine,
      PresetMidiMessageType.Mmc,
    ],
  },
  { title: "Pacer actions", types: [PresetMidiMessageType.Relay] },
];

const TYPE_OPTIONS: SelectGroup[] = TYPE_GROUPS.map((g) => ({
  title: g.title,
  options: g.types.map((t) => ({ id: String(t), label: presetMidiTypeName(t) })),
}));

export function PresetMidiRow({ n, setting }: { n: number; setting: PresetMidiSetting }) {
  const applyPresetEdit = usePacerStore((s) => s.applyPresetEdit);
  const { dataFields, hasChannel } = presetMidiTypeInfo(setting.msgType);
  const set = (i: number, v: number) => {
    const data = [...setting.data] as PresetMidiSetting["data"];
    data[i] = v;
    applyPresetEdit((c, i) => updatePresetMidi(c, i, n, { data }));
  };

  return (
    <li aria-label={`Message ${n}`} className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-2">
      <span className="self-center text-sm font-semibold tabular-nums">{n}</span>
      <Select
        label={`Message ${n} type`}
        labelVisible={false}
        title={`What message ${n} sends when this preset loads`}
        options={TYPE_OPTIONS}
        value={String(setting.msgType)}
        onChange={(v) => v && applyPresetEdit((c, i) => setPresetMidiType(c, i, n, Number(v)))}
      />
      {hasChannel && (
        <Select
          label="Channel"
          title="MIDI channel this message is sent on. Global follows the configuration's own channel."
          options={MIDI_CHANNEL_CHOICES}
          value={String(setting.channel)}
          onChange={(v) => v && applyPresetEdit((c, i) => updatePresetMidi(c, i, n, { channel: Number(v) }))}
        />
      )}
      {dataFields.map((field, i) =>
        field === undefined ? null : (
          <NumberField key={i} label={field} value={setting.data[i]!} onChange={(v) => set(i, v)} />
        ),
      )}
      <Button
        size="icon"
        variant="ghost"
        className="ml-auto self-center"
        aria-label={`Remove message ${n}`}
        title={`Stop sending message ${n} when this preset loads`}
        onPress={() => applyPresetEdit((c, i) => setPresetMidiType(c, i, n, PresetMidiMessageType.Off))}
      >
        ✕
      </Button>
    </li>
  );
}
