import {
  countdownLabel,
  daysBetween,
  formatDate,
  formatMonth,
  formatTime,
  formatWeekday,
  groupByYear,
  localDate,
  localDateString,
  splitGigs,
  type Gig,
  type Venue,
} from '@setlist/core';
import { EmptyState, PageHeader } from '@setlist/ui';
import { CalendarDays, Clock, MapPin, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { GigDialog } from '../gigs/GigDialog';
import { useBandRows } from '../storage/useBandRows';
import { useMembership } from '../sharing/MembershipProvider';

type Tab = 'upcoming' | 'past';

function GigRow({
  gig,
  venue,
  today,
  onOpen,
}: {
  gig: Gig;
  venue: Venue | undefined;
  today: string;
  onOpen: () => void;
}) {
  const date = localDate(gig.date);
  const times = [
    gig.loadInTime && `Montaje ${formatTime(gig.loadInTime)}`,
    gig.startTime && `Inicio ${formatTime(gig.startTime)}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const days = daysBetween(today, gig.date);

  return (
    <li>
      <button
        type="button"
        className={gig.status === 'cancelled' ? 'gig-row gig-row--cancelled' : 'gig-row'}
        onClick={onOpen}
      >
        <span className="gig-row__date" aria-hidden="true">
          <span className="gig-row__weekday">{formatWeekday(date)}</span>
          <span className="gig-row__day">{date.getDate()}</span>
          <span className="gig-row__month">{formatMonth(date)}</span>
        </span>
        <span className="gig-row__main">
          <span className="gig-row__title">{gig.title}</span>
          <span className="gig-row__meta">
            <span className="visually-hidden">{formatDate(gig.date)}, </span>
            {venue && (
              <span>
                <MapPin size={14} aria-hidden="true" />
                {venue.city ? `${venue.name}, ${venue.city}` : venue.name}
              </span>
            )}
            {times && (
              <span>
                <Clock size={14} aria-hidden="true" />
                {times}
              </span>
            )}
          </span>
        </span>
        {gig.status === 'cancelled' ? (
          <span className="status status--retired">Cancelado</span>
        ) : (
          days >= 0 && <span className="status status--active">{countdownLabel(days)}</span>
        )}
      </button>
    </li>
  );
}

export function GigsPage() {
  const gigs = useBandRows('gigs');
  const venues = useBandRows('venues');
  const [tab, setTab] = useState<Tab>('upcoming');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const today = localDateString();

  const { upcoming, past } = useMemo(() => splitGigs(gigs.rows ?? [], today), [gigs.rows, today]);
  const venueById = useMemo(
    () => new Map((venues.rows ?? []).map((v) => [v.id, v])),
    [venues.rows],
  );
  const reloadAll = () => {
    gigs.reload();
    venues.reload();
  };

  const { canEdit } = useMembership();
  const newButton = (
    <button
      type="button"
      className="sm-button sm-button--primary"
      onClick={() => setCreating(true)}
    >
      <Plus size={16} aria-hidden="true" />
      Nuevo toque
    </button>
  );
  const row = (gig: Gig) => (
    <GigRow
      key={gig.id}
      gig={gig}
      venue={gig.venueId ? venueById.get(gig.venueId) : undefined}
      today={today}
      onOpen={() => void navigate(`/gigs/${gig.id}`)}
    />
  );

  let content;
  if (gigs.error) {
    content = (
      <p className="sm-field__error" role="alert">
        No se pudieron cargar los toques: {String(gigs.error)}
      </p>
    );
  } else if (gigs.rows === null) {
    content = <p className="muted">Cargando toques…</p>;
  } else if (gigs.rows.length === 0) {
    content = (
      <>
        <EmptyState icon={<CalendarDays size={24} />} title="No hay toques planeados">
          Crea un toque para empezar a armar su setlist. Cada toque nuevo empieza con un primer set
          vacío.
        </EmptyState>
        {canEdit && <div className="library-empty-action">{newButton}</div>}
      </>
    );
  } else {
    content = (
      <>
        <div className="tabs" role="tablist" aria-label="Toques">
          {(
            [
              ['upcoming', 'Próximos', upcoming.length],
              ['past', 'Pasados', past.length],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`gigs-tab-${value}`}
              aria-selected={tab === value}
              aria-controls="gigs-panel"
              className="tabs__tab"
              onClick={() => setTab(value)}
            >
              {label} <span className="chip__count">{count}</span>
            </button>
          ))}
        </div>
        <div role="tabpanel" id="gigs-panel" aria-labelledby={`gigs-tab-${tab}`}>
          {tab === 'upcoming' ? (
            upcoming.length > 0 ? (
              <ul className="gig-list">{upcoming.map(row)}</ul>
            ) : (
              <p className="muted">
                No hay toques próximos. Crea uno para empezar a planear su setlist.
              </p>
            )
          ) : past.length > 0 ? (
            groupByYear(past).map(({ year, gigs: inYear }) => (
              <section key={year} aria-labelledby={`gigs-year-${year}`}>
                <h2 id={`gigs-year-${year}`} className="gig-year">
                  {year}
                </h2>
                <ul className="gig-list">{inYear.map(row)}</ul>
              </section>
            ))
          ) : (
            <p className="muted">Aún no hay toques pasados.</p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Toques"
        actions={canEdit && gigs.rows && gigs.rows.length > 0 ? newButton : undefined}
      />
      {content}
      {creating && (
        <GigDialog
          gig={null}
          venues={venues.rows ?? []}
          onClose={() => setCreating(false)}
          onChanged={reloadAll}
        />
      )}
    </>
  );
}
