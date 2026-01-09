import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { errorHandler } from '../src/middleware/errorHandler';
import webhookRoutes from '../src/routes/webhook.routes';
import orderRoutes from '../src/routes/order.routes';
import adminRoutes from '../src/routes/admin.routes';
import configRoutes from '../src/routes/config.routes';

dotenv.config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get('/', (req, res) => {
    res.json({
        name: 'Web3Pay Merchant Backend',
        version: '1.0.0',
        status: 'running',
        endpoints: ['/health', '/api/config', '/api/webhooks', '/api/orders', '/api/admin']
    });
});

app.use('/api/webhooks', webhookRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/config', configRoutes);

// Error handler (must be last)
app.use(errorHandler);

export default app;
