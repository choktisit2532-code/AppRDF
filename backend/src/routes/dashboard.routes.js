const express = require('express');
const pool = require('../config/db');
const authenticate = require('../middleware/auth');
const asyncHandler = require('../utils/async-handler');

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (_req, res) => {
    const [stats, recent, overdue] = await Promise.all([
        pool.query(`
            SELECT
              COALESCE(SUM(net_total) FILTER (WHERE document_type='RC' AND document_date >= date_trunc('month', CURRENT_DATE)),0) AS monthly_income,
              COALESCE(SUM(grand_total) FILTER (WHERE document_type IN ('IN','BN') AND status IN ('PENDING','APPROVED','OVERDUE')),0) AS outstanding,
              COALESCE(SUM(withholding_amount) FILTER (WHERE document_date >= date_trunc('year', CURRENT_DATE)),0) AS yearly_withholding,
              COALESCE(SUM(transfer_fee) FILTER (WHERE document_date >= date_trunc('year', CURRENT_DATE)),0) AS yearly_transfer_fee
            FROM documents WHERE status <> 'CANCELLED'
        `),
        pool.query(`
            SELECT d.id,d.document_number,d.document_type,d.document_date,d.grand_total,d.status,c.name AS customer_name
            FROM documents d JOIN customers c ON c.id=d.customer_id
            ORDER BY d.document_date DESC,d.id DESC LIMIT 8
        `),
        pool.query(`
            SELECT d.id,d.document_number,d.due_date,d.grand_total,c.name AS customer_name
            FROM documents d JOIN customers c ON c.id=d.customer_id
            WHERE d.due_date < CURRENT_DATE AND d.status IN ('PENDING','APPROVED','OVERDUE')
            ORDER BY d.due_date LIMIT 8
        `)
    ]);
    res.json({ stats: stats.rows[0], recent: recent.rows, overdue: overdue.rows });
}));

module.exports = router;
