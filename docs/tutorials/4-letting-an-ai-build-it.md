# 4. Letting an AI Build It

In tutorial 1 we programmed nine switches by hand. For one looper that's
fine. For a whole board, with every preset sending the right patch changes and
every effect on its own switch with matching colours, it's an evening's work.
An AI assistant can do that part from your gear's MIDI chart, and this app is
where you check what it did.

1. Export the factory defaults (or your own configuration) as a `.syx`: open
   the device drawer and click **Export** on its row.
2. Ask an assistant to build LOOPR in C1 and route A1 to it, using the prompt
   in [Working with an AI](../guide/working-with-ai.md#example-a-looper-preset-for-the-quad-cortex).
   It points the AI at the format reference.
3. Merge the presets it changed. In the device drawer, click **Pick presets
   from a file…** and pick the file it gave you. The presets that differ from what
   you have open are listed first and already ticked, which here means A1 and
   C1. Click **Merge 2 presets**.

   ![Merging presets: A1 and C1 are ticked, and the other 22 are the same as the open ones](../images/import-presets.png)

   Your configuration is still the one you had open, with those two presets
   changed, and one undo takes them back out. Nothing you didn't tick is
   touched. If you edited a preset while the AI was working, a whole dump
   still has its old version, so it's listed as differing too, with a note.
   Untick it to keep your edit.

   The assistant might hand back only the messages it changed and not the
   whole dump. That's fine, and it's a much smaller file. Pick it with
   **Import config…** or **Pick presets from a file…** and you get the same list, with just
   those two presets in it.
4. Check it. Play the looper in the simulator against your gear, read through
   each switch in Program mode, and look at the map. It should look like the
   end of [tutorial 1](1-a-looper-preset.md#on-the-map).
5. Add the second way in on the map, as in
   [tutorial 2](2-a-second-way-in.md). It's better to do this part here than to ask
   the AI: the map knows which copy each origin needs, works out the slots,
   and refuses anything it couldn't read back.
6. Save, and send it to the Pacer.

A split that works well is this. The AI does the bulk
programming, which mostly means reading your gear's manual. The app handles
the structure, which has to stay consistent. And the simulator is where you
find out whether either of them got it wrong, before the Pacer does.
