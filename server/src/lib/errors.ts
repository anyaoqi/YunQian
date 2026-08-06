import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
  }
}

export const notFound = (resource: string): AppError =>
  new AppError(404, 'NOT_FOUND', `${resource}不存在`);

export const asyncHandler = (handler: RequestHandler): RequestHandler =>
  (req, res, next) => void Promise.resolve(handler(req, res, next)).catch(next);

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: '请求参数不合法', details: error.flatten() },
    });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }
  console.error(error);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: '服务器发生未预期错误', details: null },
  });
};
