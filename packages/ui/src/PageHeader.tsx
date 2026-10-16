import type { ReactNode } from 'react';

/** Title row at the top of a page, with optional actions on the right. */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="sm-page-header">
      <h1 className="sm-page-header__title">{title}</h1>
      {actions && <div className="sm-page-header__actions">{actions}</div>}
    </header>
  );
}
