import crypto from 'crypto';

export interface OCRData {
  client_email: string;
  private_key: string;
  project_id: string;
}

export interface OCRPage {
  pageNumber: number;
  text: string;
  confidence?: number;
}

export interface OCRResult {
  success: boolean;
  fullText?: string;
  pages?: OCRPage[];
  entities?: any[];
  tables?: any[];
  error?: string;
}