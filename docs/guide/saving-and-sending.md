# Saving and sending

The app keeps three versions of your configuration, and it helps to know
which is which:

| | Where | Changed by |
|---|---|---|
| **What you're editing** | On screen | Every edit. Undo and Redo move through it. |
| **Snapshots** | This browser | **Save**, **Pull**, **Import**. |
| **What the Pacer has** | The Pacer | **Send**. |

## Save often

**Save…** keeps your edits as a snapshot: either a new one or over the one
you opened. Saving doesn't touch the Pacer. Snapshots survive closing the
browser; unsaved edits don't.

To have a file of it — a backup, or to give to an AI — save, then open the
device drawer and **Export .syx** on that snapshot.

## Send when it's right

**Send to Pacer…** writes presets to the Pacer. By default it sends only the
presets you've changed, lists them, and asks you to confirm.

![Send to Pacer](../images/send-dialog.png)

Before your first send:

- **Pull a copy of the Pacer first.** Sending overwrites presets, and the
  Pacer has no undo. A pulled snapshot is your way back.
- Leave **Read back afterwards to verify** on. It checks that the Pacer has
  what you sent.

If the Pacer has one of the presets you're sending loaded, the app updates
the copy it's running too, so the change is live straight away.

The [preset chooser](../reference/the-faceplate.md#the-preset-chooser) marks
the presets the Pacer hasn't been sent with a hollow dot, and the ones you've
edited since opening with a filled one.

Details: [Devices and files](../reference/devices-and-files.md).
