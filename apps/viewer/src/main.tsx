import { createSharedSetlistClient, previewInvite } from '@setlist/storage';
import '@setlist/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './viewer.css';
import { Invitation } from './Invitation';
import { Viewer, type LoadSetlist } from './Viewer';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const client = url && key ? createSharedSetlistClient({ url, key }) : null;
const load: LoadSetlist = (token) =>
  client
    ? client.get(token)
    : Promise.reject(new Error('The viewer is missing its Supabase settings'));

const loadInvite = (token: string) =>
  url && key
    ? previewInvite({ url, key }, token)
    : Promise.reject(new Error('The viewer is missing its Supabase settings'));

/**
 * The link's token is the URL fragment: setlist.rockthehouse.app/viewer/#<token> for a shared
 * setlist,
 * #join=<token> for a band invite. Browsers never send fragments to the server, so tokens don't
 * end up in any host's logs.
 */
const fragment = () => decodeURIComponent(location.hash.slice(1));

function App() {
  const hash = fragment();
  if (hash.startsWith('join=')) {
    return (
      <Invitation
        token={hash.slice(5)}
        link={location.href}
        load={loadInvite}
        appUrl={import.meta.env.VITE_APP_URL || undefined}
      />
    );
  }
  return <Viewer token={hash || null} load={load} />;
}

window.addEventListener('hashchange', () => location.reload());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
