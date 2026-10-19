// Supabase Edge Function entry point (Deno). The search itself is in search.ts.
import { createSearchHandler } from './search.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');

Deno.serve(
  createSearchHandler({
    // Both are set by Supabase in every function.
    supabaseUrl: Deno.env.get('SUPABASE_URL')!,
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    // Without the secrets, search still works from the catalog alone.
    spotify: clientId && clientSecret ? { clientId, clientSecret } : null,
    log: (message) => console.warn(message),
  }),
);
