import { controlLabel } from "../pacer/simulator";
import { usePacerStore } from "../store/pacerStore";

export function MessageLog() {
  const log = usePacerStore((s) => s.log);
  const entries = [...log].reverse();

  return (
    <div className="message-log">
      {entries.length === 0 && <p className="message-log-empty">Press a control to see what it would send.</p>}
      {entries.map((entry) => (
        <div key={entry.id} className="message-log-entry">
          <div className="message-log-header">
            {controlLabel(entry.controlId)} — {entry.phase}
          </div>
          {entry.lines.map((line, i) => (
            <div key={i} className="message-log-line">
              {line}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
