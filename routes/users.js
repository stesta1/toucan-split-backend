import { Router } from 'express';
import { getUsers } from '../controllers/usersController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, getUsers);

export default router;
