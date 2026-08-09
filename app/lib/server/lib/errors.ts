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

export type ErrorPayload = {
  error: { code: string; message: string; details: unknown };
};

export function serializeError(error: unknown): { status: number; body: ErrorPayload } {
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: { code: 'VALIDATION_ERROR', message: '请求参数不合法', details: error.flatten() },
      },
    };
  }
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message, details: error.details } },
    };
  }
  console.error(error);
  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: '服务器发生未预期错误', details: null } },
  };
}

export function handleRouteError(error: unknown): Response {
  const { status, body } = serializeError(error);
  return Response.json(body, { status });
}
