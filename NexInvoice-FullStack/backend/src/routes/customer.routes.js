import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { createCustomer, getCustomer, listCustomers } from '../controllers/customer.controller.js';

export const customerRouter = Router();
customerRouter.use(authenticate);
customerRouter.get('/', authorize('admin','staff','viewer'), asyncHandler(listCustomers));
customerRouter.get('/:id', authorize('admin','staff','viewer'), asyncHandler(getCustomer));
customerRouter.post('/', authorize('admin','staff'), asyncHandler(createCustomer));
