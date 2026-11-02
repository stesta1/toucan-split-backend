import { Router } from 'express';
import {
  getUsers,
  createUser,
  setUserAdmin,
  setUserPassword,
  deleteUser,
  getGroups,
  getQuickSplits,
} from '../controllers/adminController.js';

const router = Router();

router.get('/users', getUsers);
router.post('/users', createUser);
router.patch('/users/:id', setUserAdmin);
router.patch('/users/:id/password', setUserPassword);
router.delete('/users/:id', deleteUser);

router.get('/groups', getGroups);
router.get('/quick-splits', getQuickSplits);

export default router;
