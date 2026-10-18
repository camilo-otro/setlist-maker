import { AppOutdatedError, BandTakenError, type ShareLinkInfo } from '@setlist/storage';
import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { DisplayNameDialog } from './DisplayNameDialog';
import type { Sharing } from './sharing';

type Step =
  | { kind: 'checking' }
  | { kind: 'name' }
  | { kind: 'uploading' }
  | { kind: 'ready'; link: ShareLinkInfo; confirmOff: boolean }
  | { kind: 'off' }
  | { kind: 'failed'; message: string };

function failureMessage(error: unknown): string {
  if (error instanceof AppOutdatedError) return error.message;
  if (error instanceof BandTakenError) {
    return 'This band is already shared from another account, so it can’t be shared from here.';
  }
  return 'Couldn’t reach the server. Check your internet connection and try again.';
}

/**
 * Shares a gig's setlist with a read-only link. The first time, it asks for a display name,
 * signs in silently and uploads the band; after that it shows the gig's link straight away.
 */
export function ShareDialog({
  sharing,
  bandId,
  gigId,
  gigTitle,
  onClose,
}: {
  sharing: Sharing;
  bandId: string;
  gigId: string;
  gigTitle: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'checking' });
  const [copied, setCopied] = useState(false);

  const prepare = useCallback(
    async (displayName?: string) => {
      try {
        const me = await sharing.identity.current();
        const name = displayName ?? me?.displayName;
        if (!name) {
          setStep({ kind: 'name' });
          return;
        }
        setStep({ kind: 'uploading' });
        await sharing.share(name);
        const link =
          (await sharing.links.active(gigId)) ?? (await sharing.links.create(bandId, gigId));
        setStep({ kind: 'ready', link, confirmOff: false });
      } catch (error) {
        setStep({ kind: 'failed', message: failureMessage(error) });
      }
    },
    [sharing, bandId, gigId],
  );

  // On open: ask for a name first if this device has never shared, otherwise go straight on.
  useEffect(() => {
    let cancelled = false;
    sharing.identity.current().then(
      (me) => {
        if (cancelled) return;
        if (me) void prepare(me.displayName);
        else setStep({ kind: 'name' });
      },
      (error: unknown) => !cancelled && setStep({ kind: 'failed', message: failureMessage(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, [sharing, prepare]);

  if (step.kind === 'name') {
    return (
      <DisplayNameDialog
        identity={sharing.identity}
        onClose={onClose}
        onReady={(me) => void prepare(me.displayName)}
      />
    );
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      (document.getElementById('share-link') as HTMLInputElement | null)?.select();
    }
  }

  async function turnOff(link: ShareLinkInfo) {
    try {
      await sharing.links.revoke(link.id);
      setStep({ kind: 'off' });
    } catch (error) {
      setStep({ kind: 'failed', message: failureMessage(error) });
    }
  }

  return (
    <Modal title={`Share ${gigTitle}`} onClose={onClose} busy={step.kind === 'uploading'}>
      <div className="share-dialog">
        {step.kind === 'checking' && <p className="muted">Getting the link…</p>}
        {step.kind === 'uploading' && (
          <p className="muted" role="status">
            Uploading your band so the link can show this setlist…
          </p>
        )}
        {step.kind === 'failed' && (
          <>
            <p className="sm-field__error" role="alert">
              {step.message}
            </p>
            <div className="modal__actions">
              <button type="button" className="sm-button" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="sm-button sm-button--primary"
                onClick={() => void prepare()}
              >
                Try again
              </button>
            </div>
          </>
        )}
        {step.kind === 'ready' && (
          <>
            <p>
              Anyone with this link can see the setlist, without an account. It updates as you make
              changes.
            </p>
            <div className="share-dialog__link">
              <input
                id="share-link"
                className="sm-input"
                readOnly
                aria-label="Share link"
                value={step.link.url}
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                className="sm-button sm-button--primary"
                onClick={() => void copy(step.link.url)}
              >
                {copied ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Copy size={16} aria-hidden="true" />
                )}
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            {step.confirmOff ? (
              <div className="share-dialog__confirm" role="alert">
                <p>People with this link will no longer see the setlist.</p>
                <div className="modal__actions">
                  <button
                    type="button"
                    className="sm-button"
                    onClick={() => setStep({ ...step, confirmOff: false })}
                  >
                    Keep the link
                  </button>
                  <button
                    type="button"
                    className="sm-button sm-button--danger"
                    onClick={() => void turnOff(step.link)}
                  >
                    Turn off link
                  </button>
                </div>
              </div>
            ) : (
              <div className="modal__actions">
                <button
                  type="button"
                  className="sm-button"
                  onClick={() => setStep({ ...step, confirmOff: true })}
                >
                  Turn off link
                </button>
                <button type="button" className="sm-button" onClick={onClose}>
                  Done
                </button>
              </div>
            )}
          </>
        )}
        {step.kind === 'off' && (
          <>
            <p>The link is off. Anyone opening it now sees that it doesn’t work.</p>
            <div className="modal__actions">
              <button type="button" className="sm-button" onClick={onClose}>
                Done
              </button>
              <button
                type="button"
                className="sm-button sm-button--primary"
                onClick={() => void prepare()}
              >
                Create a new link
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
