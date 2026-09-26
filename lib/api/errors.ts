export const ErrorCodes = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  FORBIDDEN: "FORBIDDEN",
  BUSINESS_NOT_FOUND: "BUSINESS_NOT_FOUND",
  BUSINESS_ACCESS_DENIED: "BUSINESS_ACCESS_DENIED",
  MODULE_NOT_AVAILABLE: "MODULE_NOT_AVAILABLE",
  PLAN_LIMIT_REACHED: "PLAN_LIMIT_REACHED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  SUBSCRIPTION_EXPIRED: "SUBSCRIPTION_EXPIRED",
  CONFLICT: "CONFLICT",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status: number,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }

  static validation(fields: Record<string, string[]>) {
    return new AppError(ErrorCodes.VALIDATION_ERROR, "Validation failed", 422, fields);
  }
}
