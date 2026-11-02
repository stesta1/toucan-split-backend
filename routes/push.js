import { Router } from 'express';
import { getVapidPublicKey, subscribe, unsubscribe } from '../controllers/pushController.js';
import { registerExpoToken, unregisterExpoToken } from '../controllers/expoPushController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/vapid-public-key', getVapidPublicKey);
router.post('/subscribe', requireAuth, subscribe);
router.post('/unsubscribe', requireAuth, unsubscribe);

// Push nativo (mobile / Expo) — independiente de las suscripciones Web Push de arriba.
router.post('/expo/register', requireAuth, registerExpoToken);
router.post('/expo/unregister', requireAuth, unregisterExpoToken);

export default router;
