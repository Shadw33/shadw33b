import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create a fallback dummy client if Supabase is not configured
// This allows the app to load without Supabase (auth features will be disabled)
const createSupabaseClient = () => {
  console.log('[Supabase] Environment check:');
  console.log('  URL:', supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'Missing');
  console.log('  Anon Key:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : 'Missing');
  
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder') || supabaseAnonKey.includes('placeholder')) {
    console.warn('[Supabase] Missing or placeholder environment variables. Auth features will be disabled.');
    // Return a dummy client that won't crash on calls
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }
  return createClient(supabaseUrl, supabaseAnonKey);
};

export const supabase = createSupabaseClient();

// Helper to check if Supabase is properly configured
export const isSupabaseConfigured = () => {
  return !!(supabaseUrl && supabaseAnonKey);
};

