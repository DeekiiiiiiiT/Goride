# Mobile Native Polish — reusable Cursor prompt

Copy everything between the lines. Fill in the **App details** block at the bottom for each app.

---

You are a senior mobile UI/UX engineer. Your job is to make this app feel like a polished native iOS and Android app, the kind a top product team ships, on every phone and tablet. Work carefully and verify everything you claim.

## Ground rules (read first, follow always)
1. **Keep the look.** The visual design (colours, fonts, layout, copy, icons) is approved. Don't redesign, restyle or "modernise" screens. You improve how the app *feels* and *behaves*: fit, spacing at the edges, touch, motion, keyboard, states. If a screen genuinely needs a visual change to work on a small phone, list it under Follow-ups and don't do it.
2. **One version of every screen.** Never make a "mobile copy" of a screen. Fix the screen in place with responsive classes.
3. **Match the repo.** Use the existing styling system (Tailwind, CSS modules, design tokens) and component patterns. Put reusable pieces in the existing shared UI package if there is one. Add no new dependencies, unless the repo already uses that tool (for example a PWA plugin or Capacitor plugins).
4. **Don't break anything.** Desktop must still work. Business logic, API calls, routes and data must not change. Typecheck and the existing tests must stay green.
5. **Service worker:** if one already exists, keep it working and don't rewrite it. If none exists, don't add one unless I ask.

## Phase 1 — Audit (write this before any code)
Inspect the entry HTML, the global CSS and tokens, the app shell (header, tab bar, page container), every full-screen flow, all sheets, modals, toasts and dialogs, all forms, maps and camera screens, and the build setup. Check whether it runs in a browser, as an installed PWA, inside Capacitor or Cordova, or several of these.

Produce an **audit table**: screen or area → problem → device where it shows → fix. Check every item below on every screen.

- **Fit:** nothing is cut off or hidden behind the notch, Dynamic Island, status bar, home indicator or Android gesture bar. The page never scrolls sideways at 320 px wide.
- **Heights:** no `100vh`. The layout doesn't jump when the browser bars show or hide, or when the keyboard opens.
- **Touch:** every tap target is at least 44×44 pt (iOS) / 48×48 dp (Android), with at least 8 px between neighbours. No action is hover-only. Every control shows a visible pressed state.
- **Keyboard:** focused inputs are never covered. The page doesn't zoom on focus. The right keyboard appears for each field. The tab bar and floating buttons hide while typing.
- **Scroll:** only content areas scroll, never the whole shell behind a sheet or full-screen flow. There's no rubber-band bounce on the shell or accidental pull-to-refresh. Scroll position is kept when going back.
- **Navigation:** every screen has a way back. Android's hardware or gesture back closes the top sheet or dialog first, then goes back a screen, and exits only from a tab root. iOS edge-swipe-back isn't blocked by full-width horizontal gestures.
- **States:** every screen that loads data has a loading state (a skeleton matching the final layout, not a spinner on a blank page), an empty state, an error state with a retry, and an offline state.
- **Text:** body text is at least 16 px, and no text is under 12 px. Layouts survive the phone's large-text setting (200% on iOS, 1.3× font scale on Android) without clipping. Long names and numbers wrap or truncate cleanly.
- **Contrast and accessibility:** text meets WCAG AA (4.5:1 body, 3:1 large text and icons). Every icon-only button has an accessible name. Focus is visible for keyboard and switch users. Reading order follows the visual order.
- **Motion:** screen changes, sheets and toasts animate at 150–300 ms using transform and opacity only. Everything respects `prefers-reduced-motion`.
- **Dark mode:** if the app has a dark theme, check every screen in it, including status-bar colour and map tiles.
- **Tablet and landscape:** content doesn't stretch edge to edge on iPad. Landscape isn't broken, even if portrait is the main mode.
- **Performance:** no layout shift when images or fonts load (set sizes, `font-display: swap`). Lists over about 50 items don't stutter. Taps respond within 100 ms.

Then implement every fix in the phases below, in order.

