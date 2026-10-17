import { formatDuration, parseDuration, type SetBlock } from '@setlist/core';
import { useState, type FormEvent } from 'react';
import { Field, inputProps } from '../components/forms';
import { Modal } from '../components/Modal';

/** Renames a set and sets how long it should run. */
export function BlockDialog({
  block,
  onClose,
  onSave,
}: {
  block: SetBlock;
  onClose: () => void;
  onSave: (values: { name: string; targetDurationSec: number | null }) => void;
}) {
  const [name, setName] = useState(block.name);
  const [target, setTarget] = useState(
    block.targetDurationSec === null ? '' : formatDuration(block.targetDurationSec),
  );
  const [errors, setErrors] = useState<{ name?: string; target?: string }>({});

  function save(event: FormEvent) {
    event.preventDefault();
    const seconds = parseDuration(target);
    const found = {
      name: name.trim() ? undefined : 'Give the set a name',
      target: seconds === undefined ? 'Use hours and minutes like 45:00 or 1:30:00' : undefined,
    };
    if (found.name || found.target) {
      setErrors(found);
      return;
    }
    onSave({ name: name.trim(), targetDurationSec: seconds ?? null });
  }

  return (
    <Modal title={`Edit ${block.name}`} onClose={onClose}>
      <form className="form-grid" onSubmit={save} noValidate>
        <Field id="block-name" label="Name" error={errors.name}>
          <input
            {...inputProps('block-name', errors.name)}
            autoFocus
            placeholder="Set 1, Encore…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id="block-target" label="Target length (m:ss)" error={errors.target}>
          <input
            {...inputProps('block-target', errors.target)}
            placeholder="45:00"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        <div className="modal__actions form-grid__wide">
          <button type="button" className="sm-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="sm-button sm-button--primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
