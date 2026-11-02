import { Router } from 'express';
import {
  register,
  forgotPassword,
  login,
  logout,
  me,
  updateProfile,
  dismissHint,
  changePassword,
  uploadAvatar,
  deleteAvatar,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadAvatarMiddleware } from '../middleware/upload.js';

const router = Router();

router.post('/register', register);
router.post('/forgot-password', forgotPassword);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, updateProfile);
router.post('/me/dismiss-hint', requireAuth, dismissHint);
router.post('/change-password', requireAuth, changePassword);
router.post('/me/avatar', requireAuth, uploadAvatarMiddleware, uploadAvatar);
router.delete('/me/avatar', requireAuth, deleteAvatar);

export default router;
