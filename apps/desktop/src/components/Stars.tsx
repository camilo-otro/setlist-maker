import { Star } from 'lucide-react';

/** 1 to 5 stars to pick from. Clicking the current rating again clears it. */
export function Stars({
  label,
  value,
  onChange,
  disabled,
}: {
  /** What's being rated, for screen readers: "Calificación de Basurita". */
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="stars" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={value !== null && n <= value ? 'stars__star stars__star--on' : 'stars__star'}
          aria-label={n === 1 ? '1 estrella' : `${n} estrellas`}
          aria-pressed={value === n}
          disabled={disabled}
          onClick={() => onChange(value === n ? null : n)}
        >
          <Star size={18} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
