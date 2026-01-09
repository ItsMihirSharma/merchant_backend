import { Router, Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

// Checkout widget URL (Vercel deployment or local)
const CHECKOUT_WIDGET_URL = process.env.CHECKOUT_WIDGET_URL || 'http://localhost:5176';

/**
 * GET /api/config
 * Returns ONLY merchant-specific configuration (merchant address)
 * Contract addresses are hardcoded in the widget for security
 */
router.get('/', (req: Request, res: Response) => {
    try {
        const config = {
            merchantAddress: process.env.MERCHANT_WALLET_ADDRESS,
            merchantName: process.env.MERCHANT_NAME || 'Web3Pay Merchant',
            checkoutWidgetUrl: CHECKOUT_WIDGET_URL,
            // Contract addresses are HARDCODED in the widget for security
            // Only merchant-specific data is returned here
        };

        // Validate required fields
        if (!config.merchantAddress) {
            return res.status(500).json({
                error: 'Merchant configuration incomplete',
                message: 'MERCHANT_WALLET_ADDRESS not configured'
            });
        }

        res.json({
            success: true,
            config
        });
    } catch (error) {
        console.error('Error fetching merchant config:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch merchant configuration'
        });
    }
});

/**
 * GET /api/config/checkout-link
 * Generates a checkout widget URL with merchant address and USD amount
 * Query params: amount (USD), orderId (optional), currency (optional, default USD)
 */
router.get('/checkout-link', (req: Request, res: Response) => {
    try {
        const { amount, orderId, currency = 'USD', returnUrl } = req.query;

        // Validate required params
        if (!amount) {
            return res.status(400).json({
                error: 'Missing required parameter',
                message: 'amount is required (in USD)'
            });
        }

        const merchantAddress = process.env.MERCHANT_WALLET_ADDRESS;
        if (!merchantAddress) {
            return res.status(500).json({
                error: 'Merchant not configured',
                message: 'MERCHANT_WALLET_ADDRESS not set'
            });
        }

        // Build checkout URL with query params
        const params = new URLSearchParams({
            merchantId: merchantAddress,
            amount: String(amount),
            currency: String(currency),
        });

        if (orderId) {
            params.append('orderId', String(orderId));
        }

        if (returnUrl) {
            params.append('returnUrl', String(returnUrl));
        }

        const checkoutUrl = `${CHECKOUT_WIDGET_URL}?${params.toString()}`;

        res.json({
            success: true,
            checkoutUrl,
            params: {
                merchantAddress,
                amount: Number(amount),
                currency,
                orderId: orderId || null,
                widgetBaseUrl: CHECKOUT_WIDGET_URL
            }
        });
    } catch (error) {
        console.error('Error generating checkout link:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to generate checkout link'
        });
    }
});

export default router;
