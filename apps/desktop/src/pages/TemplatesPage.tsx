import { EmptyState, PageHeader } from '@setlist/ui';
import { LayoutTemplate } from 'lucide-react';

export function TemplatesPage() {
  return (
    <>
      <PageHeader title="Plantillas" />
      <EmptyState icon={<LayoutTemplate size={24} />} title="Aún no hay plantillas">
        Guarda un setlist como plantilla para reusarlo en toques parecidos, como un matrimonio o una
        noche de bar.
      </EmptyState>
    </>
  );
}
