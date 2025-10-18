import { Hono } from 'hono';
import {
  processDocument,
  processBatchDocuments,
  processDocumentFromGCS,
} from '../controllers/ocrController';

export const ocrRoute = new Hono();


ocrRoute.post('/', processDocument);

ocrRoute.post('/batch', processBatchDocuments);

ocrRoute.post('/gcs', processDocumentFromGCS);


ocrRoute.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'Google Document AI OCR',
    timestamp: new Date().toISOString(),
  });
});