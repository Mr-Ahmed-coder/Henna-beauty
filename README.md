# Henna & Beauty Salon — Phase 1

A local MERN foundation for a single salon. React, Vite, Tailwind CSS, React Router, Express, and Mongoose. No deployment has been configured.

## Run locally

Use Node.js 22.12+ (Node 24 recommended) and npm 10+.

```powershell
npm ci
Copy-Item server/.env.example server/.env
npm run dev
```

Frontend: http://127.0.0.1:5173. API health: http://127.0.0.1:5000/api/health. Both servers bind to loopback for local development. Stop with Ctrl+C.

You can also start each workspace separately with `npm run dev -w client` and `npm run dev -w server`. The Vite development server proxies `/api` requests to port 5000. If changing the backend port, update the proxy in `client/vite.config.js` too.

## MongoDB Atlas configuration

Set `MONGODB_URI` in the ignored `server/.env` to your Atlas connection string, including a database name, for example `mongodb+srv://<user>:<encoded-password>@<cluster>/salon`. Replace placeholders locally. Configure an Atlas database user and network access for your development IP. Never put this URI in client code or a `VITE_` variable.

An empty URI intentionally starts the API without a database; health reports `not-configured`. When a URI is supplied, startup requires a successful connection and health reports its current state. Startup failures omit connection credentials from logs. Live Atlas connectivity requires your own credentials and has not been verified.

`PORT` defaults to 5000. `CLIENT_ORIGIN` is a comma-separated browser origin allowlist. No secrets are needed by the frontend. `.env` files are ignored; only the example is tracked.

## Structure

```text
client/
  src/
    components/       Shared layout, navigation, footer, cards, calls to action
    data/             Proposed service content
    pages/            Home, Services, About, Contact, coming-soon views
    App.jsx           Frontend routes and 404 page
    styles.css        Tailwind integration, theme, responsive styles
server/
  src/
    config/           Optional Atlas connection
    app.js            Express app, middleware, health, JSON errors
    index.js          Environment loading, startup, shutdown
  test/               API health and scope checks
```

## Checks

```powershell
npm run lint
npm test
npm run build
```

`npm run preview -w client` serves the production frontend build locally. A future production host must serve `client/dist` with an SPA fallback to `index.html` for direct route visits. Deployment is outside this phase.

## Phase boundaries and content

Home, Services, About, and Contact are navigable and responsive, with reusable components, keyboard focus styles, a skip link, mobile navigation, and reduced-motion support. `/appointments` and `/queue` explain that those features are unavailable. No booking, queue, authentication, payment, or personal-data submission endpoints exist.

All business identity, proposed services, hours, address, and contact details are placeholders or marked as awaiting confirmation. No invented testimonials or operational claims are included. Photographs are illustrative Unsplash images, not salon portfolio work; remote fonts are from Google Fonts. These require internet access. Replace them with approved brand assets and confirmed details before launch. Native font fallbacks are provided.

Phase 2 requires explicit approval. Do not interpret these UI entry points as implemented workflows.

## Phase 1 verification

Verified on 31 October 2026:

- `npm run lint`, `npm test`, and `npm run build` pass.
- Both development servers start; `/api/health` returns HTTP 200 with `status: ok` and `database: not-configured`.
- Browser checks at 1440 × 900 and 390 × 844: core pages fit without horizontal overflow; mobile navigation opens and navigates; appointment, queue, and 404 routes render correctly. All four homepage images load. No browser console errors were recorded.
- Atlas connection was not exercised because no credentials were provided.
- `npm audit` reports six moderate findings in the development lint dependency chain (minimatch glob amplification), with no automatic fix available. Avoid running lint against untrusted glob inputs. These findings should be reviewed when upgrading lint tooling; no forced major-version overrides were applied.
- No Git remote existed in the empty workspace. A local repository was initialized; pushing requires an authorized remote.
