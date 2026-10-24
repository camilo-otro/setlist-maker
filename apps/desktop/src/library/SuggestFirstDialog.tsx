import { useState } from 'react';
import { Modal } from '../components/Modal';

const ADD_WITHOUT_ASKING = 'setlist-maker.add-songs-without-asking';

/** Whether this device's owner said not to be asked again: kept on the device only. */
export function addsWithoutAsking(): boolean {
  try {
    return localStorage.getItem(ADD_WITHOUT_ASKING) === '1';
  } catch {
    return false;
  }
}

function stopAsking() {
  try {
    localStorage.setItem(ADD_WITHOUT_ASKING, '1');
  } catch {
    // Asked again next time, then.
  }
}

/**
 * Before an owner adds a song directly, in a band that votes on suggestions (#89): did they mean
 * to suggest it? Either way, they can ask not to be asked again on this device.
 */
export function SuggestFirstDialog({
  onSuggest,
  onAdd,
  onClose,
}: {
  onSuggest: () => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const [dontAsk, setDontAsk] = useState(false);
  const choose = (next: () => void) => () => {
    if (dontAsk) stopAsking();
    next();
  };

  return (
    <Modal title="¿Querías sugerirla?" onClose={onClose}>
      <p className="suggest-first__body">
        Al sugerir una canción, la banda la escucha, la vota y la comenta antes de agregarla al
        repertorio. Como administrador, también puedes agregarla directamente.
      </p>
      <label className="song-form__checkbox">
        <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
        No volver a preguntar en este dispositivo
      </label>
      <div className="modal__actions">
        <button type="button" className="sm-button" onClick={choose(onAdd)}>
          Agregar directamente
        </button>
        <button type="button" className="sm-button sm-button--primary" onClick={choose(onSuggest)}>
          Sugerir canción
        </button>
      </div>
    </Modal>
  );
}
