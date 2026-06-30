const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/async-handler');

const router = express.Router();
router.get('/', asyncHandler(async (_req, res) => {
    const result = await pool.query('SELECT NOW() AS database_time');
    res.json({ status: 'ok', service: 'Tong Service IT Billing API', version: '3.4.0', database_time: result.rows[0].database_time });
}));
module.exports = router;
