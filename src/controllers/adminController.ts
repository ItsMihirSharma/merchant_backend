import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../prisma';

export async function login(req: Request, res: Response) {
    try {
        const { email, password } = req.body;

        const admin = await prisma.admin.findUnique({
            where: { email }
        });

        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, admin.passwordHash);

        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: admin.id, email: admin.email, role: admin.role },
            process.env.JWT_SECRET!,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            admin: {
                id: admin.id,
                email: admin.email,
                name: admin.name,
                role: admin.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
}

export async function getStats(req: Request, res: Response) {
    try {
        const [
            totalOrders,
            pendingOrders,
            confirmedOrders,
            fulfilledOrders,
            totalRevenue
        ] = await Promise.all([
            prisma.order.count(),
            prisma.order.count({ where: { status: 'PENDING' } }),
            prisma.order.count({ where: { status: 'PAYMENT_CONFIRMED' } }),
            prisma.order.count({ where: { status: 'FULFILLED' } }),
            prisma.order.aggregate({
                where: { status: 'PAYMENT_CONFIRMED' },
                _sum: { totalAmount: true }
            })
        ]);

        res.json({
            totalOrders,
            pendingOrders,
            confirmedOrders,
            fulfilledOrders,
            totalRevenue: totalRevenue._sum.totalAmount || 0
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
}

export async function getConfig(req: Request, res: Response) {
    try {
        const config = await prisma.configuration.findFirst();

        if (!config) {
            return res.status(404).json({ error: 'Configuration not found' });
        }

        res.json(config);
    } catch (error) {
        console.error('Get config error:', error);
        res.status(500).json({ error: 'Failed to fetch configuration' });
    }
}

export async function updateConfig(req: Request, res: Response) {
    try {
        const { merchantWallet, webhookUrl, supportedChains, supportedTokens, testnetMode, requiredConfirmations } = req.body;

        const config = await prisma.configuration.findFirst();

        let updatedConfig;
        if (config) {
            updatedConfig = await prisma.configuration.update({
                where: { id: config.id },
                data: {
                    merchantWallet,
                    webhookUrl,
                    supportedChains,
                    supportedTokens,
                    testnetMode,
                    requiredConfirmations
                }
            });
        } else {
            updatedConfig = await prisma.configuration.create({
                data: {
                    merchantWallet,
                    webhookUrl,
                    supportedChains,
                    supportedTokens,
                    testnetMode,
                    requiredConfirmations
                }
            });
        }

        res.json(updatedConfig);
    } catch (error) {
        console.error('Update config error:', error);
        res.status(500).json({ error: 'Failed to update configuration' });
    }
}
