/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://abcdefghijklmnopqrst.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable (anon) key: public by design, read-only access to the catalog. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
