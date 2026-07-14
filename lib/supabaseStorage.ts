// TypeScript's Node-style resolver needs a base module while Expo resolves the
// platform-specific `.native` and `.web` implementations at bundle time.
export { supabaseAuthStorage } from './supabaseStorage.native';
