import { z } from 'zod';
import { pool } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { writeAuditLog } from '../services/audit.service.js';

const nullableText = (max) => z.union([z.string().trim().max(max), z.null()]).optional();

const updateSchema = z.object({
  companyName: z.string().trim().min(1).max(255).optional(),
  address: nullableText(3000),
  phone: nullableText(50),
  email: z.union([z.string().trim().email(), z.literal(''), z.null()]).optional(),
  taxId: nullableText(50),
  logoStoragePath: nullableText(1000),
  signatureStoragePath: nullableText(1000),
  signerName: nullableText(255),
  signerPosition: nullableText(255),
  isVatRegistered: z.boolean().optional(),
  defaultTaxRate: z.coerce.number().min(0).max(100).optional()
}).superRefine((data, ctx) => {
  if (data.isVatRegistered === false && data.defaultTaxRate !== undefined && data.defaultTaxRate !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultTaxRate'], message: 'เมื่อยังไม่จด VAT อัตราเริ่มต้นต้องเป็น 0' });
  }
});

const selectFields = `
  id,
  company_name AS "companyName",
  address,
  phone,
  email,
  tax_id AS "taxId",
  logo_storage_path AS "logoStoragePath",
  signature_storage_path AS "signatureStoragePath",
  signer_name AS "signerName",
  signer_position AS "signerPosition",
  is_vat_registered AS "isVatRegistered",
  default_tax_rate::float8 AS "defaultTaxRate",
  updated_at AS "updatedAt",
  updated_by AS "updatedBy"
`;

export async function getCompanySettings(_req, res) {
  const result = await pool.query(`SELECT ${selectFields} FROM company_settings WHERE id = 1`);
  if (!result.rows[0]) throw new AppError(404, 'ไม่พบข้อมูลร้าน', 'COMPANY_SETTINGS_NOT_FOUND');
  res.json({ success: true, data: result.rows[0] });
}

export async function updateCompanySettings(req, res) {
  const input = updateSchema.parse(req.body);
  if (Object.keys(input).length === 0) throw new AppError(400, 'ไม่มีข้อมูลที่ต้องการแก้ไข', 'EMPTY_UPDATE');

  const map = {
    companyName: 'company_name', address: 'address', phone: 'phone', email: 'email',
    taxId: 'tax_id', logoStoragePath: 'logo_storage_path',
    signatureStoragePath: 'signature_storage_path', signerName: 'signer_name',
    signerPosition: 'signer_position', isVatRegistered: 'is_vat_registered',
    defaultTaxRate: 'default_tax_rate'
  };

  const entries = Object.entries(input).map(([key, value]) => [map[key], value === '' ? null : value]);
  const setSql = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
  const values = entries.map(([, value]) => value);
  values.push(req.user.id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const beforeResult = await client.query(`SELECT ${selectFields} FROM company_settings WHERE id = 1 FOR UPDATE`);
    const before = beforeResult.rows[0];
    if (!before) throw new AppError(404, 'ไม่พบข้อมูลร้าน', 'COMPANY_SETTINGS_NOT_FOUND');

    const result = await client.query(
      `UPDATE company_settings
       SET ${setSql}, updated_by = $${values.length}, updated_at = NOW()
       WHERE id = 1
       RETURNING ${selectFields}`,
      values
    );

    await writeAuditLog({
      client,
      userId: req.user.id,
      action: 'COMPANY_SETTINGS_UPDATED',
      entityType: 'company_settings',
      entityId: 1,
      metadata: { changedFields: Object.keys(input), before, after: result.rows[0] },
      ipAddress: req.ip
    });

    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
