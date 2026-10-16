// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {}

  interface ImportMetaEnv {
    readonly NEXT_PUBLIC_SUPABASE_URL?: string;
    readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
