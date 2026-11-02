import { Router } from 'express';
import {
  createQuickSplit,
  getMyQuickSplits,
  getQuickSplit,
  deleteQuickSplit,
} from '../controllers/quickSplitsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/', requireAuth, createQuickSplit);
router.get('/', requireAuth, getMyQuickSplits);
router.get('/:id', getQuickSplit); // sin requireAuth: se comparte por link a gente sin cuenta
router.delete('/:id', requireAuth, deleteQuickSplit);

export default router;
