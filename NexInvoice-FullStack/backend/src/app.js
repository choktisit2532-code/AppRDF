import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.routes.js';
import { companyRouter } from './routes/company.routes.js';
import { documentRouter } from './routes/document.routes.js';
import { customerRouter } from './routes/customer.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

export const app = express();
app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN.split(',').map((v) => v.trim()), credentials: false }));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => res.json({ success: true, service: 'nexinvoice-backend' }));
app.use('/api/auth', authRouter);
app.use('/api/company-settings', companyRouter);
app.use('/api/documents', documentRouter);
app.use('/api/customers', customerRouter);
app.use(notFoundHandler);
app.use(errorHandler);
