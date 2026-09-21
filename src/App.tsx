import { useRef, type ChangeEvent } from "react";
import { decodeSysex } from "./pacer/protocol/decode";
import { getActiveControlIds } from "./pacer/simulator";
import { usePacerStore } from "./store/pacerStore";
import { ControlButton } from "./ui/ControlButton";
import { MessageLog } from "./ui/MessageLog";
import { PresetIndicator } from "./ui/PresetIndicator";

export function App() {
  const board = usePacerStore((s) => s.board);
  const loadConfig = usePacerStore((s) => s.loadConfig);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const controlIds = getActiveControlIds(board);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const config = decodeSysex(new Uint8Array(buffer));
    loadConfig(config);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Pacer Simulator</h1>
        <PresetIndicator />
        <label className="file-loader">
          Load .syx
          <input ref={fileInputRef} type="file" accept=".syx" onChange={handleFileChange} />
        </label>
      </header>
      <main className="app-main">
        <div className="control-grid">
          {controlIds.map((id) => (
            <ControlButton key={id} controlId={id} />
          ))}
          {controlIds.length === 0 && <p>No controls configured on this preset.</p>}
        </div>
        <MessageLog />
      </main>
    </div>
  );
}
