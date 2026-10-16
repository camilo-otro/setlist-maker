import { EmptyState, PageHeader } from '@setlist/ui';
import { ChartColumn } from 'lucide-react';

export function StatsPage() {
  return (
    <>
      <PageHeader title="Stats" />
      <EmptyState icon={<ChartColumn size={24} />} title="Nothing to show yet">
        Stats appear once you&apos;ve marked gigs as played: most and least played songs, and what
        you haven&apos;t played in a while.
      </EmptyState>
    </>
  );
}
