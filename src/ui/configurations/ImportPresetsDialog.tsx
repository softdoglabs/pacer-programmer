// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Check } from "@/components/ui/check";
import { changedPresets, mergePresets, presetsMergeWouldChange, type PresetFile } from "@/pacer/editing";
import { presetIndexToLabel } from "@/pacer/protocol/constants";
import { usePacerStore } from "../../store/pacerStore";

/*
 * Merging presets into the configuration that's open, from a file or from a saved configuration.
 *
 * Opening a file replaces everything; this adds to what's there. It's for a file that isn't a whole
 * configuration — two presets an AI wrote, say — and for taking a few presets out of one that is,
 * on disk or in the list.
 * Either way it's an ordinary edit: undoable, unsaved until saved, and the presets it changed show
 * up as changed wherever that's marked, Send's "Changed" included.
 *
 * The ones checked to begin with are the ones that would actually change. For a whole dump an AI
 * was asked to alter two presets of, that's those two, without anyone having to say which.
 */

export interface PresetFileChoice {
  /** The file's name, or the saved configuration's. */
  name: string;
  /** Where the presets come from, which only changes the wording. */
  from: "file" | "saved";
  file: PresetFile;
}

/** A file by its name, a saved configuration in quotes. */
const quoted = (c: PresetFileChoice) => (c.from === "file" ? c.name : `“${c.name}”`);

export function ImportPresetsDialog({
  choice,
  onClose,
  onDone,
}: {
  choice: PresetFileChoice | undefined;
  onClose: () => void;
  /** Called after the presets have been brought in. */
  onDone: () => void;
}) {
  return (
    <ModalDialog
      isOpen={choice !== undefined}
      onOpenChange={(open) => !open && onClose()}
      title={choice ? `Merge presets from ${quoted(choice)}` : ""}
    >
      {/* Keyed so a second file starts from its own checks rather than the last one's. */}
      {choice && <Form key={`${choice.from}:${choice.name}`} choice={choice} onClose={onClose} onDone={onDone} />}
    </ModalDialog>
  );
}

function Form({ choice, onClose, onDone }: { choice: PresetFileChoice; onClose: () => void; onDone: () => void }) {
  const { file } = choice;
  const source = quoted(choice);
  const config = usePacerStore((s) => s.board.config);
  const configSource = usePacerStore((s) => s.configSource);
  const applyEdit = usePacerStore((s) => s.applyEdit);
  const savedConfig = usePacerStore((s) => s.savedConfig);

  const differing = useMemo(() => presetsMergeWouldChange(config, file.config, file.presets), [config, file]);
  const [checked, setChecked] = useState<readonly number[]>(differing);
  const chosen = file.presets.filter((i) => checked.includes(i));
  // The ones that would change first: in a whole dump they're two or three among twenty-four.
  const listed = [...differing, ...file.presets.filter((i) => !differing.includes(i))];
  /*
   * A preset edited here since the configuration was opened is checked like any other that differs
   * — the file may well hold the change that was asked for — but it's the one case where bringing
   * a preset in loses work, so the row says so.
   */
  const editedHere = useMemo(() => changedPresets(savedConfig, config), [savedConfig, config]);
  const label = (i: number, from: typeof config) =>
    `${presetIndexToLabel(i)} ${from.presets[i]?.name?.trim() ?? ""}`.trim();
  const merged = useMemo(() => mergePresets(config, file.config, file.presets), [config, file]);

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        {file.whole
          ? `Check the presets from ${source} to merge into the open configuration, “${configSource}”. The ones that differ from it are checked.`
          : `${source} holds ${file.presets.length} of the Pacer's 24 presets, so they're merged into the open configuration, “${configSource}”, rather than opened by themselves.`}{" "}
        Each preset is written over the one in the same slot, and anything {source} doesn't say about that preset stays
        as it is.
      </p>

      <ul className="max-h-72 space-y-1 overflow-auto rounded-md border p-2" aria-label="Presets to merge">
        {listed.map((i) => {
          const changes = differing.includes(i);
          const renamed = merged.presets[i]?.name?.trim() !== config.presets[i]?.name?.trim();
          return (
            <li key={i}>
              <Check
                className="text-sm"
                isSelected={checked.includes(i)}
                onChange={(on) => setChecked((t) => (on ? [...t, i] : t.filter((x) => x !== i)))}
              >
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="tabular-nums">{label(i, merged)}</span>
                  <span className="text-xs text-muted-foreground">
                    {!changes
                      ? "the same as the open one"
                      : renamed
                        ? `replaces ${label(i, config)}`
                        : "differs from the open one"}
                  </span>
                  {changes && editedHere.includes(i) && (
                    <span className="text-xs text-warning">
                      you've edited this one since opening; uncheck to keep it
                    </span>
                  )}
                </span>
              </Check>
            </li>
          );
        })}
      </ul>

      {file.hasGlobals && <p className="text-xs text-muted-foreground">Global settings aren't merged, only presets.</p>}
      <p className="text-xs text-muted-foreground">
        Nothing reaches the Pacer until you send it, and one undo takes all of this back.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onPress={onClose}>
          Cancel
        </Button>
        <Button
          isDisabled={chosen.length === 0}
          onPress={() => {
            applyEdit((c) => mergePresets(c, file.config, chosen));
            onDone();
          }}
        >
          Merge {chosen.length === 1 ? "1 preset" : `${chosen.length} presets`}
        </Button>
      </div>
    </div>
  );
}
