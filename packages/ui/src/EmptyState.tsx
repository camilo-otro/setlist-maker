import type { ReactNode } from 'react';

/** Shown in place of a list that has nothing in it yet: what goes here and how to start. */
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className="sm-empty-state" aria-label={title}>
      {icon && (
        <div className="sm-empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="sm-empty-state__title">{title}</h2>
      {children && <p className="sm-empty-state__body">{children}</p>}
    </section>
  );
}
