const express = require('express');
const multer = require('multer');
const pool = require('../config/db');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const AppError = require('../utils/app-error');
const { settingsSchema } = require('../validators/schemas');

const router = express.Router();
router.use(authenticate);

const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024, files: 1 },
    fileFilter(_req, file, callback) {
        if (!ALLOWED_LOGO_TYPES.has(file.mimetype)) {
            return callback(new AppError(400, 'รองรับโลโก้เฉพาะไฟล์ PNG, JPG/JPEG และ WebP', 'INVALID_LOGO_TYPE'));
        }
        callback(null, true);
    }
});

function hasValidImageSignature(file) {
    const buffer = file.buffer;
    if (file.mimetype === 'image/png') {
        return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]));
    }
    if (file.mimetype === 'image/jpeg') {
        return buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    }
    if (file.mimetype === 'image/webp') {
        return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    return false;
}

router.get('/', asyncHandler(async (_req, res) => {
    const result = await pool.query('SELECT * FROM settings WHERE id=1');
    res.json({ data: result.rows[0] });
}));

router.post('/logo', authorize('admin'), upload.single('logo'), asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError(400, 'กรุณาเลือกไฟล์โลโก้', 'LOGO_REQUIRED');
    if (!hasValidImageSignature(req.file)) {
        throw new AppError(400, 'เนื้อหาไฟล์โลโก้ไม่ตรงกับประเภทไฟล์ที่เลือก', 'INVALID_LOGO_CONTENT');
    }

    const logoSource = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const result = await pool.query(
        'UPDATE settings SET logo_url=$1 WHERE id=1 RETURNING *',
        [logoSource]
    );
    res.set('Cache-Control', 'no-store');
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
