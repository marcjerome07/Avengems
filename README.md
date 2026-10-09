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

- **OTP codes:** no email is sent. The verification code is shown in a "Demo mode: your code is …" notice on the page and printed in the browser console. Verification still checks the code and its 5-minute expiry. The **Expire this code (demo)** link lets you show the expired state without waiting.
- **Google sign-in** shows a toast: it becomes available once the backend is connected.
- **Payments:** GCash/Maya/COD/Card are selectable; card fields are validated and then discarded. Nothing is charged or stored.
- **Admin product/settings edits** last until the page is reloaded. Registered users, placed orders, cart, wishlist, and the session persist in `localStorage`.
- To reset everything: clear the site's data in your browser (all keys start with `avg_`).
