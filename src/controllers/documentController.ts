import type { Context } from "hono";
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3 } from '../config/s3';

export const getUploadUrl = async (c: Context) => {
  const user = c.get("user");
  const { filename, type } = await c.req.json();
  
  const key = `documents/${user.id}/${Date.now()}-${filename}`;
  
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    ContentType: type,
  });
  
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
  
  return c.json({ uploadUrl, key });
};