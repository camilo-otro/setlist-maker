import {
  countdownLabel,
  daysBetween,
  groupByYear,
  localDateString,
  splitGigs,
  type Gig,
  type Venue,
} from '@setlist/core';
import { EmptyState, PageHeader } from '@setlist/ui';
import { CalendarDays, Clock, MapPin, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { GigDialog } from '../gigs/GigDialog';
import { useBandRows } from '../storage/useBandRows';

type Tab = 'upcoming' | 'past';

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const month = new Intl.DateTimeFormat(undefined, { month: 'short' });
const toDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};

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
  const date = toDate(gig.date);
  const times = [
    gig.loadInTime && `Load-in ${gig.loadInTime}`,
    gig.startTime && `Start ${gig.startTime}`,
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
          <span className="gig-row__weekday">{weekday.format(date)}</span>
          <span className="gig-row__day">{date.getDate()}</span>
          <span className="gig-row__month">{month.format(date)}</span>
        </span>
        <span className="gig-row__main">
          <span className="gig-row__title">{gig.title}</span>
          <span className="gig-row__meta">
            <span className="visually-hidden">{gig.date}, </span>
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
          <span className="status status--retired">Cancelled</span>
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
  /** `undefined`: no dialog; `null`: creating; a gig: editing it. */
  const [editing, setEditing] = useState<Gig | null | undefined>(undefined);
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

  const newButton = (
    <button type="button" className="sm-button sm-button--primary" onClick={() => setEditing(null)}>
      <Plus size={16} aria-hidden="true" />
      New gig
    </button>
  );
  const row = (gig: Gig) => (
    <GigRow
      key={gig.id}
      gig={gig}
      venue={gig.venueId ? venueById.get(gig.venueId) : undefined}
      today={today}
      onOpen={() => setEditing(gig)}
    />
  );

  let content;
  if (gigs.error) {
    content = (
      <p className="sm-field__error" role="alert">
        Couldn&apos;t load gigs: {String(gigs.error)}
      </p>
    );
  } else if (gigs.rows === null) {
    content = <p className="muted">Loading gigs…</p>;
  } else if (gigs.rows.length === 0) {
    content = (
      <>
        <EmptyState icon={<CalendarDays size={24} />} title="No gigs planned">
          Create a gig to start building its setlist. Each new gig starts with an empty first set.
        </EmptyState>
        <div className="library-empty-action">{newButton}</div>
      </>
    );
  } else {
    content = (
      <>
        <div className="tabs" role="tablist" aria-label="Gigs">
          {(
            [
              ['upcoming', 'Upcoming', upcoming.length],
              ['past', 'Past', past.length],
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
              <p className="muted">No upcoming gigs. Create one to start planning its setlist.</p>
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
            <p className="muted">No past gigs yet.</p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Gigs"
        actions={gigs.rows && gigs.rows.length > 0 ? newButton : undefined}
      />
      {content}
      {editing !== undefined && (
        <GigDialog
          key={editing?.id ?? 'new'}
          gig={editing}
          venues={venues.rows ?? []}
          onClose={() => setEditing(undefined)}
          onChanged={reloadAll}
        />
      )}
    </>
  );
}
