import { ControlId } from "../protocol/constants";

const LABELS: Partial<Record<number, string>> = {
  [ControlId.Stompswitch1]: "Stomp 1",
  [ControlId.Stompswitch2]: "Stomp 2",
  [ControlId.Stompswitch3]: "Stomp 3",
  [ControlId.Stompswitch4]: "Stomp 4",
  [ControlId.Stompswitch5]: "Stomp 5",
  [ControlId.Stompswitch6]: "Stomp 6",
  [ControlId.StompswitchA]: "Stomp A",
  [ControlId.StompswitchB]: "Stomp B",
  [ControlId.StompswitchC]: "Stomp C",
  [ControlId.StompswitchD]: "Stomp D",
  [ControlId.Footswitch1]: "Footswitch 1",
  [ControlId.Footswitch2]: "Footswitch 2",
  [ControlId.Footswitch3]: "Footswitch 3",
  [ControlId.Footswitch4]: "Footswitch 4",
  [ControlId.ExpressionPedal1]: "Expression 1",
  [ControlId.ExpressionPedal2]: "Expression 2",
};

export function controlLabel(controlId: number): string {
  return LABELS[controlId] ?? `Control 0x${controlId.toString(16)}`;
}
