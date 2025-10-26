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

export interface DocumentTranslation {
  id: string;
  documentId: string;
  userId: string;
  
  textEnglish: string;
  textFrench: string;
  textChinese: string;
  textSpanish: string;
  textTagalog: string;
  textPunjabi: string;
  textKorean: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentTranslationData {
  id: string;
  documentId: string;
  userId: string;
  
  textEnglish: string;
  textFrench: string;
  textChinese: string;
  textSpanish: string;
  textTagalog: string;
  textPunjabi: string;
  textKorean: string;
}