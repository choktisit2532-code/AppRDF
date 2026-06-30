const express = require('express');
const pool = require('../config/db');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const AppError = require('../utils/app-error');
const { writeAudit } = require('../services/audit.service');
const { customerSchema, idSchema, paginationSchema } = require('../validators/schemas');

const router = express.Router();
router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), asyncHandler(async (req, res) => {
    const { search, page, limit } = req.query;
    const offset = (page - 1) * limit;
    const result = await pool.query(
        `SELECT * FROM customers
         WHERE $1 = '' OR name ILIKE $2 OR COALESCE(code,'') ILIKE $2 OR COALESCE(tax_id,'') ILIKE $2
         ORDER BY active DESC, name
         LIMIT $3 OFFSET $4`,
        [search, `%${search}%`, limit, offset]
    );
    const count = await pool.query(
        `SELECT COUNT(*)::integer AS total FROM customers
         WHERE $1 = '' OR name ILIKE $2 OR COALESCE(code,'') ILIKE $2 OR COALESCE(tax_id,'') ILIKE $2`,
        [search, `%${search}%`]
    );
    res.json({ data: result.rows, pagination: { page, limit, total: count.rows[0].total } });
}));

router.post('/', authorize('admin', 'staff'), validate(customerSchema), asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const b = req.body;
        const result = await client.query(
            `INSERT INTO customers (
                code,name,customer_type,tax_id,branch_name,address,email,phone,
                withholding_enabled,withholding_rate,withholding_basis,
                withholding_threshold,receipt_transfer_fee,active
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             RETURNING *`,
            [b.code,b.name,b.customer_type,b.tax_id,b.branch_name,b.address,b.email,b.phone,
             b.withholding_enabled,b.withholding_rate,b.withholding_basis,
             b.withholding_threshold,b.receipt_transfer_fee,b.active]
        );
        await writeAudit(client, { userId: req.user.id, action: 'CREATE', entityType: 'customer', entityId: result.rows[0].id, details: { name: b.name } });
        await client.query('COMMIT');
        res.status(201).json({ data: result.rows[0] });
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
    finally { client.release(); }
}));

router.put('/:id', authorize('admin', 'staff'), validate(idSchema, 'params'), validate(customerSchema), asyncHandler(async (req, res) => {
    const b = req.body;
    const result = await pool.query(
        `UPDATE customers SET
            code=$1,name=$2,customer_type=$3,tax_id=$4,branch_name=$5,address=$6,
            email=$7,phone=$8,withholding_enabled=$9,withholding_rate=$10,
            withholding_basis=$11,withholding_threshold=$12,receipt_transfer_fee=$13,
            active=$14
         WHERE id=$15 RETURNING *`,
        [b.code,b.name,b.customer_type,b.tax_id,b.branch_name,b.address,b.email,b.phone,
         b.withholding_enabled,b.withholding_rate,b.withholding_basis,b.withholding_threshold,
         b.receipt_transfer_fee,b.active,req.params.id]
    );
    if (!result.rows[0]) throw new AppError(404, 'ไม่พบลูกค้า', 'CUSTOMER_NOT_FOUND');
    res.json({ data: result.rows[0] });
}));

module.exports = router;
