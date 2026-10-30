import type { ReactNode } from 'react';

export type FieldErrors = Partial<Record<string, string>>;

/**
 * A labelled form field. The hint and error sit outside the <label> so they aren't read as part of
 * the field's name; the input references them through `inputProps` (`aria-describedby`).
 */
export function Field({
  id,
  label,
  hint,
  error,
  wide = false,
  children,
}: {
  id: string;
  label: string;
  /** A line under the field, such as what saving it does. */
  hint?: string;
  error?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`sm-field${wide ? ' form-grid__wide' : ''}`}>
      <label className="sm-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && (
        <span className="sm-field__hint muted" id={hintId(id)}>
          {hint}
        </span>
      )}
      {error && (
        <span className="sm-field__error" id={errorId(id)}>
          {error}
        </span>
      )}
    </div>
  );
}

export const errorId = (id: string) => `${id}-error`;
export const hintId = (id: string) => `${id}-hint`;

/** Props that connect an input to its Field: id, styling, and its hint and error announced. */
export function inputProps(id: string, error: string | undefined, hint?: string) {
  const describedBy = [hint && hintId(id), error && errorId(id)].filter(Boolean).join(' ');
  return {
    id,
    className: 'sm-input',
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  } as const;
}

/**
 * Field errors for a validation error thrown by the repository (a ZodError), using `messages` for
 * friendlier wording where given. Returns null for any other error.
 */
export function validationErrors(error: unknown, messages: FieldErrors = {}): FieldErrors | null {
  if (!(error instanceof Error) || error.name !== 'ZodError' || !('issues' in error)) return null;
  const errors: FieldErrors = {};
  for (const issue of error.issues as { path: PropertyKey[]; message: string }[]) {
    const field = String(issue.path[0] ?? '');
    errors[field] ??= messages[field] ?? issue.message;
  }
  return errors;
}
