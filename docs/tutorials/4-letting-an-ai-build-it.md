# 4. Letting an AI build it

In tutorial 1 we programmed nine switches by hand. For one looper that's
fine. For a whole board, with every preset sending the right patch changes and
every effect on its own switch with matching colours, it's an evening's work.
An AI assistant can do that part from your gear's MIDI chart, and this app is
where you check what it did.

1. Export the factory defaults (or your own configuration) as a `.syx`: open
   the device drawer and click **Export .syx** on its row.
2. Ask an assistant to build LOOPR in C1 and route A1 to it, using the prompt
   in [Working with an AI](../guide/working-with-ai.md#example-a-looper-preset-for-the-quad-cortex).
   It points the AI at the format reference.
3. Import the file it gives you, and check it. Play the looper in the
   simulator against your gear, read through each switch in Program
   mode, and look at the map. It should look like the end of
   [tutorial 1](1-a-looper-preset.md#on-the-map).
4. Add the second way in on the map, as in
   [tutorial 2](2-a-second-way-in.md). It's better to do this part here than to ask
   the AI: the map knows which copy each origin needs, works out the slots,
   and refuses anything it couldn't read back.
5. Save, and send it to the Pacer.

A split that works well is this. The AI does the bulk
programming, which mostly means reading your gear's manual. The app handles
the structure, which has to stay consistent. And the simulator is where you
find out whether either of them got it wrong, before the Pacer does.
