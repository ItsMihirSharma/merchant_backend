import { Router } from 'express';
import { login, getStats, getConfig, updateConfig } from '../controllers/adminController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post('/login', login);
router.get('/stats', authMiddleware, getStats);
router.get('/config', authMiddleware, getConfig);
router.put('/config', authMiddleware, updateConfig);

export default router;
