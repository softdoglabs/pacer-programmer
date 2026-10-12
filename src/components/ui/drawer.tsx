// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { ReactNode } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "./button";

/**
 * A panel that slides in over the page, for things you visit rather than work in — the device and
 * its library of snapshots. Modal, because while it's open the page behind it isn't what you're
 * doing. Dismissable by Escape or a tap outside.
 */
export function Drawer({
  isOpen,
  onOpenChange,
  title,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className="fixed inset-0 z-50 bg-black/60">
      <Modal className="fixed inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l bg-popover shadow-2xl">
        <Dialog className="flex h-full min-h-0 flex-col outline-none">
          {({ close }) => (
            <>
              <div className="flex items-center justify-between border-b px-5 py-3">
                <Heading slot="title" className="text-base font-semibold">
                  {title}
                </Heading>
                <Button size="icon" variant="ghost" aria-label="Close" title="Close this panel" onPress={close}>
                  ✕
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
