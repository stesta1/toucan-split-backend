import { Router } from 'express';
import {
  getGroups,
  getGroup,
  createGroup,
  deleteGroup,
  addMembers,
  addExpense,
  updateExpense,
  deleteExpense,
  getSettlement,
  addPayment,
  setGroupMemberAdmin,
} from '../controllers/groupsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', getGroups);
router.post('/', createGroup);
router.get('/:id', getGroup);
router.delete('/:id', deleteGroup);
router.post('/:id/members', addMembers);
router.post('/:id/expenses', addExpense);
router.patch('/:id/expenses/:expenseId', updateExpense);
router.delete('/:id/expenses/:expenseId', deleteExpense);
router.get('/:id/settlement', getSettlement);
router.post('/:id/payments', addPayment);
router.patch('/:id/members/:memberId/admin', setGroupMemberAdmin);

export default router;
