import { createSharedSetlistClient } from '@setlist/storage';
import '@setlist/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './viewer.css';
import { Viewer, type LoadSetlist } from './Viewer';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const client = url && key ? createSharedSetlistClient({ url, key }) : null;
const load: LoadSetlist = (token) =>
  client
    ? client.get(token)
    : Promise.reject(new Error('The viewer is missing its Supabase settings'));

/**
 * The link's token is the URL fragment (setlist.rockthehouse.app/#<token>). Browsers never send
 * fragments to the server, so tokens don't end up in any host's logs.
 */
const tokenFromUrl = () => decodeURIComponent(location.hash.slice(1)) || null;

function App() {
  return <Viewer token={tokenFromUrl()} load={load} />;
}

window.addEventListener('hashchange', () => location.reload());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
