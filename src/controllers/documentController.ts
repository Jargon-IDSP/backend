// controllers/documentController.ts
import type { Context } from "hono";
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3 } from '../config/s3';
import { prisma } from '../lib/prisma';

export const getUploadUrl = async (c: Context) => {
  try {
    const { filename, type } = await c.req.json();
    
    const user = c.get('user');
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    const key = `documents/${user.id}/${Date.now()}-${filename}`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      ContentType: type,
    });
    
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    
    return c.json({ uploadUrl, key });
  } catch (error) {
    console.error("Upload URL error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const saveDocument = async (c: Context) => {
  try {
    const { fileKey, filename, fileType, fileSize } = await c.req.json();
    
    const user = c.get('user');
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    const document = await prisma.document.create({
      data: {
        filename,
        fileKey,
        fileUrl: fileKey,
        fileType,
        fileSize: fileSize || null,
        userId: user.id,
      },
    });
    
    return c.json({ document });
  } catch (error) {
    console.error("Save document error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const getUserDocuments = async (c: Context) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    const documents = await prisma.document.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    
    return c.json({ documents });
  } catch (error) {
    console.error("Get documents error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const getDocument = async (c: Context) => {
  try {
    const id = c.req.param('id');
    
    const user = c.get('user');
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    const document = await prisma.document.findUnique({
      where: { id },
    });
    
    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }
    
    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }
    
    return c.json({ document });
  } catch (error) {
    console.error("Get document error:", error);
    return c.json({ error: String(error) }, 500);
  }
};

export const getDownloadUrl = async (c: Context) => {
  try {
    const id = c.req.param('id');
    
    const user = c.get('user');
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    const document = await prisma.document.findUnique({
      where: { id },
    });
    
    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }
    
    if (document.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }
    
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: document.fileKey,
    });
    
    const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    
    return c.json({ downloadUrl });
  } catch (error) {
    console.error("Get download URL error:", error);
    return c.json({ error: String(error) }, 500);
  }
};