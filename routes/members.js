import { Router } from 'express';
import { getMembers } from '../controllers/membersController.js';

const router = Router();

router.get('/', getMembers);

export default router;
