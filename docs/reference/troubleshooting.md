# Troubleshooting

This page covers what the app's messages mean and what to do about them,
grouped by where you'll see them.

## Connecting

| You see | Meaning | Try |
|---|---|---|
| Web MIDI isn't available in this browser | The browser has no Web MIDI. | Try a browser that supports Web MIDI with SysEx. |
| MIDI access denied | The browser, or you, refused. | Allow MIDI (and SysEx) in the site's settings, then **Retry**. |
| SysEx off | MIDI was granted without SysEx. | Re-allow with SysEx. Without it the Pacer can't be read or written, and MMC steps aren't sent. |
| No Pacer found | No port with "Pacer" in its name, or the ports aren't chosen. | Check the USB cable, then pick the ports in the [device drawer](devices-and-files.md#the-device-drawer). |
| *The Pacer didn't answer a MIDI Device Inquiry…* | It's connected but didn't say who it is. | Harmless: only the firmware line is missing. **Ask again** retries. |

## Pulling

| You see | Meaning | Try |
|---|---|---|
| *No reply from the Pacer…* | The dump request got no answer. | Is the Pacer on and on USB? Are both ports the Pacer's? Is SysEx granted? |
| *Pulling needs the SysEx permission…* | MIDI without SysEx. | Re-allow MIDI with SysEx. |
| *Wait for the send to the Pacer to finish.* | You pulled during a send. | A dump request too soon after writing can corrupt a preset on the Pacer, so the app waits. Pull again after the send. |
| *Browser storage is full…* | Browser storage is used up (about 25 dumps). | Export and delete old snapshots. |

## Sending

| You see | Meaning | Try |
|---|---|---|
| **Send to Pacer…** is greyed out | No MIDI, no SysEx, or no Pacer output port. | Hover it for which. |
| *The Pacer's read-back doesn't match…* | After sending, the Pacer's copy of some presets differs. | Send those presets again. If it keeps happening, report it with the snapshot. |
| *…Presets may be partly written; send them again to be sure.* | The send stopped part way (cancelled, or the port went away). | Send again. |
| *Couldn't tell which preset the Pacer has loaded…* | The presets were written, but the Pacer may still be running the old version of the loaded one. | Select that preset again on the Pacer. |
| *(not sent) the Pacer is being written to…* in the log | The simulator's output is the Pacer, and a send is running. | Wait for the send; presses resume after it. |

## Files

| You see | Meaning | Try |
|---|---|---|
| *That doesn't contain any Pacer configuration data* | The file has no Pacer messages. | Check it's a Pacer dump, not another device's. |
| *unterminated SysEx message…*, *checksum…* | The file is damaged or malformed. A single bad byte is enough. | If an AI wrote it, show it the error and [the format](programming-the-pacer.md#the-checksum); see [Working with an AI](../guide/working-with-ai.md). |

## Editing

| You see | Meaning | Try |
|---|---|---|
| Name in red: *Up to 5 characters…* | The display shows five. | Shorten it. |
| *Only printable ASCII characters can be stored* | The Pacer can't store that character. | Use plain letters, digits and punctuation. |
| *The Pacer may not display…* | Stored, but the Pacer's display may not draw it. | Fine to keep; A–Z, 0–9, space and `-` are certain. |
| *A built-in firmware mode is showing…* | You're in preset select, Track or Transport. | Edits apply to the user preset underneath. Tap [Preset] to return. |

## The Preset Map

These come from the [route dialog](preset-map.md#the-route-dialog) and the
[state details](preset-map.md#a-states-presets). The app refuses an edit it
couldn't read back the same way, rather than writing it and leaving you to
find out on the next load.

| You see | Meaning | Try |
|---|---|---|
| *A route can't lead to the state it leaves from…* | That's a reload. | Use a Preset Select step to *Current*, in Program mode. |
| *Step N on that switch already jumps somewhere…* | A press only takes the first jump, so a later one never fires. | Tick **Replace**, or choose another switch. |
| *Every step on X is in use…* | No room for a jump. | Tick **Replace**, or choose another switch. |
| *X already selects the Track preset…* | Switch A or B is the firmware's Track/Transport selector, which would be the first jump. | Tick **Replace**, or choose another switch. |
| *No empty presets left…* | The route needs a new copy and every slot is in use. | [Clear a preset](program-mode.md#clear-preset), or choose one to overwrite. |
| *That preset has something in it…* | You chose an occupied slot for a copy. | Fine if you mean it; otherwise pick an empty one. |
| *X is one of the presets this route runs between…* | A copy can't overwrite the presets it connects. | Choose another slot. |
| *Can't route to "X": it's on the device N times…* | X has identical copies and none returns, so there's no telling which you mean. | Clear the extra copies, or give each a way back. |
| *That would stop A3 coming back to where it was entered from…* | The edit would make a return read as an ordinary jump: typically, a second route into one copy of a returning state. | Route into the state from the state that should enter it, so it gets its own copy. |
| *That would leave something unreadable: …* | The result couldn't be read back as states and routes. The rest of the message says what. | Nothing was written, so there's nothing to undo. Try the change another way. |
| *…is missing a jump its state has elsewhere.* | One copy of a state lacks a route the others have. | Usually after editing one copy alone; edit the state as a whole, or let the copy leave the state. |
| *The copies of "X" lead to different states from the same switch…* | Copies disagree about where a switch goes. | Make them agree, on the map or by editing one copy with the *only* choice under *Changes*. |
| *X has something in it. Clear it first, or pick an empty one.* | **Move to…** only moves into empty presets. | Clear the slot first. |
| *Moving A3 to D6 would change what the configuration does…* | The move isn't a pure renumbering. | Please report it as a bug, since moves are meant to always be safe. |

## In the Output Log

| You see | Meaning |
|---|---|
| *(warning) multiple preset-navigation actions fired by one press; using the first* | Two steps on one press both change preset. The Pacer takes the first. |
| *(warning) StepSelect/StepIncDec targeting isn't simulated yet…* | External step select isn't followed across switches. |
| *(warning) N of M message(s) not sent to …* | The MIDI output refused them. Usually the port went away, or SysEx isn't granted for MMC. |
| *(warning) step N: channel byte … is out of range* | A step's channel isn't 0–16. The file was probably hand-edited. |
