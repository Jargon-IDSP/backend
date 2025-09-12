import { app } from "./app";

const port = +(process.env.PORT || 8080);

export default {
  port,
  fetch: app.fetch,
};

console.log(`Server running on http://localhost:${port}`);
