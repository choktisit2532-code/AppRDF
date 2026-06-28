import { z } from 'zod';
import { pool } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { writeAuditLog } from '../services/audit.service.js';

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.union([z.string().trim().email(), z.literal(''), z.null()]).optional(),
  phone: z.union([z.string().trim().max(50), z.null()]).optional(),
  address: z.union([z.string().trim().max(3000), z.null()]).optional()
});

export async function createCustomer(req, res) {
  const input = createSchema.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO customers (name,email,phone,address)
       VALUES ($1,$2,$3,$4)
       RETURNING id,name,email,phone,address,created_at AS "createdAt",updated_at AS "updatedAt"`,
      [input.name, input.email || null, input.phone || null, input.address || null]
    );
    await writeAuditLog({ client,userId:req.user.id,action:'CUSTOMER_CREATED',entityType:'customer',entityId:result.rows[0].id,metadata:{ name:input.name },ipAddress:req.ip });
    await client.query('COMMIT');
    res.status(201).json({ success:true,data:result.rows[0] });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function listCustomers(req, res) {
  const search = z.string().trim().max(255).optional().parse(req.query.search);
  const limit = z.coerce.number().int().min(1).max(100).default(30).parse(req.query.limit);
  const values = [];
  let where = '';
  if (search) { values.push(`%${search}%`); where = `WHERE name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1`; }
  values.push(limit);
  const result = await pool.query(
    `SELECT id,name,email,phone,address,created_at AS "createdAt",updated_at AS "updatedAt"
     FROM customers ${where} ORDER BY name ASC LIMIT $${values.length}`,
    values
  );
  res.json({ success:true,data:result.rows });
}

export async function getCustomer(req, res) {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const result = await pool.query(`SELECT id,name,email,phone,address,created_at AS "createdAt",updated_at AS "updatedAt" FROM customers WHERE id=$1`,[id]);
  if (!result.rows[0]) throw new AppError(404,'ไม่พบลูกค้า','CUSTOMER_NOT_FOUND');
  res.json({ success:true,data:result.rows[0] });
}
