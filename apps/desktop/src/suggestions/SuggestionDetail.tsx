import {
  formatClock,
  formatDate,
  formatDuration,
  type BandMember,
  type Song,
  type Suggestion,
  type SuggestionComment,
  type VoteSummary,
} from '@setlist/core';
import { addSuggestionToRepertorio, castVote } from '@setlist/storage';
import { Archive, ExternalLink, ListPlus, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Stars } from '../components/Stars';
import { SpotifyLink } from '../components/SpotifyLink';
import { useWorkspace } from '../storage/WorkspaceProvider';
import { averageLabel } from './format';

const when = (timestamp: string) => {
  const date = new Date(timestamp);
  return `${formatDate(date, 'short')}, ${formatClock(date)}`;
};

/**
 * One suggestion (#89): where to hear it, how it's rated, the band's comments, and, for owners
 * and editors, their own vote and adding it to the repertorio or archiving it. Votes show only
 * as an average and a count: the app never says who voted what.
 */
export function SuggestionDetail({
  suggestion,
  summary,
  comments,
  membersById,
  me,
  canEdit,
  song,
  onChanged,
  onClose,
}: {
  suggestion: Suggestion;
  summary: VoteSummary;
  comments: readonly SuggestionComment[];
  membersById: ReadonlyMap<string, BandMember>;
  /** This device's member; null for viewers' devices before members sync, and solo bands. */
  me: BandMember | null;
  canEdit: boolean;
  /** The song it became, once added. */
  song: Song | undefined;
  onChanged: () => void;
  onClose: () => void;
}) {
  const { repository } = useWorkspace();
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const canTakePart = canEdit && me !== null;
  const open = suggestion.status === 'open';
  const nameOf = (memberId: string) =>
    membersById.get(memberId)?.displayName ?? 'Alguien que ya no está en la banda';

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setFailure(null);
    try {
      await work();
      onChanged();
    } catch (error) {
      setFailure(String(error));
    } finally {
      setBusy(false);
    }
  }

  const vote = (stars: number | null) =>
    run(() =>
      castVote(repository, {
        bandId: suggestion.bandId,
        suggestionId: suggestion.id,
        memberId: me!.id,
        stars,
      }),
    );

  async function comment(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    await run(() =>
      repository.suggestionComments.create({
        bandId: suggestion.bandId,
        suggestionId: suggestion.id,
        memberId: me!.id,
        body,
      }),
    );
    setDraft('');
  }

  const thread = comments
    .filter((c) => !c.deletedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <aside
      className="song-detail suggestion-detail"
      aria-labelledby="suggestion-detail-title"
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
    >
      <header className="song-detail__header">
        <div>
          <h2 id="suggestion-detail-title" className="song-detail__title">
            {suggestion.title}
          </h2>
          <p className="song-detail__subtitle">
            {suggestion.artist ?? <span className="muted">Sin artista</span>}
            {suggestion.durationSec !== null && ` · ${formatDuration(suggestion.durationSec)}`}
          </p>
        </div>
        <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <p className="muted suggestion-detail__by">
        Sugerida por {nameOf(suggestion.suggestedBy)} el{' '}
        {formatDate(new Date(suggestion.createdAt))}
      </p>
      {suggestion.note && <p className="song-detail__notes">{suggestion.note}</p>}

      {(suggestion.spotifyId || suggestion.youtubeId) && (
        <div className="suggestion-detail__links">
          {suggestion.spotifyId && (
            <SpotifyLink spotifyId={suggestion.spotifyId} title={suggestion.title} />
          )}
          {suggestion.youtubeId && (
            <a
              className="spotify-link"
              href={`https://www.youtube.com/watch?v=${suggestion.youtubeId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir en YouTube
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      <section className="song-detail__section" aria-label="Votación">
        <h3>Votación</h3>
        <p className="suggestion-detail__rating">{averageLabel(summary)}</p>
        {canTakePart && open && (
          <div className="suggestion-detail__my-vote">
            <span>Tu voto</span>
            <Stars
              label={`Tu voto para ${suggestion.title}`}
              value={summary.mine}
              disabled={busy}
              onChange={(stars) => void vote(stars)}
            />
          </div>
        )}
        {canTakePart && !open && summary.mine !== null && (
          <p className="muted">
            Tu voto: {summary.mine} {summary.mine === 1 ? 'estrella' : 'estrellas'}
          </p>
        )}
      </section>

      <section className="song-detail__section" aria-label="Comentarios">
        <h3>Comentarios{thread.length > 0 && ` (${thread.length})`}</h3>
        {thread.length === 0 && <p className="muted">Aún no hay comentarios.</p>}
        <ul className="comments">
          {thread.map((c) => {
            const mine = me !== null && c.memberId === me.id;
            const isEditing = editing?.id === c.id;
            return (
              <li key={c.id} className="comment">
                <p className="comment__meta">
                  <strong>{nameOf(c.memberId)}</strong>
                  <span className="muted"> · {when(c.createdAt)}</span>
                  {c.version > 1 && <span className="muted"> · editado</span>}
                </p>
                {isEditing ? (
                  <form
                    className="comment__form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const body = editing.body.trim();
                      if (!body) return;
                      void run(() => repository.suggestionComments.update(c.id, { body })).then(
                        () => setEditing(null),
                      );
                    }}
                  >
                    <textarea
                      className="sm-input"
                      aria-label="Editar tu comentario"
                      rows={2}
                      maxLength={2000}
                      value={editing.body}
                      onChange={(e) => setEditing({ id: c.id, body: e.target.value })}
                    />
                    <div className="comment__actions">
                      <button type="button" className="sm-button" onClick={() => setEditing(null)}>
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="sm-button sm-button--primary"
                        disabled={busy}
                      >
                        Guardar
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="comment__body">{c.body}</p>
                )}
                {mine && canEdit && !isEditing && (
                  <div className="comment__actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Editar tu comentario"
                      onClick={() => setEditing({ id: c.id, body: c.body })}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Eliminar tu comentario"
                      disabled={busy}
                      onClick={() => void run(() => repository.suggestionComments.remove(c.id))}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {canTakePart && (
          <form className="comment__form" onSubmit={(event) => void comment(event)}>
            <textarea
              className="sm-input"
              aria-label="Escribe un comentario"
              placeholder="Escribe un comentario"
              rows={2}
              maxLength={2000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="comment__actions">
              <button
                type="submit"
                className="sm-button"
                disabled={busy || draft.trim().length === 0}
              >
                Comentar
              </button>
            </div>
          </form>
        )}
      </section>

      {failure && (
        <p className="sm-field__error" role="alert">
          No se pudo guardar: {failure}
        </p>
      )}

      {suggestion.status === 'accepted' && (
        <p className="muted" role="status">
          Está en el repertorio{song ? ` como «${song.title}»` : ''}.
        </p>
      )}
      {suggestion.status === 'archived' && (
        <p className="muted" role="status">
          Archivada.
        </p>
      )}
      {canEdit && (
        <div className="suggestion-detail__decide">
          {open && (
            <>
              <button
                type="button"
                className="sm-button sm-button--primary"
                disabled={busy}
                onClick={() => void run(() => addSuggestionToRepertorio(repository, suggestion.id))}
              >
                <ListPlus size={16} aria-hidden="true" />
                Agregar al repertorio
              </button>
              <button
                type="button"
                className="sm-button"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    repository.suggestions.update(suggestion.id, { status: 'archived' }),
                  )
                }
              >
                <Archive size={16} aria-hidden="true" />
                Archivar
              </button>
            </>
          )}
          {suggestion.status === 'archived' && (
            <button
              type="button"
              className="sm-button"
              disabled={busy}
              onClick={() =>
                void run(() => repository.suggestions.update(suggestion.id, { status: 'open' }))
              }
            >
              <RotateCcw size={16} aria-hidden="true" />
              Reabrir
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
