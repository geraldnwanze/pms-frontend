# PMS Frontend (Next.js)

Property Management System — the React + Vite SPA ported to **Next.js 14 (App Router)**,
now backed by the [Laravel API](../../laravel/pms-backend).

The UI stays an optimistic client — every Redux reducer runs the business logic
locally and updates the store immediately — but it now talks to the Laravel
**v1 REST API** (`/api/v1`, Sanctum tokens, RBAC):

- **Auth screens** — `/login`, `/register`, `/forgot-password`,
  `/reset-password` (views in `src/views/`, shared `AuthShell` frame). Sign in
  with email + password. **Register takes no role** — you become a plain
  *Member* and see no property data. From there you either **create a property**
  (empty-dashboard CTA → you're its owner) or accept an **invitation**.
- **Invitations & team** — `/invitations` (accept/decline pending invites,
  shows your memberships); a **Team** tab on `PropertyDetail` lets an owner or
  manager invite by email + role and revoke members. `data.memberships` /
  `data.invitations` come from `/bootstrap`; thunks `acceptInvitation`,
  `declineInvitation`, `inviteMember`, `revokeMember` re-bootstrap after. The
  denormalised `user.role` (owner/manager/… or `user`) drives the sidebar nav
  and dashboard, and updates a beat after accepting/creating.
- The Sanctum token is stored in `localStorage['pms.token']` and sent as
  `Authorization: Bearer` by `src/lib/api.ts`. The demo role-picker stays as a
  collapsible "Demo accounts" panel on `/login` (admin + the two owners).
- **On load** — `bootstrap()` fetches `GET /api/v1/bootstrap`, one request that
  returns every collection the signed-in role may see (RBAC-scoped), keyed like
  the Redux `data` slice, and hydrates it via `dataActions.hydrateAll`. The
  in-browser `generateSeed()` now only produces the backend's seed file.
- **On every mutation** — `src/store/apiMiddleware.ts` maps the dispatched
  `data/*` action to the matching v1 request (REST for CRUD, e.g.
  `POST /api/v1/maintenance`; dedicated routes for workflow, e.g.
  `POST /api/v1/payments/{id}/approve`). The reducer's optimistic update stays
  on screen; a short debounce later `bootstrap()` re-runs so the store converges
  on server truth (generated ids, recomputed invoice status, cascades, audit,
  notifications). A failed write re-bootstraps immediately to roll back; a `401`
  signs the user out.

Client-generated ids/codes are sent with creates and honoured by the API, so
the optimistic record and the persisted one match.

## Run

```bash
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
npm run dev -- --port 3020         # http://localhost:3020  (CORS allows 3000 & 3020)
```

Start the [backend](../../laravel/pms-backend) first (`php artisan serve`).

```bash
npm run build && npm run start   # production
npm run typecheck                # tsc --noEmit
npm run dump:seed                # regenerate the backend's database/data/seed-data.json
```

## How the conversion is structured

- **Routing** moved from `react-router-dom` to the App Router. Routes live in
  `src/app`; every shared page component lives in `src/views` (renamed from `pages/`
  so Next does not treat it as the legacy Pages Router).
  - `src/app/(app)/layout.tsx` — `RequireAuth` + the `AppLayout` shell (sidebar/topbar).
  - `src/app/(app)/(staff)/` — all staff routes, guarded by `RequireRole` (staff roles).
  - `src/app/(app)/(tenant)/portal/**` — tenant portal, guarded to the `tenant` role.
  - `src/app/login`, `src/app/(app)/settings`, dynamic routes like
    `properties/[id]`, `invoices/[id]`, `maintenance/[id]`, etc.
- **Compatibility shim** — `src/lib/router.tsx` re-implements the small slice of the
  react-router API the app used (`useNavigate`, `useParams`, `useLocation`, `Link`,
  `NavLink`) on top of `next/navigation` + `next/link`, so component call sites were
  left unchanged; only the import source moved.
- **Client boundary** — page and component modules carry `'use client'`. The Redux
  Provider and theme wiring (the old `main.tsx`) live in `src/app/providers.tsx`; a
  small inline script in `src/app/layout.tsx` applies the light/dark class before
  hydration to avoid a theme flash.
- **Guards** — `src/components/auth/guards.tsx` (`RequireAuth`, `RequireRole`,
  `LoginGate`, `HomeRedirect`) replace the `<RequireAuth>`/`<RequireRole>` route
  wrappers from the Vite `App.tsx`.

Everything else — `store/`, `components/`, `config/`, `lib/`, `data/`, `types/`,
`index.css`, Tailwind config — carried over unchanged.

## Modules

A superadmin switches platform modules on and off (see the backend README, "Modules and the superadmin"). The server sends the
current states in the bootstrap as `data.modules`; the app hides what is off, and the server is what refuses.

- **Config:** `src/config/modules.ts` — the `ModuleKey` list, `isModuleOn` (a module counts as on until the states have loaded), and
  `moduleForPath`, which says which module a screen belongs to by path prefix. The menu (`navForRole` in `src/config/nav.ts`) and the
  route guard both use it, so a screen is hidden and blocked from one place. A core screen has no entry.
- **Guard:** `RequireModule` (in `src/components/auth/guards.tsx`) wraps the staff and tenant layouts: a page of a module that is off
  shows "This module is turned off" instead (with a link to `/modules` for a superadmin).
- **Inside screens:** anything that belongs to a module but sits on another module's screen checks `selectModuleOn('<key>')` itself
  (the terminate-lease dialog, the auto-debit cards, the payout controls, the Remind buttons, the dashboard tiles, the portal home).
- **Staying current:** a request refused because its module is off makes the app reload (`moduleTurnedOff`), and the app also
  re-checks the module list when the browser tab regains focus, at most every 30 seconds (`useModuleSync`).
- **Modules screen:** `/modules`, superadmin only (`src/views/Modules.tsx`).

To add a module: add its key to `ModuleKey` and its screens to `PATH_MODULES` in `src/config/modules.ts`, then hide whatever else
it owns inside other screens with `selectModuleOn`. `src/config/modules.test.ts` covers the path map and the menu.

## "I'm not a robot" challenge

The sign-in, register, forgot-password and reset-password pages show Cloudflare's Turnstile widget when the server has it switched on (see the backend README,
"Bot protection"). The page learns whether it is on, and its public site key, from `GET /auth/captcha`, so there is nothing to configure here.

- `src/lib/captcha.ts` — reads that setting once per page load and loads Cloudflare's script on demand (a failed load can be retried).
- `src/hooks/useCaptcha.ts` + `src/components/auth/CaptchaBox.tsx` — the state (`ready`, `token`, `reset()`) and the widget. A form's submit button
  is disabled until the check is passed, the token is sent as `captchaToken`, and the widget is reset after any failed attempt because a token works once.
  If the server says it is on but has no site key, the form shows a message instead of a widget nobody can pass.
- Not on the demo one-click sign-in (a local-only shortcut), or on verify-email (it already needs an emailed token).

