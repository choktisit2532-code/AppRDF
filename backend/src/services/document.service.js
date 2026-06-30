const pool = require('../config/db');
const AppError = require('../utils/app-error');
const { calculateDocumentTotals } = require('../utils/money');
const { assertDocumentTypeAllowed, allowedSourceTypes } = require('../utils/document-rules');
const { formatPeriod, formatDocumentNumber } = require('../utils/document-number');
const { writeAudit } = require('./audit.service');

async function getSettings(client = pool) {
    const result = await client.query('SELECT * FROM settings WHERE id = 1');
    return result.rows[0];
}

async function nextDocumentNumber(client, documentType, documentDate, numberingConfig) {
    const config = numberingConfig[documentType] || {
        prefix: documentType,
        digits: 3,
        period: 'BYYMM',
        separator: '-'
    };
    const periodKey = formatPeriod(documentDate, config.period);
    const counterResult = await client.query(
        `INSERT INTO document_counters (document_type, period_key, last_number)
         VALUES ($1, $2, 1)
         ON CONFLICT (document_type, period_key)
         DO UPDATE SET last_number = document_counters.last_number + 1, updated_at = NOW()
         RETURNING last_number`,
        [documentType, periodKey]
    );
    return formatDocumentNumber({
        config,
        sequence: counterResult.rows[0].last_number,
        periodKey
    });
}

async function getSourceDocuments(client, ids) {
    if (!ids.length) return [];
    const result = await client.query(
        `SELECT d.*, c.customer_type
         FROM documents d
         JOIN customers c ON c.id = d.customer_id
         WHERE d.id = ANY($1::bigint[])
         ORDER BY d.document_date, d.id
         FOR UPDATE OF d`,
        [ids]
    );
    if (result.rows.length !== ids.length) {
        throw new AppError(404, 'ไม่พบเอกสารต้นทางบางรายการ', 'SOURCE_DOCUMENT_NOT_FOUND');
    }
    return result.rows;
}

async function getItemsForDocument(client, documentId) {
    const result = await client.query(
        `SELECT line_type, item_type, product_id, description, quantity, unit,
                unit_price, text_style
         FROM document_items
         WHERE document_id = $1
         ORDER BY sort_order`,
        [documentId]
    );
    return result.rows;
}

function aggregateSourceItems(sourceDocuments, label) {
    return sourceDocuments.map((source) => ({
        line_type: 'item',
        item_type: 'other',
        product_id: null,
        description: `${label} ${source.document_number}`,
        quantity: '1',
        unit: 'ฉบับ',
        unit_price: source.grand_total,
        text_style: 'normal'
    }));
}

async function resolveItems(client, body, sources) {
    if (body.items.length) return body.items;
    if (!sources.length) return [];

    if (body.document_type === 'BN') {
        return aggregateSourceItems(sources, 'ยอดตามใบแจ้งหนี้');
    }
    if (body.document_type === 'RC' && sources.length > 1) {
        return aggregateSourceItems(sources, 'รับชำระตามเอกสาร');
    }
    return getItemsForDocument(client, sources[0].id);
}

