# Avengems — Frontend

Gemstone jewelry ecommerce frontend inspired by the six stones. Built with **React + Vite**, plain CSS, `react-router-dom`, `lucide-react`, and `recharts`.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build
npm run lint     # oxlint
```

Requires Node.js LTS (tested with Node 22).

### Demo-mode notes for presenters

- **Registration, confirmation and login are real:** signup creates a Supabase Auth customer when permitted and sends provider confirmation instructions. Login/logout use backend HttpOnly cookie sessions. See [registration testing](docs/customer-registration.md) and [frontend session testing](docs/frontend-authentication.md). Registration does not log in automatically.
- **Password recovery is real:** Supabase emails recovery OTPs; Express verifies them and permits a short-lived, single-use password reset. No code is displayed or generated locally. See [safe recovery testing](docs/password-recovery.md).
- **Google sign-in** shows a toast: it becomes available once the backend is connected.
- **Payments:** GCash/Maya/COD/Card are selectable; card fields are validated and then discarded. Nothing is charged or stored.
- **Admin product/settings edits** last until the page is reloaded. Placed demo orders, cart and wishlist use browser storage. Stored prototype users/roles never grant authentication or admin access; authenticated identity comes from the backend.
- To reset browser demo data, clear the site's data (keys start with `avg_`). This does not remove real Supabase accounts.
