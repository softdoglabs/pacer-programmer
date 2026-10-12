// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePacerStore, type LogEntry } from "../store/pacerStore";

const TITLE_COLOR: Record<LogEntry["kind"], string> = {
  control: "text-sky-300",
  firmware: "text-primary",
  app: "text-muted-foreground",
};

function lineClass(line: string) {
  if (line.startsWith("(warning)")) return "text-warning";
  if (line.startsWith("Preset")) return "text-primary";
  return undefined;
}

export function MessageLog() {
  const log = usePacerStore((s) => s.log);
  const clearLog = usePacerStore((s) => s.clearLog);
  const entries = [...log].reverse();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-semibold">Output</h2>
        <Button
          variant="ghost"
          size="sm"
          onPress={clearLog}
          isDisabled={log.length === 0}
          title={log.length === 0 ? "The log is already empty" : "Empty the log"}
        >
          Clear
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border bg-black/30">
        <div className="space-y-3 p-3 font-mono text-xs" role="log" aria-label="Output log">
          {entries.length === 0 && <p className="text-muted-foreground">Press a switch to see what it would send.</p>}
          {entries.map((entry) => (
            <div key={entry.id}>
              <div className={cn("font-semibold", TITLE_COLOR[entry.kind])}>{entry.title}</div>
              {entry.lines.map((line, i) => (
                <div key={i} className={cn("whitespace-pre-wrap", lineClass(line))}>
                  {line}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
