import { useCallback, useRef, useState } from 'react';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import { ConfirmContext } from './useConfirm';

/**
 * const ok = await confirm({ title, message, confirmLabel, cancelLabel, secondaryLabel, danger, onConfirm })
 * Resolves true when confirmed, false when cancelled (Cancel, Esc, X or backdrop),
 * and 'secondary' when the optional middle button (secondaryLabel) is chosen.
 * With `onConfirm`, the dialog stays open with a loading button until it finishes;
 * returning false from it keeps the dialog open (e.g. after an error toast).
 */
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef(null);
  const busyRef = useRef(false);

  const settle = useCallback((result) => {
    resolver.current?.(result);
    resolver.current = null;
    setDialog(null);
  }, []);

  const confirm = useCallback((options) => {
    // Only one dialog at a time: a new request cancels the previous one.
    resolver.current?.(false);
    return new Promise((resolve) => {
      resolver.current = resolve;
      setDialog(options);
    });
  }, []);

  const cancel = () => {
    if (!busyRef.current) settle(false);
  };

  async function handleConfirm() {
    if (!dialog.onConfirm) return settle(true);
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if ((await dialog.onConfirm()) === false) return;
      settle(true);
    } catch {
      settle(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(dialog)}
        onClose={cancel}
        title={dialog?.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={cancel} disabled={busy} data-autofocus>
              {dialog?.cancelLabel ?? 'Cancel'}
            </Button>
            {dialog?.secondaryLabel && (
              <Button variant="outline" onClick={() => settle('secondary')} disabled={busy}>
                {dialog.secondaryLabel}
              </Button>
            )}
            <Button variant={dialog?.danger ? 'danger' : 'primary'} loading={busy} onClick={handleConfirm}>
              {dialog?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        {/* Plain text goes in a paragraph; rich content (e.g. an add-to-cart summary) renders as given. */}
        {typeof dialog?.message === 'string' ? <p className="muted">{dialog.message}</p> : dialog?.message}
      </Modal>
    </ConfirmContext.Provider>
  );
}
