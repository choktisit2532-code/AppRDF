import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../src/config/db.js';

const [nameArg, emailArg, passwordArg] = process.argv.slice(2);
const input = z.object({
  name: z.string().trim().min(2).max(150),
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128)
}).parse({ name: nameArg, email: emailArg, password: passwordArg });

try {
  const hash = await bcrypt.hash(input.password, 12);
  const result = await pool.query(
    `INSERT INTO users (name, email, password, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE
     SET name = EXCLUDED.name, password = EXCLUDED.password, role = 'admin', updated_at = NOW()
     RETURNING id, name, email, role`,
    [input.name, input.email, hash]
  );
  console.log('Admin ready:', result.rows[0]);
} finally {
  await pool.end();
}
