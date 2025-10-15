// src/config/s3.ts
import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error("❌ Missing Cloudflare R2 credentials in .env file");
  process.exit(1);
}

export const s3 = new S3Client({
  region: "auto", // R2 ignores this but the SDK requires something
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true, // required for R2 compatibility
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// import { S3Client } from "@aws-sdk/client-s3";

// export const s3 = new S3Client({
//   // region: process.env.S3_REGION,
//   region: "auto",
//   endpoint: process.env.S3_ENDPOINT,
//   forcePathStyle: true,
//   credentials: {
//     accessKeyId: process.env.S3_ACCESS_KEY!,
//     secretAccessKey: process.env.S3_SECRET_KEY!,
//   },
// });
