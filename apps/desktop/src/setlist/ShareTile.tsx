import type { ReactNode } from 'react';

/** One way to get the setlist out: a large icon over a short label, easy to hit on a phone. */
export function ShareTile({
  icon,
  label,
  title,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="share-tile"
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
