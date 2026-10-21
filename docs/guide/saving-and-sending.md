# Saving and Sending

There are three copies of your configuration floating around, and it helps to
know which is which:

| | Where it lives | What changes it |
|---|---|---|
| What you're editing | On screen | Every edit. Undo and Redo move through it. |
| Snapshots | This browser | Save, Pull, Import |
| What the Pacer has | The Pacer | Send |

## Save Often

**Save…** keeps your edits as a snapshot, either a new one or over the one you
opened. Saving doesn't touch the Pacer. Snapshots survive closing the browser;
unsaved edits don't.

If you want a file (a backup, or something to hand an AI), save first, then
open the device drawer and click **Export** on that snapshot.

## Send When It's Right

**Send to Pacer…** writes presets to the Pacer. By default it only sends the
presets you've changed. It lists them and asks you to confirm.

![Send to Pacer](../images/send-dialog.png)

Before your first send, pull a copy of the Pacer. Sending overwrites presets,
and the Pacer has no undo, so that pulled snapshot is your way back. It's also worth
leaving **Read back afterwards to verify** turned on, since it checks that the
Pacer really has what you sent.

If the Pacer has one of the presets you're sending loaded right now, the app
updates the copy it's running too, so you see the change right away.

The [preset chooser](../reference/the-faceplate.md#the-preset-chooser) marks
the presets the Pacer hasn't been sent with a hollow dot, and the ones you've
edited since opening with a filled one.

For the details, see [Devices and files](../reference/devices-and-files.md).
