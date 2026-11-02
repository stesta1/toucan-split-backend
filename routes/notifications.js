import { Router } from 'express';
import { getNotifications, getUnreadCount, markAllRead, deleteAll } from '../controllers/notificationsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.post('/mark-read', markAllRead);
router.delete('/', deleteAll);

export default router;
