import express from 'express';
import healthRoutes from './routes/health.js';
import { createProductsRouter } from './routes/products.js';
import { supabase } from './supabase.js';
import { createAccessTokenVerifier, createAuthClientFactory, createOAuthClientFactory } from './auth.js';
import { createGoogleOAuth } from './googleOAuth.js';
import { createXendit } from './xendit.js';
import { createPayments } from './payments.js';
import { createPaymentWebhookRouter } from './routes/payments.js';
import { createMeRouter } from './routes/me.js';
import { createCookieSessions } from './sessions.js';
import { createAuthRouter } from './routes/auth.js';
import { getPublicUser, identityFromUser } from './profile.js';
import { createRegistration } from './registration.js';
import { createRecovery } from './recovery.js';
import { notFound, errorHandler } from './errors.js';
import { createCartQuoteRouter } from './routes/checkout.js';
import { createAdminRouter } from './routes/admin.js';
import { createCollectionsRouter } from './routes/collections.js';
import { createMailer } from './mailer.js';
import { startupConfig } from './config.js';
import { createOrderNotifications } from './orderNotifications.js';

const PORT = Number(process.env.PORT) || 3001;

const app = express();
const authConfig = { url: process.env.SUPABASE_URL, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY };
// Throws (refusing to start) on missing/invalid APP_ORIGIN in production or incomplete SMTP settings.
const { production, appOrigin, emailOrigin } = startupConfig();
const mailer = createMailer();
const payments = createPayments({ client: supabase, provider: createXendit(), origin: appOrigin });
// Order emails only. Supabase Auth emails are configured in the Supabase Dashboard.
const notifications = createOrderNotifications({ client: supabase, mailer, origin: emailOrigin, production,
  storeEmail: process.env.STORE_NOTIFY_EMAIL });
const registration = createRegistration({
  createAuthClient: createAuthClientFactory(authConfig),
  loadUser: (user) => getPublicUser(supabase, identityFromUser(user)),
  origin: appOrigin,
});
const cookieSessions = createCookieSessions({
  createAuthClient: createAuthClientFactory(authConfig),
  loadUser: (user) => getPublicUser(supabase, identityFromUser(user)),
  origin: appOrigin,
  production: process.env.NODE_ENV === 'production',
});
app.disable('x-powered-by');
const googleOAuth = createGoogleOAuth({ createOAuthClient: createOAuthClientFactory(authConfig), cookieSessions,
  origin: appOrigin, supabaseUrl: authConfig.url, production: process.env.NODE_ENV === 'production' });
const recovery = createRecovery({ createAuthClient: createAuthClientFactory(authConfig), cookieSessions,
  production: process.env.NODE_ENV === 'production' });
app.use(['/api/auth', '/api/me', '/api/cart', '/api/admin'], (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use('/api/webhooks', createPaymentWebhookRouter(payments));
app.use(['/api/me', '/api/admin'], cookieSessions.requireSession);

app.get('/api', (req, res) => {
  res.json({ name: 'Avengems API', health: '/api/health' });
});
app.use('/api/health', healthRoutes);
app.use('/api/products', createProductsRouter(supabase));
app.use('/api/collections', createCollectionsRouter(supabase));
app.use('/api/auth', createAuthRouter(cookieSessions, registration, recovery, googleOAuth));
app.use('/api/cart', createCartQuoteRouter(supabase, cookieSessions));
app.use('/api/admin', createAdminRouter({ client: supabase, cookieSessions, payments, notifications, verifyAccessToken: async (accessToken) => {
  recovery.assertNormalAccessToken(accessToken);
  return createAccessTokenVerifier(authConfig)(accessToken);
} }));
app.use('/api/me', createMeRouter({
  payments,
  notifications,
  customerCancellationEnabled: process.env.CUSTOMER_ORDER_CANCELLATION_ENABLED === 'true',
  client: supabase,
  verifyAccessToken: async (accessToken) => {
    recovery.assertNormalAccessToken(accessToken);
    return createAccessTokenVerifier(authConfig)(accessToken);
  },
  cookieSessions,
}));

app.use('/api', notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Avengems API running at http://localhost:${PORT}/api`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  notifications.sweep();
});
