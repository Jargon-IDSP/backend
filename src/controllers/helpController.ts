import type { Context } from "hono";

export const help = (c: Context) => {
  return c.json({ message: "This is the INSTANT HELP page" }, 200);
};
