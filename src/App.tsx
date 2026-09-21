import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePacerStore } from "./store/pacerStore";
import { ConfigurationsPanel } from "./ui/ConfigurationsPanel";
import { Faceplate } from "./ui/panel/Faceplate";
import { Inspector } from "./ui/Inspector";
import { MessageLog } from "./ui/MessageLog";
import { MidiOutputControl } from "./ui/MidiOutputControl";
import { PresetList } from "./ui/PresetList";
import { RearJacks } from "./ui/RearJacks";

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h2 className="pb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function App() {
  const configSource = usePacerStore((s) => s.configSource);
  const sessionId = usePacerStore((s) => s.sessionId);
  const resetMidiState = usePacerStore((s) => s.resetMidiState);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen flex-col lg:h-screen">
        <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
          <h1 className="text-base font-semibold">Pacer Programmer</h1>
          <Badge variant="outline" className="font-mono">
            {configSource}
          </Badge>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <MidiOutputControl />
          </div>
        </header>

        <main className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
          <div className="min-h-0 space-y-5 lg:overflow-y-auto lg:pr-1">
            {/* Simulator views are keyed on the session, so a configuration switch remounts them. */}
            <Fragment key={`sim-${sessionId}`}>
              <Faceplate />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Button size="sm" variant="outline" onClick={resetMidiState}>
                  Reset MIDI state
                </Button>
                <span>
                  The Pacer remembers the last program, CC values and notes it sent (they light switches across
                  presets). This forgets them.
                </span>
              </div>
              <Section title="Rear jacks">
                <RearJacks />
              </Section>
            </Fragment>
            <Section title="Configurations">
              <ConfigurationsPanel />
            </Section>
            <Section title="Presets" key={`presets-${sessionId}`}>
              <PresetList />
            </Section>
          </div>
          <aside className="flex min-h-0 flex-col gap-4 max-lg:h-[70vh]" key={`aside-${sessionId}`}>
            <div className="rounded-lg border bg-card p-3">
              <Inspector />
            </div>
            <MessageLog />
          </aside>
        </main>
      </div>
    </TooltipProvider>
  );
}
