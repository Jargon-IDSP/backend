import mysql from "mysql2/promise";
import "dotenv/config";

const pool = mysql.createPool({
  host: process.env.DATABASE_URL,
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl:
    process.env.MYSQL_SSL === "true"
      ? {
          rejectUnauthorized: true,
        }
      : undefined,
});

// Test connection
pool
  .getConnection()
  .then((connection) => {
    console.log("MySQL Connected to Aiven");
    connection.release();
  })
  .catch((err) => {
    console.error("MySQL Connection Error:", err);
  });

export const db = pool;
