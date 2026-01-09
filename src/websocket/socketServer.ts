import { Server } from 'socket.io';
import { Server as HTTPServer } from 'http';

let io: Server;

export function initializeWebSocket(server: HTTPServer) {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || [
                'http://localhost:5173',
                'http://localhost:5174',
                'http://localhost:5175',
                'http://127.0.0.1:5173',
                'http://127.0.0.1:5174'
            ],
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        // Join order-specific room
        socket.on('join-order', (orderId: string) => {
            socket.join(orderId);
            console.log(`Socket ${socket.id} joined room: ${orderId}`);
        });

        // Leave order room
        socket.on('leave-order', (orderId: string) => {
            socket.leave(orderId);
            console.log(`Socket ${socket.id} left room: ${orderId}`);
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });

    console.log('✅ WebSocket server initialized');
    return io;
}

export function getIO(): Server {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
}

export function emitOrderUpdate(orderId: string, data: any) {
    if (io) {
        io.to(orderId).emit('order-status-update', data);
    }
}

export function emitPaymentReceived(orderId: string, data: any) {
    if (io) {
        io.to(orderId).emit('payment-received', data);
    }
}

export function emitConfirmationUpdate(orderId: string, confirmations: number) {
    if (io) {
        io.to(orderId).emit('confirmation-update', { confirmations });
    }
}
