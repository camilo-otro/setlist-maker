import { EmptyState, PageHeader } from '@setlist/ui';
import { LayoutTemplate } from 'lucide-react';

export function TemplatesPage() {
  return (
    <>
      <PageHeader title="Templates" />
      <EmptyState icon={<LayoutTemplate size={24} />} title="No templates yet">
        Save a setlist as a template to reuse it for similar gigs, like a wedding or a bar night.
      </EmptyState>
    </>
  );
}
