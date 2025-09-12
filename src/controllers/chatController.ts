import type { Context } from "hono";

export const chat = (c: Context) => {
  return c.json({ message: "This is the CHAT page" }, 200);
};
