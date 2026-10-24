import {
  formatDate,
  orderSuggestions,
  summaryOf,
  votersIn,
  type Suggestion,
  type SuggestionStatus,
} from '@setlist/core';
import { EmptyState, PageHeader } from '@setlist/ui';
import { Lightbulb, MessageCircle, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { LibraryTabs } from '../library/LibraryTabs';
import { useMembership } from '../sharing/MembershipProvider';
import { useSync } from '../sharing/SyncProvider';
import { useBandRows } from '../storage/useBandRows';
import { averageLabel } from './format';
import { SuggestDialog } from './SuggestDialog';
import { SuggestionDetail } from './SuggestionDetail';
import { useSuggestions } from './useSuggestions';

const FILTERS: { status: SuggestionStatus; label: string }[] = [
  { status: 'open', label: 'Abiertas' },
  { status: 'accepted', label: 'Agregadas' },
  { status: 'archived', label: 'Archivadas' },
];

/**
 * Sugerencias (#89): songs owners and editors propose for the repertorio, to hear, vote on and
 * discuss, then add or archive. Open ones waiting for your vote come first. Inside Repertorio,
 * next to the band's songs.
 */
export function SuggestionsPage() {
  const { suggestions, comments, summaries, awaiting, error, reload } = useSuggestions();
  const songs = useBandRows('songs');
  const { canEdit, me, members } = useMembership();
  const shared = useSync()?.shared ?? false;
  const [filter, setFilter] = useState<SuggestionStatus>('open');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  // Canciones sends here to suggest a song (#89): the dialog opens straight away.
  const location = useLocation();
  const navigate = useNavigate();
  const sentToSuggest = (location.state as { suggest?: boolean } | null)?.suggest === true;
  const [suggesting, setSuggesting] = useState(sentToSuggest);
  useEffect(() => {
    // Once is enough: going back or reloading shouldn't open it again.
    if (sentToSuggest) void navigate(location.pathname, { replace: true, state: null });
  }, [sentToSuggest, navigate, location.pathname]);

  const live = useMemo(() => (suggestions ?? []).filter((s) => !s.deletedAt), [suggestions]);
  const visible = useMemo(
    () =>
      orderSuggestions(
        live.filter((s) => s.status === filter),
        summaries,
      ),
    [live, filter, summaries],
  );
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const commentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of comments ?? []) {
      if (!c.deletedAt) counts.set(c.suggestionId, (counts.get(c.suggestionId) ?? 0) + 1);
    }
    return counts;
  }, [comments]);
  const selected = live.find((s) => s.id === selectedId);
  const canSuggest = shared && canEdit && me !== null;

  const header = (
    <>
      <PageHeader
        title="Repertorio"
        actions={
          canSuggest ? (
            <button
              type="button"
              className="sm-button sm-button--primary"
              onClick={() => setSuggesting(true)}
            >
              <Plus size={16} aria-hidden="true" />
              Sugerir canción
            </button>
          ) : undefined
        }
      />
      <LibraryTabs awaiting={awaiting} />
    </>
  );

  if (!shared) {
    return (
      <>
        {header}
        <EmptyState icon={<Lightbulb size={24} />} title="Sugerencias en banda">
          Aquí la banda propone canciones nuevas, las escucha, vota y comenta antes de agregarlas al
          repertorio. Comparte la banda desde Banda para empezar.
        </EmptyState>
      </>
    );
  }
  if (error) {
    return (
      <>
        {header}
        <p className="sm-field__error" role="alert">
          No se pudieron cargar las sugerencias: {String(error)}
        </p>
      </>
    );
  }
  if (suggestions === null) {
    return (
      <>
        {header}
        <p className="muted">Cargando sugerencias…</p>
      </>
    );
  }

  const count = (status: SuggestionStatus) => live.filter((s) => s.status === status).length;

  return (
    <>
      {header}
      <div className={selected ? 'library-layout library-layout--detail' : 'library-layout'}>
        <div className="library-layout__main">
          <div className="suggestion-filters" role="group" aria-label="Mostrar">
            {FILTERS.map(({ status, label }) => (
              <button
                key={status}
                type="button"
                className="chip"
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
              >
                {label} <span className="chip__count">{count(status)}</span>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="muted suggestion-list__empty">
              {filter === 'open'
                ? canSuggest
                  ? 'No hay sugerencias abiertas. Propón una con Sugerir canción.'
                  : 'No hay sugerencias abiertas.'
                : filter === 'accepted'
                  ? 'Aún no se ha agregado ninguna sugerencia al repertorio.'
                  : 'No hay sugerencias archivadas.'}
            </p>
          ) : (
            <ul className="suggestion-list" aria-label="Sugerencias">
              {visible.map((s) => (
                <SuggestionRow
                  key={s.id}
                  suggestion={s}
                  label={averageLabel(summaryOf(summaries, s.id))}
                  waiting={
                    canEdit &&
                    me !== null &&
                    s.status === 'open' &&
                    summaryOf(summaries, s.id).mine === null
                  }
                  mine={summaryOf(summaries, s.id).mine}
                  comments={commentCounts.get(s.id) ?? 0}
                  by={membersById.get(s.suggestedBy)?.displayName ?? null}
                  selected={s.id === selectedId}
                  onOpen={() => setSelectedId(s.id)}
                />
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <SuggestionDetail
            key={selected.id}
            suggestion={selected}
            summary={summaryOf(summaries, selected.id)}
            comments={(comments ?? []).filter((c) => c.suggestionId === selected.id)}
            membersById={membersById}
            me={me}
            canEdit={canEdit}
            voters={votersIn(members)}
            song={songs.rows?.find((song) => song.id === selected.songId)}
            onChanged={() => {
              reload();
              songs.reload();
            }}
            onClose={() => setSelectedId(undefined)}
          />
        )}
      </div>

      {suggesting && me && (
        <SuggestDialog
          memberId={me.id}
          songs={songs.rows ?? []}
          suggestions={live}
          onClose={() => setSuggesting(false)}
          onSuggested={(suggestion) => {
            reload();
            setFilter('open');
            setSelectedId(suggestion.id);
          }}
        />
      )}
    </>
  );
}

function SuggestionRow({
  suggestion,
  label,
  waiting,
  mine,
  comments,
  by,
  selected,
  onOpen,
}: {
  suggestion: Suggestion;
  label: string;
  waiting: boolean;
  mine: number | null;
  comments: number;
  by: string | null;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={selected ? 'suggestion-row suggestion-row--selected' : 'suggestion-row'}
        aria-current={selected ? 'true' : undefined}
        onClick={onOpen}
      >
        <span className="suggestion-row__main">
          <span className="suggestion-row__title">{suggestion.title}</span>
          <span className="muted suggestion-row__meta">
            {[
              suggestion.artist,
              by && `de ${by}`,
              formatDate(new Date(suggestion.createdAt), 'short'),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className="suggestion-row__side">
          <span className="suggestion-row__rating">{label}</span>
          {waiting ? (
            <span className="badge">Falta tu voto</span>
          ) : mine !== null ? (
            <span className="muted suggestion-row__mine">Tu voto: {mine}★</span>
          ) : null}
          {comments > 0 && (
            <span
              className="muted suggestion-row__comments"
              aria-label={comments === 1 ? '1 comentario' : `${comments} comentarios`}
            >
              <MessageCircle size={14} aria-hidden="true" />
              {comments}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
