
interface ImportMetaEnv {
  readonly VITE_RESEARCH_MODE?: string
  readonly VITE_API_URL?: string
  readonly VITE_PROXY_TARGET?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_RECAPTCHA_SITE_KEY?: string
  readonly VITE_RECAPTCHA_SIGNUP_SITE_KEY?: string
  readonly PROD?: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

