import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';
import { writeAuditLog } from '../services/audit.service.js';

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
});

export async function login(req, res) {
  const input = loginSchema.parse(req.body);
  const result = await pool.query(
    'SELECT id, name, email, password, role FROM users WHERE email = $1 LIMIT 1',
    [input.email]
  );
  const user = result.rows[0];
  const passwordMatches = user ? await bcrypt.compare(input.password, user.password) : false;

  if (!user || !passwordMatches) {
    await writeAuditLog({
      action: 'LOGIN_FAILED',
      entityType: 'user',
      metadata: { email: input.email },
      ipAddress: req.ip
    });
    throw new AppError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', 'INVALID_CREDENTIALS');
  }

  const token = jwt.sign(
    { role: user.role, email: user.email },
    env.JWT_SECRET,
    { subject: String(user.id), expiresIn: env.JWT_EXPIRES_IN, algorithm: 'HS256' }
  );

  await writeAuditLog({
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    entityType: 'user',
    entityId: user.id,
    ipAddress: req.ip
  });

  res.json({
    success: true,
    data: {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    }
  });
}

export async function me(req, res) {
  res.json({ success: true, data: { user: req.user } });
}
