import { Router } from 'express';
import {
    createOrder,
    getOrder,
    listOrders,
    updateOrderStatus,
    fulfillOrder
} from '../controllers/orderController';

const router = Router();

router.post('/', createOrder);
router.get('/', listOrders);
router.get('/:orderId', getOrder);
router.patch('/:orderId/status', updateOrderStatus);
router.post('/:orderId/fulfill', fulfillOrder);

export default router;
