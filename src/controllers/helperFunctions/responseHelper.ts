import type { Context } from "hono";

export const errorResponse = (c: Context, message: string, statusCode: number = 500) => {
  return c.json(
    {
      success: false,
      error: message,
    },
    statusCode as any
  );
};

export const successResponse = <T>(data: T, additionalFields?: Record<string, any>) => {
  return {
    success: true,
    ...additionalFields,
    data,
  };
};