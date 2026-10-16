import { EmptyState, PageHeader } from '@setlist/ui';
import { CalendarDays } from 'lucide-react';

export function GigsPage() {
  return (
    <>
      <PageHeader title="Gigs" />
      <EmptyState icon={<CalendarDays size={24} />} title="No gigs planned">
        Create a gig to start building its setlist, or copy one from a past gig.
      </EmptyState>
    </>
  );
}
