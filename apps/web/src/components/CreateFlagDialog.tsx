import { useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import type { FeatureFlag } from '@ff/shared';
import { CreateFlagForm } from './CreateFlagForm';

interface CreateFlagDialogProps {
  open: boolean;
  actor: string;
  onClose: () => void;
  onCreated: (flag: FeatureFlag) => void;
}

/**
 * Native <dialog> opened with showModal(): focus trapping, Escape to close and the backdrop
 * come from the browser. The form is mounted only while open, so every opening starts empty.
 */
export function CreateFlagDialog({ open, actor, onClose, onCreated }: CreateFlagDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function close() {
    dialogRef.current?.close();
  }

  // A click on the backdrop targets the <dialog> itself; clicks inside land on the inner div.
  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="create-flag-title"
      className="m-auto w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-border bg-surface p-0 text-text shadow-dialog"
      onClose={onClose}
      onClick={handleClick}
    >
      <div>
        {open ? <CreateFlagForm actor={actor} onCreated={onCreated} onCancel={close} /> : null}
      </div>
    </dialog>
  );
}
