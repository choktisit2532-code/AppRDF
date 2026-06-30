const express = require('express');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const {
    documentCreateSchema, documentListSchema, documentStatusSchema,
    sourceQuerySchema, idSchema
} = require('../validators/schemas');
const {
    createDocument, getDocumentById, listDocuments,
    listAvailableSources, updateDocumentStatus
} = require('../services/document.service');

const router = express.Router();
router.use(authenticate);

router.get('/', validate(documentListSchema, 'query'), asyncHandler(async (req, res) => {
    res.json(await listDocuments(req.query));
}));

router.get('/sources', validate(sourceQuerySchema, 'query'), asyncHandler(async (req, res) => {
    res.json({ data: await listAvailableSources(req.query) });
}));

router.get('/:id', validate(idSchema, 'params'), asyncHandler(async (req, res) => {
    res.json({ data: await getDocumentById(req.params.id) });
}));

router.post('/', authorize('admin', 'staff'), validate(documentCreateSchema), asyncHandler(async (req, res) => {
    const data = await createDocument({ body: req.body, userId: req.user.id });
    res.status(201).json({ data });
}));

router.patch('/:id/status', authorize('admin', 'staff'), validate(idSchema, 'params'), validate(documentStatusSchema), asyncHandler(async (req, res) => {
    const data = await updateDocumentStatus({ id: req.params.id, status: req.body.status, userId: req.user.id });
    res.json({ data });
}));

module.exports = router;
