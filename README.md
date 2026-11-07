# Avengems

Gemstone jewelry ecommerce application inspired by the six stones. Built with **React + Vite**, Express, Supabase PostgreSQL/Auth, plain CSS, `react-router-dom`, `lucide-react`, and `recharts`.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build
npm run lint     # oxlint
```

Requires Node.js LTS (tested with Node 22).

Customer and administrator sessions have a server-enforced 20-minute inactivity
limit. Genuine input renews it; refreshes and background requests do not. Run one
stable Express process; see [session behavior and deployment limits](docs/authentication-idle-policy.md).

Customer self-cancellation and short yearly order references now have separate
forward-only proposals. Customer cancellation defaults OFF until the new RPC is
deployed, validated and explicitly enabled server-side. Internal order IDs remain
unchanged. See [implementation, local PostgreSQL evidence and deployment steps](docs/customer-cancellation-order-references.md).

### Demo-mode notes for presenters

- **Registration, confirmation and login are real:** signup creates a Supabase Auth customer when permitted and sends provider confirmation instructions. Login/logout use backend HttpOnly cookie sessions. See [registration testing](docs/customer-registration.md) and [frontend session testing](docs/frontend-authentication.md). Registration does not log in automatically.
- **Password recovery is real:** Supabase emails recovery OTPs; Express verifies them and permits a short-lived, single-use password reset. No code is displayed or generated locally. See [safe recovery testing](docs/password-recovery.md).
- **Google sign-in** is not implemented; the button displays an informational message.
- **Payments:** GCash/Maya/COD/Card are selectable; card fields are validated and then discarded. Nothing is charged or stored.
- **Admin products, settings, order management, dashboard, analytics and customer summaries** use protected backend APIs and persisted records. Admin stock updates compare the stock value loaded by the editor before writing. No seeded orders or sales are used. Cancellation requires a separately reviewed atomic restocking RPC. See [admin implementation and checking guide](docs/admin-management.md).
- Cart selections use browser storage; profiles, addresses, wishlist and order reads use backend APIs. Persistent order placement requires [checkout SQL deployment](docs/checkout-order-placement.md). Stored prototype users/roles never grant authentication or admin access; authenticated identity comes from the backend.
- Packages, team profiles, care copy and informational policies remain static project content. Team role labels do not change database roles. Newsletter subscription is unavailable and never reports a saved subscription.
- To reset browser demo data, clear the site's data (keys start with `avg_`). This does not remove real Supabase accounts.

Start the configured Express server separately with `npm --prefix server run dev`; Vite proxies `/api` to port 3001. Keep all Supabase secrets in the server environment. See the checking guide for prerequisites, regression commands, migration blockers and manual tests. No migration is applied by either development command.
