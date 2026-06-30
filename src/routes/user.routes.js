const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const { userCreateSchema } = require('../validators/schemas');

const router = express.Router();
router.use(authenticate, authorize('admin'));

router.get('/', asyncHandler(async (_req, res) => {
    const result = await pool.query(`SELECT id,name,email,role,active,created_at FROM users ORDER BY active DESC,name`);
    res.json({ data: result.rows });
}));

router.post('/', validate(userCreateSchema), asyncHandler(async (req, res) => {
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const result = await pool.query(
        `INSERT INTO users (name,email,password_hash,role)
         VALUES ($1,LOWER($2),$3,$4)
         RETURNING id,name,email,role,active,created_at`,
        [req.body.name,req.body.email,passwordHash,req.body.role]
    );
    res.status(201).json({ data: result.rows[0] });
}));

module.exports = router;
