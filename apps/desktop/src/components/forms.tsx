import type { ReactNode } from 'react';

export type FieldErrors = Partial<Record<string, string>>;

/**
 * A labelled form field. The error sits outside the <label> so it isn't read as part of the
 * field's name; the input should reference it with `aria-describedby={errorId(id)}`.
 */
export function Field({
  id,
  label,
  error,
  wide = false,
  children,
}: {
  id: string;
  label: string;
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
      {error && (
        <span className="sm-field__error" id={errorId(id)}>
          {error}
        </span>
      )}
    </div>
  );
}

export const errorId = (id: string) => `${id}-error`;

/** Props that connect an input to its Field: id, styling and error announcements. */
export function inputProps(id: string, error: string | undefined) {
  return {
    id,
    className: 'sm-input',
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId(id) : undefined,
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
