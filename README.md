# Oranget — split HTML project

This project splits the uploaded Oranget_22_6.html into separate page shells and shared assets.

## Pages
- `index.html` — default Vercel entry point
- `Home.html` — home/dashboard
- `Login.html` — opens the login dialog when logged out
- `Register.html` — opens the sign-up dialog when logged out
- `Blooks.html`, `Market.html`, `Bazaar.html`, `Trade.html`, `Chat.html`, `Ranks.html`, `Settings.html`

## Shared files
- `app.jsx` — original React/Babel game logic
- `styles.css` — extracted CSS
- `bootstrap.js` — startup error/loading handling

## Deploy
Keep all files together in the repository root. `index.html` is lowercase intentionally because static hosting providers such as Vercel expect that filename as the default entry point. The page shells load React, Babel, Tailwind, and Firebase from their existing CDNs. `window.ORANGET_BACKEND` remains an empty string, matching the uploaded source.

The app has been split and basic file integrity checked, but it has not been browser-tested. External CDN access and any required backend/Firebase configuration still affect runtime behavior.

## Recent changes
- `aditya` is a hardcoded moderator (`HM`): /mute and /unmute work with no key.
- `aditya` name: animated red and blue (`.rbl`).
- `DEVMASTER`/`DEVDRAGON` name: cycles every name color with firework bursts and an electric shock effect (`.dvm`).
