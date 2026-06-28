import { z } from 'zod';
import Decimal from 'decimal.js';
import { pool } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { writeAuditLog } from '../services/audit.service.js';

const documentTypes = ['repair_order','quotation','invoice','receipt','delivery_note','billing_note','deposit_receipt','credit_adjustment'];
const signatureModes = ['none','digital','blank'];
const prefixByType = {
  repair_order: 'JOB', quotation: 'QT', invoice: 'INV', receipt: 'RC',
  delivery_note: 'DN', billing_note: 'BILL', deposit_receipt: 'DEP', credit_adjustment: 'CR'
};

const money = z.coerce.number().finite().min(0).max(999999999999);
const itemSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  quantity: z.coerce.number().finite().positive().max(999999999),
  unitPrice: money
});

const createSchema = z.object({
  documentType: z.enum(documentTypes),
  customerId: z.coerce.number().int().positive(),
  relatedDocumentId: z.coerce.number().int().positive().nullable().optional(),
  issueDate: z.string().date().optional(),
  dueDate: z.string().date().nullable().optional(),
  discountAmount: money.default(0),
  notes: z.string().trim().max(5000).nullable().optional(),
  paymentMethod: z.string().trim().max(50).nullable().optional(),
  paymentReference: z.string().trim().max(255).nullable().optional(),
  signatureMode: z.enum(signatureModes).default('none'),
  items: z.array(itemSchema).min(1).max(200)
}).superRefine((data, ctx) => {
  if (data.dueDate && data.issueDate && data.dueDate < data.issueDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: 'วันครบกำหนดต้องไม่ก่อนวันออกเอกสาร' });
  }
});

