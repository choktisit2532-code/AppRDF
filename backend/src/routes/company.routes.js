import { Router } from 'express';
import { getCompanySettings, updateCompanySettings } from '../controllers/company.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

export const companyRouter = Router();
companyRouter.use(authenticate);
companyRouter.get('/', asyncHandler(getCompanySettings));
companyRouter.patch('/', authorize('admin'), asyncHandler(updateCompanySettings));
