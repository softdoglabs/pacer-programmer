# 4. Letting an AI build it

Tutorial 1 programmed eight switches by hand, and for one looper that's
fine. For a whole board — every preset sending the right patch changes,
every effect on its own switch with matching colours — it's an evening. An
AI assistant can do that part from your gear's MIDI chart, and this app is
where you check its work.

1. **Export** the factory defaults (or your own configuration) as a `.syx`:
   save it as a snapshot, then **Export .syx** in the device drawer.
2. **Ask** an assistant to build LOOPR in C1 and route A1 to it, using the
   prompt in [Working with an AI](../guide/working-with-ai.md#example-a-looper-preset-for-the-quad-cortex),
   which points it at the format reference.
3. **Import** the file it gives you, and check it: Simulate the looper
   against your Quad Cortex, read each switch in Program mode, and look at
   the map — it should look like the end of
   [tutorial 1](1-a-looper-preset.md#on-the-map).
4. **Add the second way in on the map**, as in
   [tutorial 2](2-a-second-way-in.md). This part is better done here than by
   the AI: the map knows which copy each origin needs, prices the slots, and
   refuses anything it couldn't read back.
5. **Save** and **Send to Pacer**.

The division of labour that works: the AI does the bulk programming, which
needs your gear's manual; the app does the structure, which needs to stay
consistent; and the simulator is where you find out whether either got it
wrong, before the Pacer does.
