import { ZodError } from 'zod';
import { AppError } from '../utils/app-error.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, `ไม่พบเส้นทาง ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'ข้อมูลไม่ถูกต้อง', details: error.flatten() }
    });
  }

  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) console.error(error);

  return res.status(statusCode).json({
    success: false,
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: statusCode >= 500 ? 'เกิดข้อผิดพลาดภายในระบบ' : error.message,
      ...(error.details ? { details: error.details } : {})
    }
  });
}
