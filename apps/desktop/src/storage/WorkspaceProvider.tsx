import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { openWorkspace, type Workspace } from './workspace';

type State =
  | { status: 'loading' }
  | { status: 'ready'; workspace: Workspace }
  | { status: 'error'; error: unknown };

const WorkspaceContext = createContext<Workspace | null>(null);

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
  return <WorkspaceContext.Provider value={state.workspace}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): Workspace {
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
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}
