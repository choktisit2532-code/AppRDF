const { z } = require('zod');

const optionalText = (max) => z.union([z.string().trim().max(max), z.literal(''), z.null()]).optional().transform((v) => v || null);
const decimalInput = z.union([
    z.number().finite().nonnegative(),
    z.string().trim().regex(/^\d+(\.\d{1,2})?$/)
]);
const positiveDecimalInput = z.union([
    z.number().finite().positive(),
    z.string().trim().regex(/^(?!0+(\.0+)?$)\d+(\.\d{1,2})?$/)
]);
const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const loginSchema = z.object({
    email: z.string().trim().email().max(255),
    password: z.string().min(8).max(200)
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const paginationSchema = z.object({
    search: z.string().trim().max(200).default(''),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50)
});

const customerSchema = z.object({
    code: optionalText(40),
    name: z.string().trim().min(1).max(180),
    customer_type: z.enum(['general', 'private', 'government']),
    tax_id: optionalText(30),
    branch_name: optionalText(120),
    address: optionalText(3000),
    email: z.union([z.string().trim().email().max(255), z.literal(''), z.null()]).optional().transform((v) => v || null),
    phone: optionalText(40),
    withholding_enabled: z.boolean().default(false),
    withholding_rate: decimalInput.default(3),
    withholding_basis: z.enum(['none', 'full', 'service']).default('full'),
    withholding_threshold: decimalInput.default(0),
    receipt_transfer_fee: decimalInput.default(0),
    active: z.boolean().default(true)
});

const productSchema = z.object({
    sku: optionalText(60),
    name: z.string().trim().min(1).max(220),
    item_type: z.enum(['product', 'service', 'travel', 'other']),
    unit: z.string().trim().min(1).max(50),
    price: decimalInput,
    category: optionalText(120),
    active: z.boolean().default(true)
});

const documentItemSchema = z.object({
    line_type: z.enum(['section', 'item', 'note']).default('item'),
    item_type: z.enum(['product', 'service', 'travel', 'other']).nullable().optional(),
    product_id: z.coerce.number().int().positive().nullable().optional(),
    description: z.string().trim().min(1).max(2000),
    quantity: positiveDecimalInput.nullable().optional(),
    unit: optionalText(50),
    unit_price: decimalInput.nullable().optional(),
    text_style: z.enum(['normal', 'bold', 'warning']).default('normal')
}).superRefine((item, ctx) => {
    if (item.line_type === 'item') {
        if (!item.item_type) ctx.addIssue({ code: 'custom', path: ['item_type'], message: 'กรุณาเลือกประเภทรายการ' });
        if (item.quantity == null) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'กรุณาระบุจำนวน' });
        if (item.unit_price == null) ctx.addIssue({ code: 'custom', path: ['unit_price'], message: 'กรุณาระบุราคา' });
    }
});

const documentCreateSchema = z.object({
    document_type: z.enum(['QT', 'IN', 'BN', 'RC', 'DO']),
    document_date: dateInput,
    due_date: z.union([dateInput, z.literal(''), z.null()]).optional().transform((v) => v || null),
    customer_id: z.coerce.number().int().positive(),
    discount: decimalInput.default(0),
    remarks: optionalText(5000),
    payment_terms: optionalText(1000),
    delivery_days: z.coerce.number().int().min(0).max(3650).nullable().optional(),
    quotation_validity_days: z.coerce.number().int().min(0).max(3650).nullable().optional(),
    source_document_ids: z.array(z.coerce.number().int().positive()).max(100).default([]),
    items: z.array(documentItemSchema).max(200).default([])
}).superRefine((data, ctx) => {
    if (data.due_date && data.due_date < data.document_date) {
        ctx.addIssue({ code: 'custom', path: ['due_date'], message: 'วันครบกำหนดต้องไม่ก่อนวันที่เอกสาร' });
    }
    if (data.items.length === 0 && data.source_document_ids.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['items'], message: 'ต้องมีรายการหรือเอกสารต้นทางอย่างน้อยหนึ่งรายการ' });
    }
});

const documentListSchema = paginationSchema.extend({
    type: z.enum(['QT', 'IN', 'BN', 'RC', 'DO']).optional(),
    status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'PAID', 'CANCELLED', 'OVERDUE']).optional(),
    customer_id: z.coerce.number().int().positive().optional(),
    month: z.string().regex(/^\d{4}-\d{2}$/).optional()
});

const documentStatusSchema = z.object({
    status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'PAID', 'CANCELLED', 'OVERDUE'])
});

const sourceQuerySchema = z.object({
    target_type: z.enum(['QT', 'IN', 'BN', 'RC', 'DO']),
    customer_id: z.coerce.number().int().positive()
});

const monthSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });

const settingsSchema = z.object({
    shop_name_th: z.string().trim().min(1).max(200),
    shop_name_en: z.string().trim().min(1).max(200),
    shop_owner: optionalText(200),
    shop_address: optionalText(3000),
    shop_tax_id: optionalText(30),
    shop_phone: optionalText(40),
    shop_email: z.union([z.string().trim().email().max(255), z.literal(''), z.null()]).optional().transform((v) => v || null),
    scb_bank_details: optionalText(2000),
    ktb_bank_details: optionalText(2000),
    logo_url: optionalText(2000),
    saved_signature_url: optionalText(2000),
    numbering_config: z.record(z.string(), z.object({
        prefix: z.string().max(10),
        digits: z.coerce.number().int().min(1).max(8),
        period: z.enum(['BYYMM', 'BYY', 'MMBYY', 'NONE']),
        separator: z.string().max(3)
    })),
    feature_flags: z.object({
        realtime: z.boolean().default(false),
        automatic_backup: z.boolean().default(false),
        email_notifications: z.boolean().default(false)
    })
});

const userCreateSchema = z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(255),
    password: z.string().min(12).max(200),
    role: z.enum(['admin', 'staff', 'viewer'])
});

module.exports = {
    loginSchema, idSchema, paginationSchema, customerSchema, productSchema,
    documentCreateSchema, documentListSchema, documentStatusSchema,
    sourceQuerySchema, monthSchema, settingsSchema, userCreateSchema
};
