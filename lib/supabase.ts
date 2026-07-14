// Use the CJS build because the current ESM build ships a non-literal dynamic
// import for optional tracing that Hermes rejects during production bundling.
import { createClient } from '@supabase/supabase-js/dist/index.cjs';
import { AppState } from 'react-native';
import 'react-native-url-polyfill/auto';
import { supabaseAuthStorage } from './supabaseStorage';

export const supabaseUrl = 'https://vjfteiuxsdqdozhljxhd.supabase.co';
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZnRlaXV4c2RxZG96aGxqeGhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4NDI2MjAsImV4cCI6MjA4MzQxODYyMH0.4J-9ZlPRZ8j9RZT3OqoO-5jY-xTVtT61IHb9ktymLO8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: supabaseAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

AppState.addEventListener('change', (state) => {
    if (state === 'active') {
        supabase.auth.startAutoRefresh();
    } else {
        supabase.auth.stopAutoRefresh();
    }
});
