import { SCHEMA_VERSION } from '@setlist/core';
import { AppTitle } from '@setlist/ui';

export function App() {
  return (
    <main>
      <AppTitle subtitle={`Data model v${SCHEMA_VERSION}`} />
    </main>
  );
}
