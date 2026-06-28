const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoice.controller');
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');

router.post('/', verifyToken, authorizeRoles('admin', 'staff'), invoiceController.createInvoice);
router.get('/:id/pdf', verifyToken, invoiceController.generatePDF);

module.exports = router;