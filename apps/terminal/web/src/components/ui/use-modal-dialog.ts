"use client";

/* A native <dialog> that follows `open`: shown as a modal (focus kept inside, the page behind
   inert, Escape fires `cancel`) and closed when `open` turns false. `focusSelf` puts the focus on
   the dialog itself instead of its first control, for a dialog that can open while the operator
   is typing (a stray Space or Enter must not press a button; Tab still reaches them). Give the
   dialog tabIndex={-1} then. Styles: .ui-dialog (styles/ui.css). */
import { useEffect, useRef } from "react";

export function useModalDialog(open: boolean, focusSelf = false) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      if (focusSelf) d.focus();
    }
    if (!open && d.open) d.close();
  }, [open, focusSelf]);

  return dialog;
}
