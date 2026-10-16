import { EmptyState, PageHeader } from '@setlist/ui';
import { Library } from 'lucide-react';

export function LibraryPage() {
  return (
    <>
      <PageHeader title="Library" />
      <EmptyState icon={<Library size={24} />} title="No songs yet">
        Add the songs your band plays. You&apos;ll be able to search Spotify or add them by hand.
      </EmptyState>
    </>
  );
}
