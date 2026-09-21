import { useRef, useState, type ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { decodeSysex } from "./pacer/protocol/decode";
import { loadFactoryDefaults } from "./pacer/factoryDefaults";
import { usePacerStore } from "./store/pacerStore";
import { Faceplate } from "./ui/panel/Faceplate";
import { Inspector } from "./ui/Inspector";
import { MessageLog } from "./ui/MessageLog";
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
  const loadConfig = usePacerStore((s) => s.loadConfig);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadError, setLoadError] = useState<string>();

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const config = decodeSysex(new Uint8Array(await file.arrayBuffer()));
      loadConfig(config, file.name);
      setLoadError(undefined);
    } catch (err) {
      setLoadError(`Couldn't read ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen flex-col lg:h-screen">
        <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
          <h1 className="text-base font-semibold">Pacer Programmer</h1>
          <Badge variant="outline" className="font-mono">
            {configSource}
          </Badge>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => loadConfig(loadFactoryDefaults(), "Factory defaults")}>
              Factory defaults
            </Button>
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              Load .syx
            </Button>
            <input ref={fileInputRef} type="file" accept=".syx" className="hidden" onChange={handleFileChange} />
          </div>
        </header>
        {loadError && <div className="border-b bg-destructive/15 px-4 py-2 text-sm text-destructive">{loadError}</div>}

        <main className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
          <div className="min-h-0 space-y-5 lg:overflow-y-auto lg:pr-1">
            <Faceplate />
            <Section title="Rear jacks">
              <RearJacks />
            </Section>
            <Section title="Presets">
              <PresetList />
            </Section>
          </div>
          <aside className="flex min-h-0 flex-col gap-4 max-lg:h-[70vh]">
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
