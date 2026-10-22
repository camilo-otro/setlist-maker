import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { openWorkspace, type Workspace } from './workspace';

type State =
  | { status: 'loading' }
  | { status: 'ready'; workspace: Workspace }
  | { status: 'error'; error: unknown };

/** The open workspace, plus the few changes that affect the whole app. */
export interface WorkspaceValue extends Workspace {
  /** Renames the band everywhere in the app; shared bands upload the new name with other changes. */
  renameBand(name: string): Promise<void>;
  /** Goes up whenever changes from other devices are applied; screens re-load when it changes. */
  dataVersion: number;
  /** Tells every screen that data changed outside it (another device, or the band page), so they re-load. */
  notifyRemoteChanges(): void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/** Keeps the band in state, so a rename shows up on every screen at once. */
function ProvideWorkspace({ workspace, children }: { workspace: Workspace; children: ReactNode }) {
  const [band, setBand] = useState(workspace.band);
  const [dataVersion, setDataVersion] = useState(0);
  const { repository } = workspace;
  const bandId = workspace.band.id;

  // Stable functions: effects that depend on them (like the sync scheduler's) must not re-run
  // every time the data changes.
  const renameBand = useCallback(
    async (name: string) => setBand(await repository.bands.update(bandId, { name })),
    [repository, bandId],
  );
  const notifyRemoteChanges = useCallback(() => {
    setDataVersion((n) => n + 1);
    // The band itself may have been renamed on another device.
    void repository.bands.get(bandId).then((latest) => latest && setBand(latest));
  }, [repository, bandId]);

  const value = useMemo<WorkspaceValue>(
    () => ({ ...workspace, band, renameBand, dataVersion, notifyRemoteChanges }),
    [workspace, band, renameBand, dataVersion, notifyRemoteChanges],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/** Opens storage before showing the app, with a loading screen and a readable error screen. */
export function WorkspaceProvider({
  children,
  open = openWorkspace,
}: {
  children: ReactNode;
  open?: () => Promise<Workspace>;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    open().then(
      (workspace) => current && setState({ status: 'ready', workspace }),
      (error: unknown) => current && setState({ status: 'error', error }),
    );
    return () => {
      current = false;
    };
  }, [open]);

  if (state.status === 'loading') {
    return <p className="app-status">Abriendo tu repertorio…</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="app-status" role="alert">
        <h1>Setlist Maker no pudo abrir sus datos</h1>
        <p>Reinicia la app. Si sigue pasando, incluye este mensaje cuando lo reportes:</p>
        <pre>{String(state.error)}</pre>
      </div>
    );
  }
  return <ProvideWorkspace workspace={state.workspace}>{children}</ProvideWorkspace>;
}

export function useWorkspace(): WorkspaceValue {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return workspace;
}

/** For tests and previews: provides a workspace that's already open. */
export function WorkspaceContextProvider({
  workspace,
  children,
}: {
  workspace: Workspace;
  children: ReactNode;
}) {
  return <ProvideWorkspace workspace={workspace}>{children}</ProvideWorkspace>;
}
