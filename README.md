# Form / Lab

A calm, animated sign-in and registration experience backed by an Express API and SQLite. The browser communicates with the server through same-origin API routes; passwords are hashed on the server and login state is kept in an HTTP-only session cookie.

Maintained by [teobodev](https://github.com/teobodev).

## Features

- Sign in, create an account, and sign out.
- Password hashing with `bcryptjs`; plaintext passwords are not stored.
- SQLite account storage and SQLite-backed sessions that survive server restarts when the data directory is persistent.
- Session restoration when the page is reopened or refreshed.
- Responsive Vue interface with keyboard focus styles, loading/error feedback, and motion that respects reduced-motion settings.
- Vite development server with an `/api` proxy to Express.

## Requirements

- Node.js 22.18+ or 24.12+ (the project uses `node:sqlite`).
- npm.

## Run locally

```sh
npm ci
```

Copy `.env.example` to `.env`, then replace `SESSION_SECRET` with a random value of at least 32 characters. For example:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Start the frontend and API together:

```sh
npm run dev
```

Open the local URL printed by Vite. The server creates `data/accounts.sqlite` and `data/sessions.sqlite` when first used. Those files are local user data and are ignored by Git.

## Configuration

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Secret used to sign session cookies. Required in production; use a unique random value of 32+ characters. |
| `PORT` | HTTP port. Defaults to `3000`; hosting providers usually set this automatically. |
| `NODE_ENV` | Set to `production` in production. Enables secure session cookies and production static-file caching. |
| `DATA_DIR` | Directory for SQLite account and session databases. Use a mounted persistent volume in production. |
| `TRUST_PROXY` | Set to `true` only when HTTPS ends at the hosting provider's trusted reverse proxy. |

Never commit `.env`, credentials, or SQLite database files. `.env.example` contains placeholders only.

## Build and run in production

```sh
npm ci
npm run build
npm start
```

The Express server serves the compiled `dist/` frontend and the `/api` endpoints from one origin. This application needs a Node.js host; GitHub Pages or another static-only host cannot run the Express authentication API or preserve SQLite data.

For deployment, configure `NODE_ENV=production`, a private `SESSION_SECRET`, and `DATA_DIR` to the path of a mounted persistent disk. Set `TRUST_PROXY=true` only if the provider terminates HTTPS in front of the app. Keep the app on one instance: the current SQLite database and session store are designed for a single server process and a local persistent volume. Back up the volume securely. Do not use an ephemeral filesystem for account data.

### Render deployment

The included [`render.yaml`](render.yaml) describes a Node web service with a 1 GB persistent disk mounted at `/var/data`, a generated session secret, and production HTTPS proxy settings. Connect the public GitHub repository to Render and create a Blueprint from this file. The configuration uses Render's paid `0.5c-512mb` plan (currently $7/month) plus persistent SSD storage currently listed at $0.25/GB/month; the configured 1 GB disk adds about $0.25/month. Pricing can change. Render's free web plan does not support persistent disks, so don't switch this service to free while keeping SQLite for account storage. Keep one service instance because SQLite is backed by the local mounted disk. See [Render Blueprint docs](https://render.com/docs/blueprint-spec), [persistent disk docs](https://render.com/docs/disks), and [pricing](https://render.com/pricing).

## Validation

Run `npm test` for the isolated API smoke test and `npm run build` for the production frontend build. The smoke test covers registration validation, bcrypt storage, duplicate email rejection, login, refresh/session lookup, logout, and session/account persistence across an app restart. It uses disposable data in the operating system's temporary directory and does not touch the local `data/` database.

## Project structure

```text
.
├── src/
│   ├── App.vue       # Sign-in, registration, and signed-in interface
│   ├── base.css      # Layout and visual styles
│   ├── main.js       # Vue app entry point
│   ├── motion.css    # Animation checkpoints 01–06
│   └── storage.js    # Same-origin API client and safe preference helpers (07–09)
├── scripts/
│   ├── manage-users.js  # Local account administration utility
│   └── smoke-test.js    # Isolated auth API integration test
├── data/             # Local SQLite data; ignored by Git
├── server.js         # Express API, password hashing, sessions, and static hosting
├── vite.config.js    # Vue plugin and development API proxy
├── index.html
├── package.json
├── render.yaml         # Render Node service and persistent disk blueprint
└── .env.example
```

## Account administration

To manage local accounts, stop the server and run:

```sh
npm run users
```

This utility operates on the database selected by `DATA_DIR` (or `./data` by default). Use it only on a trusted machine. Never share database files or password hashes.

## License

This project is released under the MIT License. See [LICENSE](LICENSE).

© 2026 [teobodev](https://github.com/teobodev)
