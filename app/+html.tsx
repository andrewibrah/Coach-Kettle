// Web-only HTML shell for Expo Router static rendering.
//
// Kills the theme flash (FOUC): a returning dark-mode user would otherwise see a
// white page for a beat before the JS bundle + ThemeProvider resolve. The inline
// script below runs BEFORE first paint, reads the persisted preference
// (`app_theme_mode`, written by ThemeProvider via AsyncStorage → localStorage),
// resolves it against the OS, and paints the correct background + `color-scheme`
// immediately. This mirrors section 4 of the theming-system-guide.

import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

const LIGHT_BG = '#ffffff';
const DARK_BG = '#151718';

const themeGuard = `
(function () {
  try {
    var p = localStorage.getItem('app_theme_mode') || 'system';
    var dark = p === 'dark' ||
      (p === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var bg = dark ? '${DARK_BG}' : '${LIGHT_BG}';
    var root = document.documentElement;
    root.style.backgroundColor = bg;
    root.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`;

// Keep the body background in sync with the pre-paint guard so overscroll and
// the area behind the React root never flash the wrong color.
const baseStyles = `
html, body { background-color: ${LIGHT_BG}; }
@media (prefers-color-scheme: dark) { html, body { background-color: ${DARK_BG}; } }
#root { display: flex; min-height: 100%; }
html, body, #root { height: 100%; }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        {/* Pre-paint theme guard — must run before the stylesheet/app mounts. */}
        <script dangerouslySetInnerHTML={{ __html: themeGuard }} />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: baseStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
