# OrangetRewrite — multi-page build

This project uses the Oranget game code from the supplied original HTML, separated into individual page entry files like the GitHub examples.

## Pages
- `index.html` — Vercel default entry point (same landing route as `Index.html`)
- `Index.html` — landing / entry page
- `Login.html` and `Register.html` — direct login and registration entry pages
- `Home.html`, `Blooks.html`, `Market.html`, `Bazaar.html`, `Trade.html`, `Chat.html`, `Ranks.html` — separate game pages
- `Settings.html` — settings entry page

## Shared files
- `app.jsx` — shared React game logic and page routing
- `styles.css` — shared Oranget styling
- `bootstrap.js` — startup/loading error handling

Keep all files in the same folder when uploading/deploying. `index.html` is lowercase on purpose because static hosts such as Vercel expect that as the default entry file. Pages use React, Babel, Tailwind and Firebase compatibility libraries from their CDNs, like the original.

## Important
This is a front-end code split. `window.ORANGET_BACKEND` remains empty as in the supplied source, so backend-dependent features still need the correct backend configuration. The generated package has been structurally checked, but not fully browser-tested against live Firebase/backend services.
