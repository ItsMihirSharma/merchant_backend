import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { initializeWebSocket } from './websocket/socketServer';
import { errorHandler } from './middleware/errorHandler';
import webhookRoutes from './routes/webhook.routes';
import orderRoutes from './routes/order.routes';
import adminRoutes from './routes/admin.routes';
import configRoutes from './routes/config.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server for WebSocket
const server = createServer(app);

// Initialize WebSocket
initializeWebSocket(server);

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5174',
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

app.use('/api/webhooks', webhookRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/config', configRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Start server
server.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 Web3Pay Merchant Backend Server');
    console.log('='.repeat(60));
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📬 Webhook endpoint: http://localhost:${PORT}/api/webhooks/payment-confirmation`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔌 WebSocket server: ws://localhost:${PORT}`);
    console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
