import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  applyTheme,
  readThemePreference,
  saveThemePreference,
  type ThemePreference,
} from '../theme';

const OPTIONS = [
  { value: 'system', label: 'Igual que el sistema', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
] as const satisfies readonly { value: ThemePreference; label: string; icon: unknown }[];

const storage = () => (typeof localStorage === 'undefined' ? undefined : localStorage);

export function ThemeSwitcher() {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    readThemePreference(storage()),
  );

  useEffect(() => {
    applyTheme(preference, document.documentElement);
    saveThemePreference(storage(), preference);
  }, [preference]);

  return (
    <div className="theme-switcher" role="radiogroup" aria-label="Tema">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          aria-label={label}
          title={label}
          className="theme-switcher__option"
          onClick={() => setPreference(value)}
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
