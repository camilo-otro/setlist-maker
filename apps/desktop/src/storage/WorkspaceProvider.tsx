import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  const value = useMemo<WorkspaceValue>(
    () => ({
      ...workspace,
      band,
      renameBand: async (name) =>
        setBand(await workspace.repository.bands.update(band.id, { name })),
      dataVersion,
      notifyRemoteChanges: () => {
        setDataVersion((n) => n + 1);
        // The band itself may have been renamed on another device.
        void workspace.repository.bands.get(band.id).then((latest) => latest && setBand(latest));
      },
    }),
    [workspace, band, dataVersion],
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
    return <p className="app-status">Opening your library…</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="app-status" role="alert">
        <h1>Setlist Maker couldn&apos;t open its data</h1>
        <p>Restart the app. If this keeps happening, include this message when reporting it:</p>
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
