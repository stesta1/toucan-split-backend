import { Router } from 'express';
import {
  getCreditCards,
  createCreditCard,
  getCreditCard,
  updateCreditCard,
  deleteCreditCard,
  addCreditExpense,
  deleteCreditExpense,
  setExpensePayment,
  advanceCreditCardsMonth,
} from '../controllers/creditCardsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', getCreditCards);
router.post('/', createCreditCard);
router.post('/advance-month', advanceCreditCardsMonth);
router.get('/:id', getCreditCard);
router.patch('/:id', updateCreditCard);
router.delete('/:id', deleteCreditCard);
router.post('/:id/expenses', addCreditExpense);
router.delete('/:id/expenses/:expenseId', deleteCreditExpense);
router.patch('/:id/expenses/:expenseId/payments', setExpensePayment);

export default router;
