import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  if (err instanceof Error) {
    const status = (err as Error & { status?: number }).status;
    if (status && status >= 400 && status < 500) {
      return res.status(status).json({ error: err.message });
    }
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }

  // eslint-disable-next-line no-console
  console.error("Unknown error:", err);
  return res.status(500).json({ error: "Internal server error" });
}
