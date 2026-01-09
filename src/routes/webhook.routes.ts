import { Router } from 'express';
import { handleWebhook } from '../controllers/webhookController';

const router = Router();

// Main webhook endpoint (used by listener nodes)
router.post('/payment', handleWebhook);

// Alternative endpoint (legacy)
router.post('/payment-confirmation', handleWebhook);

export default router;
