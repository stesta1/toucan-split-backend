import { Router } from 'express';
import {
  getFriends,
  lookupUser,
  sendRequest,
  acceptRequest,
  deleteRequest,
  removeFriend,
} from '../controllers/friendsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', getFriends);
router.get('/lookup/:username', lookupUser);
router.post('/requests', sendRequest);
router.post('/requests/:id/accept', acceptRequest);
router.delete('/requests/:id', deleteRequest);
router.delete('/:userId', removeFriend);

export default router;
