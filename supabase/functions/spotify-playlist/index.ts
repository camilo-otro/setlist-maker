// Supabase Edge Function entry point (Deno). The work is in playlist.ts.
import { createPlaylistHandler } from './playlist.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');

Deno.serve(
  createPlaylistHandler({
    // Both are set by Supabase in every function.
    supabaseUrl: Deno.env.get('SUPABASE_URL')!,
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    // Without the secrets, every action answers that Spotify isn't connected.
    spotify: clientId && clientSecret ? { clientId, clientSecret } : null,
    log: (message) => console.warn(message),
  }),
);
