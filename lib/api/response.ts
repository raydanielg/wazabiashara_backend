import { AppError, ErrorCodes } from "./errors";

export function ok<T>(data: T, message = "Success", status = 200) {
  return Response.json(
    { success: true, data, message, request_id: crypto.randomUUID() },
    { status },
  );
}

export function fail(error: AppError) {
  return Response.json(
    {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      },
      request_id: crypto.randomUUID(),
    },
    { status: error.status },
  );
}

/** Wrap a route handler with centralized error handling. */
export function handler(
  fn: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>,
) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof AppError) return fail(e);
      console.error("[api] unhandled error:", e);
      return fail(new AppError(ErrorCodes.INTERNAL, "Internal server error", 500));
    }
  };
}