async function updateRelatedWorkflow(client, target, sources) {
    for (const source of sources) {
        let relationType = 'CONVERTED_TO';
        if (target.document_type === 'BN') relationType = 'INCLUDED_IN';
        if (target.document_type === 'RC') relationType = 'PAID_BY';

        await client.query(
            `INSERT INTO document_relations
                (source_document_id, target_document_id, relation_type)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [source.id, target.id, relationType]
        );

        if (source.document_type === 'QT' && ['IN', 'DO', 'RC'].includes(target.document_type)) {
            await client.query(
                `UPDATE documents SET status = 'APPROVED', updated_by = $1 WHERE id = $2 AND status <> 'CANCELLED'`,
                [target.created_by, source.id]
            );
        }
        if (source.document_type === 'IN' && target.document_type === 'RC') {
            await client.query(
                `UPDATE documents SET status = 'PAID', updated_by = $1 WHERE id = $2 AND status <> 'CANCELLED'`,
                [target.created_by, source.id]
            );
        }
    }

    if (target.document_type === 'RC') {
        await client.query(
            `UPDATE documents bn
             SET status = 'PAID', updated_by = $1
             WHERE bn.document_type = 'BN'
               AND bn.status NOT IN ('PAID', 'CANCELLED')
               AND EXISTS (
                   SELECT 1 FROM document_relations r
                   WHERE r.target_document_id = bn.id AND r.relation_type = 'INCLUDED_IN'
               )
               AND NOT EXISTS (
                   SELECT 1
                   FROM document_relations r
                   JOIN documents inv ON inv.id = r.source_document_id
                   WHERE r.target_document_id = bn.id
                     AND r.relation_type = 'INCLUDED_IN'
                     AND inv.status <> 'PAID'
               )`,
            [target.created_by]
        );
    }
}

async function createDocument({ body, userId }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const customerResult = await client.query(
            `SELECT * FROM customers WHERE id = $1 AND active = TRUE FOR SHARE`,
            [body.customer_id]
        );
        const customer = customerResult.rows[0];
        if (!customer) throw new AppError(404, 'ไม่พบลูกค้า', 'CUSTOMER_NOT_FOUND');
        if (!assertDocumentTypeAllowed(customer.customer_type, body.document_type)) {
            throw new AppError(400, 'ประเภทลูกค้านี้ไม่รองรับเอกสารที่เลือก', 'DOCUMENT_TYPE_NOT_ALLOWED');
        }

        const sources = await getSourceDocuments(client, body.source_document_ids);
        const allowedSources = allowedSourceTypes(customer.customer_type, body.document_type);
        for (const source of sources) {
            if (Number(source.customer_id) !== Number(customer.id)) {
                throw new AppError(400, 'เอกสารต้นทางต้องเป็นของลูกค้ารายเดียวกัน', 'SOURCE_CUSTOMER_MISMATCH');
            }
            if (!allowedSources.includes(source.document_type)) {
                throw new AppError(400, `ไม่สามารถใช้ ${source.document_type} เป็นเอกสารต้นทางได้`, 'INVALID_SOURCE_TYPE');
            }
            if (source.status === 'CANCELLED') {
                throw new AppError(400, 'ไม่สามารถใช้เอกสารที่ยกเลิกแล้ว', 'SOURCE_CANCELLED');
            }
        }

        const resolvedItems = await resolveItems(client, body, sources);
        if (!resolvedItems.length) {
            throw new AppError(400, 'กรุณาเพิ่มรายการสินค้า/บริการ', 'ITEMS_REQUIRED');
        }

        const totals = calculateDocumentTotals({
            items: resolvedItems,
            discount: body.discount,
            customer,
            documentType: body.document_type
        });
        const settings = await getSettings(client);
        const documentNumber = await nextDocumentNumber(
            client,
            body.document_type,
            body.document_date,
            settings.numbering_config
        );
        const snapshot = {
            code: customer.code,
            name: customer.name,
            customer_type: customer.customer_type,
            tax_id: customer.tax_id,
            branch_name: customer.branch_name,
            address: customer.address,
            email: customer.email,
            phone: customer.phone
        };

        const documentResult = await client.query(
            `INSERT INTO documents (
                document_number, document_type, status, document_date, due_date,
                customer_id, customer_snapshot, product_subtotal, service_subtotal,
                other_subtotal, subtotal, discount, grand_total, withholding_rate,
                withholding_base, withholding_amount, transfer_fee, net_total,
                remarks, payment_terms, delivery_days, quotation_validity_days,
                created_by, updated_by
             ) VALUES (
                $1,$2,'PENDING',$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,
                $14,$15,$16,$17,$18,$19,$20,$21,$22,$22
             ) RETURNING *`,
            [
                documentNumber, body.document_type, body.document_date, body.due_date,
                customer.id, JSON.stringify(snapshot), totals.productSubtotal,
                totals.serviceSubtotal, totals.otherSubtotal, totals.subtotal,
                totals.discount, totals.grandTotal, totals.withholdingRate,
                totals.withholdingBase, totals.withholdingAmount, totals.transferFee,
                totals.netTotal, body.remarks, body.payment_terms,
                body.delivery_days ?? null, body.quotation_validity_days ?? null, userId
            ]
        );
        const document = documentResult.rows[0];

        for (const item of totals.items) {
            await client.query(
                `INSERT INTO document_items (
                    document_id, sort_order, line_type, item_type, product_id,
                    description, quantity, unit, unit_price, line_total, text_style
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [
                    document.id, item.sort_order, item.line_type, item.item_type,
                    item.product_id, item.description, item.quantity, item.unit,
                    item.unit_price, item.line_total, item.text_style
                ]
            );
        }

        await updateRelatedWorkflow(client, document, sources);
        await writeAudit(client, {
            userId,
            action: 'CREATE',
            entityType: 'document',
            entityId: document.id,
            details: {
                number: document.document_number,
                type: document.document_type,
                grandTotal: document.grand_total,
                sourceDocumentIds: body.source_document_ids
            }
        });

        await client.query('COMMIT');
        return getDocumentById(document.id);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function getDocumentById(id) {
    const documentResult = await pool.query(
        `SELECT d.*, c.name AS customer_name, u.name AS created_by_name
         FROM documents d
         JOIN customers c ON c.id = d.customer_id
         JOIN users u ON u.id = d.created_by
         WHERE d.id = $1`,
        [id]
    );
    const document = documentResult.rows[0];
    if (!document) throw new AppError(404, 'ไม่พบเอกสาร', 'DOCUMENT_NOT_FOUND');

    const [itemsResult, relationsResult, signaturesResult, settings] = await Promise.all([
        pool.query(`SELECT * FROM document_items WHERE document_id = $1 ORDER BY sort_order`, [id]),
        pool.query(
            `SELECT r.*, s.document_number AS source_number, s.document_type AS source_type,
                    t.document_number AS target_number, t.document_type AS target_type
             FROM document_relations r
             JOIN documents s ON s.id = r.source_document_id
             JOIN documents t ON t.id = r.target_document_id
             WHERE r.source_document_id = $1 OR r.target_document_id = $1
             ORDER BY r.id`,
            [id]
        ),
        pool.query(`SELECT * FROM document_signatures WHERE document_id = $1 ORDER BY id`, [id]),
        getSettings()
    ]);

    return {
        ...document,
        items: itemsResult.rows,
        relations: relationsResult.rows,
        signatures: signaturesResult.rows,
        settings
    };
}

async function listDocuments(query) {
    const offset = (query.page - 1) * query.limit;
    const params = [];
    const conditions = [];

    if (query.search) {
        params.push(`%${query.search}%`);
        conditions.push(`(d.document_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
    }
    if (query.type) {
        params.push(query.type);
        conditions.push(`d.document_type = $${params.length}`);
    }
    if (query.status) {
        params.push(query.status);
        conditions.push(`d.status = $${params.length}`);
    }
    if (query.customer_id) {
        params.push(query.customer_id);
        conditions.push(`d.customer_id = $${params.length}`);
    }
    if (query.month) {
        params.push(`${query.month}-01`);
        conditions.push(`d.document_date >= $${params.length}::date AND d.document_date < ($${params.length}::date + INTERVAL '1 month')`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(query.limit, offset);
    const dataResult = await pool.query(
        `SELECT d.id, d.document_number, d.document_type, d.status, d.document_date,
                d.due_date, d.grand_total, d.net_total, d.withholding_amount,
                d.transfer_fee, c.name AS customer_name, c.customer_type
         FROM documents d
         JOIN customers c ON c.id = d.customer_id
         ${where}
         ORDER BY d.document_date DESC, d.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );

    const countParams = params.slice(0, -2);
    const countResult = await pool.query(
        `SELECT COUNT(*)::integer AS total
         FROM documents d JOIN customers c ON c.id = d.customer_id ${where}`,
        countParams
    );

    return {
        data: dataResult.rows,
        pagination: { page: query.page, limit: query.limit, total: countResult.rows[0].total }
    };
}

async function listAvailableSources({ target_type, customer_id }) {
    const customerResult = await pool.query('SELECT customer_type FROM customers WHERE id = $1', [customer_id]);
    const customer = customerResult.rows[0];
    if (!customer) throw new AppError(404, 'ไม่พบลูกค้า', 'CUSTOMER_NOT_FOUND');
    const types = allowedSourceTypes(customer.customer_type, target_type);
    if (!types.length) return [];

    const result = await pool.query(
        `SELECT id, document_number, document_type, status, document_date, due_date, grand_total
         FROM documents
         WHERE customer_id = $1
           AND document_type = ANY($2::varchar[])
           AND status NOT IN ('CANCELLED', 'PAID')
         ORDER BY document_date DESC, id DESC
         LIMIT 100`,
        [customer_id, types]
    );
    return result.rows;
}

const allowedTransitions = {
    DRAFT: ['PENDING', 'CANCELLED'],
    PENDING: ['APPROVED', 'PAID', 'OVERDUE', 'CANCELLED'],
    APPROVED: ['PAID', 'OVERDUE', 'CANCELLED'],
    OVERDUE: ['PAID', 'CANCELLED'],
    PAID: [],
    CANCELLED: []
};

async function updateDocumentStatus({ id, status, userId }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const currentResult = await client.query(
            `SELECT * FROM documents WHERE id = $1 FOR UPDATE`,
            [id]
        );
        const current = currentResult.rows[0];
        if (!current) throw new AppError(404, 'ไม่พบเอกสาร', 'DOCUMENT_NOT_FOUND');
        if (current.status !== status && !allowedTransitions[current.status].includes(status)) {
            throw new AppError(409, `ไม่สามารถเปลี่ยนสถานะจาก ${current.status} เป็น ${status}`, 'INVALID_STATUS_TRANSITION');
        }
        await client.query(`UPDATE documents SET status = $1, updated_by = $2 WHERE id = $3`, [status, userId, id]);
        await writeAudit(client, {
            userId,
            action: 'UPDATE_STATUS',
            entityType: 'document',
            entityId: id,
            details: { number: current.document_number, from: current.status, to: status }
        });
        await client.query('COMMIT');
        return getDocumentById(id);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    createDocument,
    getDocumentById,
    listDocuments,
    listAvailableSources,
    updateDocumentStatus,
    getSettings
};