## Phase 2 — Document head and install
In the main HTML template, merge these (don't duplicate existing tags):

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
<meta name="theme-color" content="[THEME_COLOR]" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="[THEME_COLOR_DARK]" media="(prefers-color-scheme: dark)" />
<meta name="description" content="[APP_DESCRIPTION]" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="[SHORT_NAME]" />
<meta name="format-detection" content="telephone=no" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />
```

- Don't add `maximum-scale` or `user-scalable=no`. Pinch-zoom must keep working for accessibility, and the 16 px input rule stops focus-zoom instead.
- Use `black-translucent` for the status-bar style only if every screen's header already pads for the top safe area. Otherwise use `default`.

Add `public/manifest.webmanifest`:
```json
{
  "id": "/",
  "name": "[APP_NAME]",
  "short_name": "[SHORT_NAME]",
  "description": "[APP_DESCRIPTION]",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "[BACKGROUND_COLOR]",
  "theme_color": "[THEME_COLOR]",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
- Use `orientation: "any"` so tablets can rotate. Lock portrait in the phone UI with layout, not the manifest.
- iOS ignores SVG home-screen icons and Android needs PNG, so generate the PNG icons, plus a maskable icon with its logo inside the central 80% safe zone. If no source logo exists, list that under Follow-ups and don't invent one.
- Make the splash/background colour match the first screen so launch doesn't flash white.

## Phase 3 — Global foundations (CSS and tokens)
Add these to the global stylesheet, using the repo's token naming:

```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --tabbar-h: 4rem;
  --tabbar-total: calc(var(--tabbar-h) + var(--safe-bottom));
  --header-h: 3.5rem;
}
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
html, body { overscroll-behavior-y: none; background: [BACKGROUND_COLOR]; }
body, #root { min-height: 100dvh; }
* { -webkit-tap-highlight-color: transparent; }
button, a, [role="button"], input, select, textarea, label { touch-action: manipulation; }
button, [role="button"], nav a { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
input, select, textarea { font-size: max(16px, 1rem); }
:focus-visible { outline: 2px solid [THEME_COLOR]; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

Then add these utilities (as Tailwind utilities or classes, following the repo):
- `pt-safe`, `pb-safe`, `px-safe`: padding of `max(<base>, var(--safe-*))`.
- `pb-tabbar`: `padding-bottom: calc(var(--tabbar-total) + 1rem)`, for scroll areas above the tab bar.
- `pressable`: a visible pressed state (`active:scale-[0.97]` plus a slight opacity or background change, with a 120 ms transition). Use it on every tappable card, list row and button.
- `tap-target`: `min-height: 44px; min-width: 44px`. Use it on icon buttons, and extend the hit area with padding, not by changing the visual size.

## Phase 4 — App shell
- **Root:** `min-h-[100dvh]`, flex column, background on the root so there are no white gaps at the edges.
- **Header:** sticky, `pt-safe`, with a fixed height of `var(--header-h)`. The title is truncated to one line. Back sits on the left, and actions are on the right with tap targets of at least 44 px. Blurred translucent backgrounds are fine if they're already in the design.
- **Tab bar:** fixed bottom, `pb-safe`, `px-safe`. Items have equal width, at least 48 px tall, with icon plus label. The active state isn't shown by colour alone. Tapping the active tab returns its stack to the root and scrolls to the top. Hide the tab bar while the keyboard is open and in immersive flows.
- **Page content:** `px-safe` with the app's normal side padding (usually 16 px), and `pb-tabbar` when tabs show.
- **Tablet (≥ 768 px):** centre content at a sensible reading width (`max-w-xl` for forms and lists, `max-w-3xl` for dashboards). Map screens stay full-bleed. Don't simply scale the phone UI up.
- **Desktop (≥ 1024 px):** if the app is phone-only by design, show it as a centred phone-width column on a neutral background, with no stretched layouts.

## Phase 5 — Immersive full-screen flows
Apply this to the flows listed in the App details (camera or scan, checkout, live tracking, maps, multi-step forms):
- Use a full-viewport container: `position: fixed; inset: 0; height: 100dvh; display: flex; flex-direction: column; overflow: hidden;`, with `pt-safe` and `px-safe`. Its inner region scrolls, the root does not.
- Lock the page behind it while it's open. Use a `useScrollLock` hook that also sets `overscroll-behavior: none`, because `body { overflow: hidden }` alone doesn't stop iOS scrolling. Release it on unmount.
- Pin the primary action to the bottom in a footer with `pb-safe`, so it stays reachable by thumb above the home indicator.
- Hide the tab bar. Show a clear ✕ or back that returns to where the flow started.
- Make maps full-bleed, and keep their controls clear of the safe areas.

## Phase 6 — Sheets, dialogs and toasts
- Build one shared `BottomSheet` (or extend the existing one) and use it everywhere:
  - a drag handle;
  - swipe down to close;
  - tap the backdrop to close;
  - Escape and Android back to close;
  - content area `pb-safe`, with a maximum height of `90dvh` and internal scroll;
  - focus moves into the sheet and returns to the opener on close.
- Dialogs: centred, with a maximum width of about 400 px. Confirm and cancel buttons are full width on phones, and the destructive action is styled as destructive and never the default.
- Toasts: placed above the tab bar (`bottom: calc(var(--tabbar-total) + 12px)`), and above the safe area when tabs are hidden. Never cover the primary button. Auto-dismiss at about 3 s, and announce with `aria-live="polite"`.
- Render overlays in a portal so they sit above every header and bar.

## Phase 7 — Forms and the keyboard
- Give every input a correct `type`, `inputmode`, `autocomplete` and `enterkeyhint`:
  - phone: `type="tel" autocomplete="tel"`;
  - OTP: `inputmode="numeric" autocomplete="one-time-code"`;
  - amounts: `inputmode="decimal"`;
  - odometer and other counts: `inputmode="numeric"`;
  - email: `type="email" autocomplete="email"`;
  - names: `autocomplete="given-name"` or the matching value.
- Add a `useVisualViewport` hook that exposes the keyboard height. Use it to keep the focused field and the primary button visible on iOS, which ignores `interactive-widget`. Scroll the focused field into view with `block: "center"`.
- In Capacitor, configure the Keyboard plugin (`resize: "body"` or `"native"`, whichever the shell supports) and stop the WebView's own scroll from fighting yours.
- Show validation inline under the field, in plain words, and only after the field loses focus or the form is submitted. Disabled buttons explain why, in a line of helper text.
- Pressing Enter or Next moves to the next field, and Done submits.

## Phase 8 — Feel and feedback
- Every tap gives a response within 100 ms: a pressed state, then a loading state on the button itself (spinner plus a disabled state that blocks double-taps), never a frozen screen.
- Screen transitions: push forward slides in from the right, back slides out, and tab switches cross-fade without sliding. Keep them under 300 ms and skip them under reduced motion.
- Use skeletons shaped like the real content. Keep showing old data while refreshing, rather than blanking the screen.
- Haptics (Capacitor only, if `@capacitor/haptics` is already installed): a light tap on toggles and chips, and success or error feedback on saves.
- Restore scroll position when going back to a list.
- Images: fixed aspect-ratio boxes, `loading="lazy"` below the fold, and a neutral placeholder colour.

## Phase 9 — Native shell (only if the app ships with Capacitor or Cordova)
- Status bar: an overlay or colour that matches the header, with the icon style following light or dark theme, using `@capacitor/status-bar` if it's installed.
- Android back button: one handler that closes the top overlay, otherwise goes back, otherwise exits from a tab root (optionally with "Press back again to exit").
- Splash screen: hide it only once the first screen has rendered, with no white flash.
- Make sure safe-area insets work inside the WebView on both platforms (iOS `contentInset` setting, and Android edge-to-edge with insets passed to CSS).

## Phase 10 — Verify (required, show proof)
1. Run typecheck, lint and the existing tests. All must pass.
2. Do a production build, and confirm that the manifest, all icons and the favicon are in the output folder.
3. Use Playwright, or the existing e2e setup, to screenshot the main screens at these viewports:
   - iPhone SE (375×667)
   - iPhone 15 (393×852)
   - iPhone 15 Pro Max (430×932)
   - Pixel 7 (412×915)
   - Galaxy S8 (360×740)
   - a 320 px-wide phone
   - iPad Mini portrait (768×1024)
   - iPad landscape (1180×820)
   - desktop 1440×900

   On each screenshot, check for horizontal overflow, clipped text, controls under the safe areas and overlapping elements.
4. Add an automated check that fails if any tappable element is smaller than 44×44, or if `document.documentElement.scrollWidth > innerWidth`, on the main screens at 360 px.
5. Re-run the audit table, and mark each row Fixed (with the file) or Follow-up (with the reason).

## Deliverables
1. The audit table, with before and after status for every row.
2. The files changed, with one line each on what changed and why.
3. The screenshots, or where they were saved.
4. How to test on a real phone:
   - in the browser tab;
   - after Add to Home Screen (iOS Safari: Share → Add to Home Screen; Android Chrome: Install app);
   - in the native build, if there is one.
5. Follow-ups that need my decision, such as a missing logo for icons or a visual change you didn't make because of rule 1.

## App details
- App name / short name: [APP_NAME] / [SHORT_NAME]
- Description: [APP_DESCRIPTION]
- Theme colour (light / dark): [HEX] / [HEX]
- Background colour: [HEX]
- Framework and build: [e.g. Vite + React + Tailwind 4, Next.js App Router]
- Runs as: [browser / installed PWA / Capacitor iOS+Android]
- App shell file(s): [paths]
- Immersive flows to prioritise: [list]
- Screens that must stay pixel-identical to the design: [all / list]

---

## Filled in for Roam Plug
- App name / short name: Roam Plug / Plug
- Description: Free fuel prices, garage, and places for Jamaican drivers.
- Theme colour: #a33900 (light). Use the dark-theme surface colour from `plug.css` for dark.
- Background colour: the `surface` token in `plug.css`
- Framework and build: Vite + React 18 + Tailwind 4 + HashRouter, in `apps/plug`
- Runs as: browser, installed PWA (`public/sw.js` exists: keep it), and Capacitor iOS+Android
- App shell file(s): `apps/plug/src/shell/provider.tsx`, `shell/chrome.tsx` (tab bar, sheets, toast, dialogs), `apps/plug/index.html`, `apps/plug/src/index.css`
- Immersive flows: Log Fuel (scan → confirm → details → saved), Map It place pin (map + GPS), Explore map with bottom sheet, onboarding
- Pixel-identical: every screen in `src/screens/generated/` is the approved Stitch design. Change behaviour and edge spacing only; never change the look.
- Extra rule: the 8-journey Playwright test (`playwright.plug.config.ts`) must stay green.
