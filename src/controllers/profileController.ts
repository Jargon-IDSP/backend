import type { Context } from "hono";

export const profile = (c: Context) => {
  const user = c.get("user");
  
  return c.json({ 
    message: "This is the PROFILE page",
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username
    }
  }, 200);
};
