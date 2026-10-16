import express from 'express';
import healthRoutes from './routes/health.js';
import { notFound, errorHandler } from './errors.js';

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/api', (req, res) => {
  res.json({ name: 'Avengems API', health: '/api/health' });
});
app.use('/api/health', healthRoutes);

app.use('/api', notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Avengems API running at http://localhost:${PORT}/api`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
