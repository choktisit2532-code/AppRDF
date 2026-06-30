const express = require('express');
const pool = require('../config/db');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const { settingsSchema } = require('../validators/schemas');

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (_req, res) => {
    const result = await pool.query('SELECT * FROM settings WHERE id=1');
    res.json({ data: result.rows[0] });
}));

router.put('/', authorize('admin'), validate(settingsSchema), asyncHandler(async (req, res) => {
    const b = req.body;
    const result = await pool.query(
        `UPDATE settings SET
          shop_name_th=$1,shop_name_en=$2,shop_owner=$3,shop_address=$4,
          shop_tax_id=$5,shop_phone=$6,shop_email=$7,scb_bank_details=$8,
          ktb_bank_details=$9,logo_url=$10,saved_signature_url=$11,
          numbering_config=$12::jsonb,feature_flags=$13::jsonb
         WHERE id=1 RETURNING *`,
        [b.shop_name_th,b.shop_name_en,b.shop_owner,b.shop_address,b.shop_tax_id,
         b.shop_phone,b.shop_email,b.scb_bank_details,b.ktb_bank_details,b.logo_url,
         b.saved_signature_url,JSON.stringify(b.numbering_config),JSON.stringify(b.feature_flags)]
    );
    res.json({ data: result.rows[0] });
}));

module.exports = router;
