import { Router } from 'express';
import { subscribe } from '../utils/live.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Conexión de avisos en vivo (Server-Sent Events). Ver utils/live.js.
router.get('/', requireAuth, subscribe);

export default router;
