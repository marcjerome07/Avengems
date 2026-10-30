import express from 'express';
import healthRoutes from './routes/health.js';
import { createProductsRouter } from './routes/products.js';
import { supabase } from './supabase.js';
import { createAccessTokenVerifier, createAuthClientFactory } from './auth.js';
import { createMeRouter } from './routes/me.js';
import { createCookieSessions } from './sessions.js';
import { createAuthRouter } from './routes/auth.js';
import { getPublicUser, identityFromUser } from './profile.js';
import { createRegistration } from './registration.js';
import { createRecovery } from './recovery.js';
import { notFound, errorHandler } from './errors.js';

const PORT = Number(process.env.PORT) || 3001;

const app = express();
const authConfig = { url: process.env.SUPABASE_URL, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY };
const appOrigin = process.env.APP_ORIGIN || (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:5173');
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
const recovery = createRecovery({ createAuthClient: createAuthClientFactory(authConfig), cookieSessions,
  production: process.env.NODE_ENV === 'production' });
app.use(['/api/auth', '/api/me'], (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '100kb' }));

app.get('/api', (req, res) => {
  res.json({ name: 'Avengems API', health: '/api/health' });
});
app.use('/api/health', healthRoutes);
app.use('/api/products', createProductsRouter(supabase));
app.use('/api/auth', createAuthRouter(cookieSessions, registration, recovery));
app.use('/api/me', createMeRouter({
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
});
