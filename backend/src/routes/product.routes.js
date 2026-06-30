const express = require('express');
const pool = require('../config/db');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const AppError = require('../utils/app-error');
const { productSchema, idSchema, paginationSchema } = require('../validators/schemas');

const router = express.Router();
router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), asyncHandler(async (req, res) => {
    const { search, page, limit } = req.query;
    const offset = (page - 1) * limit;
    const result = await pool.query(
        `SELECT * FROM products
         WHERE $1 = '' OR name ILIKE $2 OR COALESCE(sku,'') ILIKE $2 OR COALESCE(category,'') ILIKE $2
         ORDER BY active DESC, name LIMIT $3 OFFSET $4`,
        [search, `%${search}%`, limit, offset]
    );
    const count = await pool.query(
        `SELECT COUNT(*)::integer AS total FROM products
         WHERE $1 = '' OR name ILIKE $2 OR COALESCE(sku,'') ILIKE $2 OR COALESCE(category,'') ILIKE $2`,
        [search, `%${search}%`]
    );
    res.json({ data: result.rows, pagination: { page, limit, total: count.rows[0].total } });
}));

router.post('/', authorize('admin', 'staff'), validate(productSchema), asyncHandler(async (req, res) => {
    const b = req.body;
    const result = await pool.query(
        `INSERT INTO products (sku,name,item_type,unit,price,category,active)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [b.sku,b.name,b.item_type,b.unit,b.price,b.category,b.active]
    );
    res.status(201).json({ data: result.rows[0] });
}));

router.put('/:id', authorize('admin', 'staff'), validate(idSchema, 'params'), validate(productSchema), asyncHandler(async (req, res) => {
    const b = req.body;
    const result = await pool.query(
        `UPDATE products SET sku=$1,name=$2,item_type=$3,unit=$4,price=$5,category=$6,active=$7
         WHERE id=$8 RETURNING *`,
        [b.sku,b.name,b.item_type,b.unit,b.price,b.category,b.active,req.params.id]
    );
    if (!result.rows[0]) throw new AppError(404, 'ไม่พบสินค้า/บริการ', 'PRODUCT_NOT_FOUND');
    res.json({ data: result.rows[0] });
}));

module.exports = router;
