import type { Context } from "hono";

export const home = (c: Context) => {
  return c.json({ message: "This is the HOME page" }, 200);
};
