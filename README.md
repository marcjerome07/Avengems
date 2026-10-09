# Avengems — Frontend

Gemstone jewelry ecommerce frontend inspired by the six stones. Built with **React + Vite**, plain CSS, `react-router-dom`, `lucide-react`, and `recharts`.

> **Frontend only.** There is no server, database, real auth provider, email sending, or payment processing. A mock service layer in `src/services/` stands in for the backend so every flow works in the browser.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build
npm run lint     # oxlint
```

Requires Node.js LTS (tested with Node 22).

## Demo accounts

| Role     | Email                    | Password       |
| -------- | ------------------------ | -------------- |
| Customer | `customer@avengems.demo` | `Customer123!` |
| Admin    | `admin@avengems.demo`    | `Admin123!`    |

These are also shown in the **Demo accounts** box on the Login page ("Use this account" fills the form).

### Demo-mode notes for presenters

- **OTP codes:** no email is sent. The verification code is shown in a "Demo mode: your code is …" notice on the page and printed in the browser console. Verification still checks the code and its 5-minute expiry. The **Expire this code (demo)** link lets you show the expired state without waiting.
- **Google sign-in** shows a toast: it becomes available once the backend is connected.
- **Payments:** GCash/Maya/COD/Card are selectable; card fields are validated and then discarded. Nothing is charged or stored.
- **Admin product/settings edits** last until the page is reloaded. Registered users, placed orders, cart, wishlist, and the session persist in `localStorage`.
- To reset everything: clear the site's data in your browser (all keys start with `avg_`).

## Folder structure

```
src/
  main.jsx, App.jsx        Entry + routes (admin area is code-split)
  styles/                  tokens.css (design tokens), global.css (resets, utilities, tables)
  data/                    Mock data: products, collections, packages, team, demoUsers, demoOrders, config, productInfo
  services/                Mock API layer (the ONLY place that reads src/data)
  context/                 AuthContext, CartContext, WishlistContext, ToastContext
  hooks/                   useDocumentTitle, useServiceData, useNow
  utils/                   formatPrice (₱), validators, storage (safe localStorage), stoneTheme, customization
  components/
    layout/                Navbar, MobileMenu, SearchOverlay, Footer, PageContainer, ScrollToTop, StoreLayout, Logo
    ui/                    Button, Input, Select, Badge, Modal, Accordion, Toast, Skeleton, EmptyState, OtpInput,
                           Stepper, Rating, QuantitySelector, StatCard
    product/               ProductCard, ProductGrid, QuickViewModal, GemVisual, HeroVisual, ColorSwatch,
                           FilterSidebar, CollectionCard, PackageCard, ProductMedia
    cart/                  OrderSummary (totals + mini item list)
    auth/                  AuthShell, OtpVerifier, PasswordChecklist
    account/               OrdersTable
    admin/                 Charts, AdminHeader
    routing/               ProtectedRoute, AdminRoute
  pages/                   Home, Shop, ProductDetails, Collections, CollectionDetail, About, Cart, Checkout,
                           OrderConfirmation, InfoPage, NotFound, auth/*, account/*, admin/*
```

### Product images

Every product in `src/data/products.js` has `images: []`. Add photo paths (e.g. put files in `public/images/` and use `'/images/power-stone-ring-1.jpg'`) and they replace the `<GemVisual />` illustration automatically. No component changes are needed.

## Connecting the backend

Components never import `src/data/*`; they only call service functions, which return Promises. To connect a real API, replace the body of each function below with a `fetch()` call that returns the same shape, then delete `src/services/mockDb.js` and the mock data files.

Errors are thrown as `{ code, message }` (see `ServiceError` in `mockDb.js`). Pages branch on `code`, so keep these codes in the API responses.

| File                 | Functions to implement                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `authService.js`     | `getSession`, `getCurrentUser`, `login` (codes `INVALID_CREDENTIALS`, `UNVERIFIED`), `logout`, `register` (`EMAIL_EXISTS`), `verifyEmail`, `requestPasswordReset` (`NOT_FOUND`), `resetPassword` (`INVALID_TOKEN`), `updateProfile`, `changePassword` (`INVALID_PASSWORD`), `getAddresses`, `saveAddress`, `deleteAddress`, `setDefaultAddress`. Remove `getDemoAccounts` (and the Login demo box) for production. |
| `otpService.js`      | `sendOtp(email, purpose)` (`COOLDOWN`), `verifyOtp(email, purpose, code)` → `{ token }` (`INVALID`, `EXPIRED`, `NOT_FOUND`). Remove `getActiveOtp`, `expireOtpForDemo`, and the demo notice in `OtpVerifier.jsx`; `consumeToken` moves server-side. |
| `productService.js`  | `getProducts(filters)` → `{ items, total }`, `getProductBySlug` (`NOT_FOUND`), `getProductsByIds`, `getFeaturedProducts`, `getRelatedProducts`, `getSuggestedProducts`, `getCollections`, `getCollectionBySlug`, `getPackages`, `createProduct`, `updateProduct`, `deleteProduct`. `getProductInfo` and `getSizePreset` can stay as static content or move to the API. |
| `cartService.js`     | `calculateTotals(items)` (or a `POST /cart/quote`), `getShippingRules`. `loadCart`/`saveCart` can stay local or sync to the user's server cart. |
| `wishlistService.js` | `loadWishlist`, `saveWishlist` (sync to the user's account).                                                                                                                                                                   |
| `orderService.js`    | `placeOrder({ userId, items, customer, shipping, paymentMethod })`, `getOrdersByUser`, `getOrderById`. Payment gateway redirects (GCash/Maya) and card tokenization belong here and must never send raw card data to your server. |
| `adminService.js`    | `getDashboardStats`, `getSalesOverview`, `getOrderStatusBreakdown`, `getRecentOrders`, `getBestSellers`, `getAllOrders`, `updateOrderStatus`, `getCustomers`, `getAnalytics`, `getSettings`, `saveSettings`.                 |
| `teamService.js`     | `getTeamMembers`.                                                                                                                                                                                                              |

**Security note:** `ProtectedRoute` and `AdminRoute` are UX only. The backend must authenticate every request and enforce the admin role on every admin endpoint. Passwords in the mock use a non-cryptographic placeholder hash; real password hashing (bcrypt/argon2) belongs on the server.

## Team

- **Team Leader:** Dalangin, Hershey Anne P.
- **Scrum Master:** Oliverio, Brenan Dwayne A.
- **Members:** Balboa, Marc Jerome S.; De Vera, Ray Arvin R.; Mabutas, Carla R.; Peña, Sydney Angeleve M.; Vaflor, Mariel Kim R.

Contact: [avengems2026@gmail.com](mailto:avengems2026@gmail.com) · © 2026 Avengems. School project prototype.
