import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { createDocument, getDocument, listDocuments, updateDocumentStatus } from '../controllers/document.controller.js';

export const documentRouter = Router();
documentRouter.use(authenticate);
documentRouter.get('/', authorize('admin','staff','viewer'), asyncHandler(listDocuments));
documentRouter.get('/:id', authorize('admin','staff','viewer'), asyncHandler(getDocument));
documentRouter.post('/', authorize('admin','staff'), asyncHandler(createDocument));
documentRouter.patch('/:id/status', authorize('admin','staff'), asyncHandler(updateDocumentStatus));
