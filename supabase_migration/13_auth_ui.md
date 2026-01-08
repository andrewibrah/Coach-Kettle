# Auth UI Implementation

## Overview
Implemented a full authentication UI for EasyWorkouts using Supabase Auth, supporting Email/Password, Apple, and Google Sign-In.

## Changes
1.  **Dependencies**: Installed `@supabase/supabase-js`, `expo-auth-session`, `expo-crypto`, `expo-web-browser`, `react-native-url-polyfill`.
2.  **Supabase Client**: Initialized in `lib/supabase.ts` with provided keys and `AsyncStorage` persistence.
3.  **Auth Provider**: Created `components/AuthProvider.tsx` to manage session state globally.
4.  **Layout**: Updated `app/_layout.tsx` to wrap the app in `AuthProvider` and add `auth` stack.
5.  **Screens**:
    *   `app/auth/sign-in.tsx`: Login screen with OAuth options.
    *   `app/auth/sign-up.tsx`: Registration screen with OAuth options.
    *   `app/auth/_layout.tsx`: Auth stack navigator.

## Configuration Requirements (Manual Steps)

### 1. Supabase Dashboard Configuration
You must configure the OAuth providers in the Supabase Dashboard.

**Redirect URL:**
You must add the following Redirect URL to your Supabase Project -> Authentication -> URL Configuration -> Redirect URLs:
`easyworkouts://auth/callback`
(Also `easyworkouts://` might be needed depending on the exact Expo flow).

**Google Provider:**
1.  Go to Supabase -> Authentication -> Providers -> Google.
2.  Enable "Google".
3.  Enter your "Client ID" and "Client Secret" from Google Cloud Console.
4.  For redirect mechanism, ensure "Skip nonce checks" might be needed if using implicit flow, but we are using PKCE flow via `expo-web-browser`.

**Apple Provider:**
1.  Go to Supabase -> Authentication -> Providers -> Apple.
2.  Enable "Apple".
3.  Enter "Service ID", "Team ID", "Key ID", "Private Key".

### 2. Expo Configuration
Ensure `app.json` has the correct scheme (checked: `easyworkouts`).

### 3. iOS/Android Configuration
For production, you need to configure `GoogleService-Info.plist` or Android App Links if using Native login.
This implementation uses the robust "Browser" based OAuth flow (`WebBrowser.openAuthSessionAsync`), which works in Expo Go and builds without native modules configuration for specific providers, provided the Deep Link scheme is set up.

## Unknowns / Action Items
-   **Verification**: Test the OAuth flow on a real device. The `WebBrowser` redirect back to the app relies on the `scheme` being correctly registered in the OS.
-   **PKCE Exchange**: The implementation in `sign-in.tsx` handles the `code` exchange manually if it appears in the URL. If Supabase JS client updates handle this automatically, it might double-fire, but the manual check is safer for `skipBrowserRedirect: true`.

## Pending Supabase Console Configuration
- Add redirect URL: `easyworkouts://auth/callback` under Authentication -> URL Configuration -> Redirect URLs. (Also consider `easyworkouts://` if needed for Expo deep links.)
- Enable Google provider and set Client ID / Client Secret (not available in repo; required from Google Cloud Console).
- Enable Apple provider and set Service ID, Team ID, Key ID, and Private Key (not available in repo; required from Apple developer account).
- Without these provider credentials, OAuth will not function; obtain secrets and configure in Supabase dashboard.

## Navigation Flow
-   **Entry**: Navigate to `/auth/sign-in` (or use a Link).
-   **Success**: Redirects to `/(tabs)`.
-   **Session**: `AuthProvider` listens to auth state changes and persists session in AsyncStorage.
# Auth UI Update
- Added app/auth/callback.tsx for OAuth redirects.
- Fixed typed routes issues in sign-in.tsx and sign-up.tsx.
- Protected (tabs) layout with Auth check.
