import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pool } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { writeAuditLog } from '../services/audit.service.js';

function getBearerToken(header = '') {
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

export async function authenticate(req, _res, next) {
  const token = getBearerToken(req.headers.authorization);
  if (!token) return next(new AppError(401, 'กรุณาเข้าสู่ระบบ', 'AUTH_REQUIRED'));

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    const result = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id = $1 LIMIT 1',
      [payload.sub]
    );

    const user = result.rows[0];
    if (!user) throw new AppError(401, 'บัญชีผู้ใช้ไม่ถูกต้อง', 'INVALID_ACCOUNT');

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new AppError(401, 'Token หมดอายุหรือไม่ถูกต้อง', 'INVALID_TOKEN'));
  }
}

export function authorize(...allowedRoles) {
  return async (req, _res, next) => {
    if (allowedRoles.includes(req.user.role)) return next();

    try {
      await writeAuditLog({
        userId: req.user.id,
        action: 'ACCESS_DENIED',
        entityType: 'route',
        metadata: { method: req.method, path: req.originalUrl, requiredRoles: allowedRoles },
        ipAddress: req.ip
      });
    } catch (error) {
      console.error('Failed to write access denial audit log:', error);
    }

    next(new AppError(403, 'คุณไม่มีสิทธิ์ดำเนินการนี้', 'FORBIDDEN'));
  };
}
