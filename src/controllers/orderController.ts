import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import type { CreateOrderDTO } from '../types';

const createOrderSchema = z.object({
    orderId: z.string(),
    customerName: z.string(),
    customerEmail: z.string().email(),
    customerPhone: z.string().optional(),
    shippingAddress: z.object({
        street: z.string(),
        city: z.string(),
        state: z.string(),
        zip: z.string()
    }),
    items: z.array(z.object({
        id: z.string(),
        name: z.string(),
        price: z.number(),
        quantity: z.number()
    })),
    totalAmount: z.number()
});

export async function createOrder(req: Request, res: Response) {
    try {
        const data: CreateOrderDTO = createOrderSchema.parse(req.body);

        const order = await prisma.order.create({
            data: {
                orderId: data.orderId,
                customerName: data.customerName,
                customerEmail: data.customerEmail,
                customerPhone: data.customerPhone,
                shippingAddress: JSON.stringify(data.shippingAddress),
                items: JSON.stringify(data.items),
                totalAmount: data.totalAmount,
                status: 'PENDING'
            }
        });

        // Parse JSON fields back for response
        const responseOrder = {
            ...order,
            shippingAddress: JSON.parse(order.shippingAddress as string),
            items: JSON.parse(order.items as string),
            metadata: order.metadata ? JSON.parse(order.metadata as string) : null
        };

        res.status(201).json(responseOrder);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.issues });
        }
        console.error('Create order error:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
}

export async function getOrder(req: Request, res: Response) {
    try {
        const { orderId } = req.params;

        const order = await prisma.order.findUnique({
            where: { orderId }
        });

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Parse JSON fields
        const responseOrder = {
            ...order,
            shippingAddress: JSON.parse(order.shippingAddress as string),
            items: JSON.parse(order.items as string),
            metadata: order.metadata ? JSON.parse(order.metadata as string) : null
        };

        res.json(responseOrder);
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
}

export async function listOrders(req: Request, res: Response) {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const status = req.query.status as string;
        const search = req.query.search as string;

        const where: any = {};

        if (status) {
            where.status = status;
        }

        if (search) {
            where.OR = [
                { orderId: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
                { customerEmail: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.order.count({ where })
        ]);

        // Parse JSON fields for all orders
        const parsedOrders = orders.map(order => ({
            ...order,
            shippingAddress: JSON.parse(order.shippingAddress as string),
            items: JSON.parse(order.items as string),
            metadata: order.metadata ? JSON.parse(order.metadata as string) : null
        }));

        res.json({
            orders: parsedOrders,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('List orders error:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
}

export async function updateOrderStatus(req: Request, res: Response) {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const order = await prisma.order.update({
            where: { orderId },
            data: { status }
        });

        res.json(order);
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
}

export async function fulfillOrder(req: Request, res: Response) {
    try {
        const { orderId } = req.params;
        const { trackingNumber } = req.body;

        const order = await prisma.order.update({
            where: { orderId },
            data: {
                status: 'FULFILLED',
                fulfilledAt: new Date(),
                metadata: trackingNumber ? JSON.stringify({ trackingNumber }) : undefined
            }
        });

        // Parse JSON fields for response
        const responseOrder = {
            ...order,
            shippingAddress: JSON.parse(order.shippingAddress as string),
            items: JSON.parse(order.items as string),
            metadata: order.metadata ? JSON.parse(order.metadata as string) : null
        };

        res.json(responseOrder);
    } catch (error) {
        console.error('Fulfill order error:', error);
        res.status(500).json({ error: 'Failed to fulfill order' });
    }
}
