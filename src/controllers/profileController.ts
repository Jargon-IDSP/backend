import type { Context } from "hono";

export const profile = (c: Context) => {
  return c.json({ message: "This is the PROFILE page" }, 200);
};
