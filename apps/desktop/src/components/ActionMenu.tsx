import { Ellipsis } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

export interface ActionMenuItem {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

/**
 * A "⋯" button that opens a short list of less frequent actions. Arrow keys move between them,
 * Escape or a click outside closes it, and choosing one closes it before running it.
 */
export function ActionMenu({ label, items }: { label: string; items: readonly ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  // Which edge of the button the list lines up with: its right edge unless that would push the
  // list off the left of the screen, as on a phone, where the button sits on the left.
  const [align, setAlign] = useState<'start' | 'end'>('end');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const list = root.current?.querySelector<HTMLElement>('[role="menu"]');
    const button = trigger.current?.getBoundingClientRect();
    if (list && button) setAlign(button.right - list.offsetWidth < 8 ? 'start' : 'end');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    const entries = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'ArrowDown'
        ? (at + 1) % entries.length
        : event.key === 'ArrowUp'
          ? (at - 1 + entries.length) % entries.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? entries.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    entries[next]?.focus();
  }

  return (
    <div className="action-menu" ref={root} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        className="sm-button action-menu__trigger"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((shown) => !shown)}
      >
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`action-menu__list action-menu__list--${align}`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="action-menu__item"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
