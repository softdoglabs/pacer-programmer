# Tutorials

These four tutorials build one real thing: a looper for a Neural DSP Quad
Cortex that you can reach from your main presets, and that brings you back to
whichever one you came from. It exercises both halves
of the app: you'll try every switch in the simulator as you go, and the map
takes care of the copies the Pacer needs. If you're wondering why copies come
into it at all, [Why a state machine](../why-a-state-machine.md) explains.

1. [A Looper Preset](1-a-looper-preset.md): program a preset by hand, plus a
   switch that goes to it and back.
2. [A Second Way In](2-a-second-way-in.md): enter the looper from another
   preset, and let the map make the copy the Pacer needs.
3. [Changing the Looper](3-changing-the-looper.md): edit it once, and every
   copy follows.
4. [Letting an AI Build It](4-letting-an-ai-build-it.md): the same looper,
   programmed by an assistant and finished on the map.

Each one starts from the factory defaults, so you can follow along without a
Pacer. If you have different gear, use its CCs instead of the Quad Cortex's;
the steps are the same.

If you can, point a [simulated MIDI output](../guide/the-simulator.md) at your
gear. Hearing the looper respond is the best check there is. If you can't, the
log shows everything that would have been sent.
