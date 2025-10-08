import type { Context } from "hono";

export const chat = (c: Context) => {
  const user = c.get("user");
  
  return c.json({ 
    message: "This is the CHAT page",
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username
    }
  }, 200);
};
