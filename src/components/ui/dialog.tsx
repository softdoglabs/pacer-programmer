// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { ReactNode } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";

/** A modal dialog (controlled). Closes on Escape or an outside tap when `isDismissable`. */
export function ModalDialog({
  isOpen,
  onOpenChange,
  title,
  wide = false,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Room for more than a question: a few sections of text. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <Modal
        className={`max-h-full w-full overflow-y-auto rounded-lg border bg-popover p-5 shadow-xl ${wide ? "max-w-lg" : "max-w-md"}`}
      >
        <Dialog className="space-y-4 outline-none">
          <Heading slot="title" className="text-base font-semibold">
            {title}
          </Heading>
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
