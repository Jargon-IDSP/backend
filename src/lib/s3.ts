import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error("❌ Missing Cloudflare R2 credentials in .env file");
  process.exit(1);
}

export const s3 = new S3Client({
  region: "auto", 
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true, 
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