const listSchema = z.object({
  type: z.enum(documentTypes).optional(),
  status: z.string().trim().max(30).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const statusSchema = z.object({ status: z.enum(['draft','sent','accepted','rejected','paid','partially_paid','cancelled','completed']) });

function toMoney(value) { return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP); }
function serializeDocument(row) {
  return {
    ...row,
    subtotal: Number(row.subtotal), discountAmount: Number(row.discountAmount), taxRate: Number(row.taxRate),
    taxAmount: Number(row.taxAmount), grandTotal: Number(row.grandTotal), paidAmount: Number(row.paidAmount),
    balanceDue: Number(row.balanceDue)
  };
}

const selectDocument = `
  d.id, d.document_type AS "documentType", d.document_number AS "documentNumber", d.status,
  d.customer_id AS "customerId", c.name AS "customerName", d.related_document_id AS "relatedDocumentId",
  d.issue_date AS "issueDate", d.due_date AS "dueDate", d.currency,
  d.subtotal::text, d.discount_amount::text AS "discountAmount", d.tax_enabled AS "taxEnabled",
  d.tax_rate::text AS "taxRate", d.tax_amount::text AS "taxAmount", d.grand_total::text AS "grandTotal",
  d.paid_amount::text AS "paidAmount", d.balance_due::text AS "balanceDue", d.notes,
  d.payment_method AS "paymentMethod", d.payment_reference AS "paymentReference",
  d.signature_mode AS "signatureMode", d.seller_name AS "sellerName", d.seller_address AS "sellerAddress",
  d.seller_phone AS "sellerPhone", d.seller_email AS "sellerEmail", d.seller_tax_id AS "sellerTaxId",
  d.seller_logo_storage_path AS "sellerLogoStoragePath", d.seller_signature_storage_path AS "sellerSignatureStoragePath",
  d.signer_name AS "signerName", d.signer_position AS "signerPosition", d.created_by AS "createdBy",
  d.created_at AS "createdAt", d.updated_at AS "updatedAt"
`;

export async function createDocument(req, res) {
  const input = createSchema.parse(req.body);
  const client = await pool.connect();
  let created;

  try {
    await client.query('BEGIN');
    const [companyResult, customerResult] = await Promise.all([
      client.query('SELECT * FROM company_settings WHERE id = 1 FOR SHARE'),
      client.query('SELECT id, name FROM customers WHERE id = $1', [input.customerId])
    ]);
    const company = companyResult.rows[0];
    if (!company) throw new AppError(500, 'ยังไม่ได้ตั้งค่าข้อมูลร้าน', 'COMPANY_SETTINGS_NOT_FOUND');
    if (!customerResult.rows[0]) throw new AppError(404, 'ไม่พบลูกค้า', 'CUSTOMER_NOT_FOUND');
    if (input.relatedDocumentId) {
      const related = await client.query('SELECT id FROM documents WHERE id = $1', [input.relatedDocumentId]);
      if (!related.rows[0]) throw new AppError(404, 'ไม่พบเอกสารอ้างอิง', 'RELATED_DOCUMENT_NOT_FOUND');
    }

    const calculatedItems = input.items.map((item, index) => {
      const lineTotal = toMoney(new Decimal(item.quantity).times(item.unitPrice));
      return { ...item, lineTotal, sortOrder: index };
    });
    const subtotal = toMoney(calculatedItems.reduce((sum, item) => sum.plus(item.lineTotal), new Decimal(0)));
    const discount = toMoney(input.discountAmount);
    if (discount.greaterThan(subtotal)) throw new AppError(400, 'ส่วนลดห้ามมากกว่ายอดรวมรายการ', 'DISCOUNT_EXCEEDS_SUBTOTAL');
    const taxableBase = subtotal.minus(discount);
    const taxEnabled = Boolean(company.is_vat_registered);
    const taxRate = taxEnabled ? new Decimal(company.default_tax_rate) : new Decimal(0);
    const taxAmount = taxEnabled ? toMoney(taxableBase.times(taxRate).dividedBy(100)) : new Decimal(0);
    const grandTotal = toMoney(taxableBase.plus(taxAmount));
    const paidAmount = input.documentType === 'receipt' || input.documentType === 'deposit_receipt' ? grandTotal : new Decimal(0);
    const balanceDue = grandTotal.minus(paidAmount);

    const numberResult = await client.query('SELECT generate_document_number($1) AS number', [prefixByType[input.documentType]]);
    const documentNumber = numberResult.rows[0].number;
    const signaturePath = input.signatureMode === 'digital' ? company.signature_storage_path : null;
    if (input.signatureMode === 'digital' && !signaturePath) {
      throw new AppError(400, 'ยังไม่ได้อัปโหลดลายเซ็นดิจิทัลในการตั้งค่าร้าน', 'SIGNATURE_NOT_CONFIGURED');
    }

    const insert = await client.query(
      `INSERT INTO documents (
        document_type, document_number, status, customer_id, related_document_id, issue_date, due_date,
        subtotal, discount_amount, tax_enabled, tax_rate, tax_amount, grand_total, paid_amount, balance_due,
        notes, payment_method, payment_reference, signature_mode,
        seller_name, seller_address, seller_phone, seller_email, seller_tax_id,
        seller_logo_storage_path, seller_signature_storage_path, signer_name, signer_position, created_by
      ) VALUES (
        $1,$2,'draft',$3,$4,COALESCE($5::date,CURRENT_DATE),$6,$7,$8,$9,$10,$11,$12,$13,$14,
        $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
      ) RETURNING id`,
      [input.documentType, documentNumber, input.customerId, input.relatedDocumentId ?? null, input.issueDate ?? null,
       input.dueDate ?? null, subtotal.toFixed(2), discount.toFixed(2), taxEnabled, taxRate.toFixed(2), taxAmount.toFixed(2),
       grandTotal.toFixed(2), paidAmount.toFixed(2), balanceDue.toFixed(2), input.notes ?? null, input.paymentMethod ?? null,
       input.paymentReference ?? null, input.signatureMode, company.company_name, company.address, company.phone,
       company.email, company.tax_id, company.logo_storage_path, signaturePath, company.signer_name, company.signer_position,
       req.user.id]
    );
    const documentId = insert.rows[0].id;

    for (const item of calculatedItems) {
      await client.query(
        `INSERT INTO document_items (document_id, description, quantity, unit_price, line_total, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [documentId, item.description, String(item.quantity), toMoney(item.unitPrice).toFixed(2), item.lineTotal.toFixed(2), item.sortOrder]
      );
    }

    if (input.relatedDocumentId) {
      await client.query(
        `INSERT INTO document_relations (source_document_id, target_document_id, relation_type)
         VALUES ($1,$2,'converted_to') ON CONFLICT DO NOTHING`,
        [input.relatedDocumentId, documentId]
      );
    }

    await writeAuditLog({ client, userId: req.user.id, action: 'DOCUMENT_CREATED', entityType: 'document', entityId: documentId,
      metadata: { documentType: input.documentType, documentNumber, customerId: input.customerId, grandTotal: grandTotal.toFixed(2), signatureMode: input.signatureMode }, ipAddress: req.ip });
    await client.query('COMMIT');

    const result = await pool.query(`SELECT ${selectDocument} FROM documents d JOIN customers c ON c.id=d.customer_id WHERE d.id=$1`, [documentId]);
    const items = await pool.query(`SELECT id, description, quantity::float8, unit_price::float8 AS "unitPrice", line_total::float8 AS "lineTotal", sort_order AS "sortOrder" FROM document_items WHERE document_id=$1 ORDER BY sort_order,id`, [documentId]);
    created = { ...serializeDocument(result.rows[0]), items: items.rows };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }

  req.app.get('io')?.emit('document:created', { id: created.id, documentType: created.documentType, documentNumber: created.documentNumber, grandTotal: created.grandTotal, createdAt: created.createdAt });
  res.status(201).json({ success: true, data: created });
}

export async function listDocuments(req, res) {
  const q = listSchema.parse(req.query);
  const conditions = []; const values = [];
  if (q.type) { values.push(q.type); conditions.push(`d.document_type=$${values.length}`); }
  if (q.status) { values.push(q.status); conditions.push(`d.status=$${values.length}`); }
  if (q.customerId) { values.push(q.customerId); conditions.push(`d.customer_id=$${values.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(q.limit, (q.page - 1) * q.limit);
  const result = await pool.query(`SELECT ${selectDocument}, COUNT(*) OVER()::int AS "totalCount" FROM documents d JOIN customers c ON c.id=d.customer_id ${where} ORDER BY d.created_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`, values);
  const total = result.rows[0]?.totalCount ?? 0;
  res.json({ success: true, data: result.rows.map(({ totalCount, ...r }) => serializeDocument(r)), pagination: { page:q.page, limit:q.limit, total, totalPages: Math.ceil(total/q.limit) } });
}

export async function getDocument(req, res) {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const result = await pool.query(`SELECT ${selectDocument} FROM documents d JOIN customers c ON c.id=d.customer_id WHERE d.id=$1`, [id]);
  if (!result.rows[0]) throw new AppError(404, 'ไม่พบเอกสาร', 'DOCUMENT_NOT_FOUND');
  const items = await pool.query(`SELECT id, description, quantity::float8, unit_price::float8 AS "unitPrice", line_total::float8 AS "lineTotal", sort_order AS "sortOrder" FROM document_items WHERE document_id=$1 ORDER BY sort_order,id`, [id]);
  res.json({ success:true, data:{ ...serializeDocument(result.rows[0]), items:items.rows } });
}

export async function updateDocumentStatus(req, res) {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const { status } = statusSchema.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT id,status,document_number FROM documents WHERE id=$1 FOR UPDATE', [id]);
    if (!before.rows[0]) throw new AppError(404, 'ไม่พบเอกสาร', 'DOCUMENT_NOT_FOUND');
    const result = await client.query('UPDATE documents SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,status,document_number AS "documentNumber",updated_at AS "updatedAt"', [status,id]);
    await writeAuditLog({ client,userId:req.user.id,action:'DOCUMENT_STATUS_UPDATED',entityType:'document',entityId:id,metadata:{ from:before.rows[0].status,to:status,documentNumber:before.rows[0].document_number },ipAddress:req.ip });
    await client.query('COMMIT');
    req.app.get('io')?.emit('document:status-updated', result.rows[0]);
    res.json({ success:true,data:result.rows[0] });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
