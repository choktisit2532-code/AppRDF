import { pool } from '../config/db.js';

export async function writeAuditLog({
  client = pool,
  userId = null,
  action,
  entityType = null,
  entityId = null,
  metadata = {},
  ipAddress = null
}) {
  await client.query(
    `INSERT INTO audit_logs
      (user_id, action, entity_type, entity_id, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [userId, action, entityType, entityId, JSON.stringify(metadata), ipAddress]
  );
}
