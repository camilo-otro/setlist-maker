export function AppTitle({ subtitle }: { subtitle?: string }) {
  return (
    <header>
      <h1>Setlist Maker</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}
