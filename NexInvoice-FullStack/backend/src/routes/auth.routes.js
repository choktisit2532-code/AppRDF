import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, me } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'TOO_MANY_LOGIN_ATTEMPTS', message: 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง' } }
});

authRouter.post('/login', loginLimiter, asyncHandler(login));
authRouter.get('/me', authenticate, asyncHandler(me));
