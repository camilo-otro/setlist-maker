/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://abcdefghijklmnopqrst.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable key: public by design; signed out it can only read shared setlists. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** The web app, for joining from an invite. Defaults to the site's root. */
  readonly VITE_APP_URL?: string;
}
