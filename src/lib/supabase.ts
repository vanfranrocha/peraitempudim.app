import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

function requireEnv(value: string | undefined, name: string) {
  if (!value || !value.trim()) {
    throw new Error(`Configuração ausente: ${name}. Defina essa variável de ambiente antes de iniciar ou publicar o app.`)
  }
  return value
}

export const supabase = createClient(
  requireEnv(supabaseUrl, 'VITE_SUPABASE_URL'),
  requireEnv(supabasePublishableKey, 'VITE_SUPABASE_PUBLISHABLE_KEY'),
)
