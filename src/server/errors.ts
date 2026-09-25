export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, "bad_request", message, details);
}

export function unauthorized(message = "Authentication required"): AppError {
  return new AppError(401, "unauthorized", message);
}

export function forbidden(message = "You do not have permission to perform this action"): AppError {
  return new AppError(403, "forbidden", message);
}

export function notFound(message = "Not found"): AppError {
  return new AppError(404, "not_found", message);
}

export function conflict(message: string): AppError {
  return new AppError(409, "conflict", message);
}

export function tooMany(message = "Too many attempts. Try again later"): AppError {
  return new AppError(429, "rate_limited", message);
}

export function unavailable(message: string): AppError {
  return new AppError(503, "unavailable", message);
}
