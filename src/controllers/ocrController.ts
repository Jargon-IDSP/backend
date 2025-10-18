import type { Context } from 'hono';
import { getGoogleAccessToken, getGoogleCloudConfig } from '../lib/OCRData';
import type { OCRPage, OCRResult } from '../interfaces/OCRInterfaces';


export async function processDocument(c: Context): Promise<Response> {
  try {
    const body = await c.req.parseBody();
    const pdfFile = body.pdf as File;

    if (!pdfFile) {
      return c.json<OCRResult>(
        { success: false, error: 'No PDF file provided' },
        400
      );
    }

    if (pdfFile.type !== 'application/pdf') {
      return c.json<OCRResult>(
        { success: false, error: 'Only PDF files are allowed' },
        400
      );
    }

    if (pdfFile.size > 20 * 1024 * 1024) {
      return c.json<OCRResult>(
        { success: false, error: 'File size must be less than 20MB' },
        400
      );
    }

    console.log(`Processing PDF: ${pdfFile.name}, Size: ${pdfFile.size} bytes`);

    const arrayBuffer = await pdfFile.arrayBuffer();
    const base64Content = Buffer.from(arrayBuffer).toString('base64');

    const accessToken = await getGoogleAccessToken();
    const result = await callDocumentAI(base64Content, accessToken);

    return c.json<OCRResult>({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('OCR Error:', error);
    return c.json<OCRResult>(
      { success: false, error: error.message || 'Unknown error occurred' },
      500
    );
  }
}


export async function processBatchDocuments(c: Context): Promise<Response> {
  try {
    const formData = await c.req.formData();
    const files: File[] = [];
    
    for (const [key, value] of formData.entries()) {
      if (key === 'pdfs' && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return c.json({ success: false, error: 'No PDF files provided' }, 400);
    }

    const accessToken = await getGoogleAccessToken();
    const results = [];

    for (const file of files) {
      try {
        if (file.type !== 'application/pdf') {
          results.push({
            filename: file.name,
            success: false,
            error: 'Only PDF files are allowed',
          });
          continue;
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64Content = Buffer.from(arrayBuffer).toString('base64');
        const result = await callDocumentAI(base64Content, accessToken);

        results.push({
          filename: file.name,
          success: true,
          ...result,
        });
      } catch (error: any) {
        results.push({
          filename: file.name,
          success: false,
          error: error.message,
        });
      }
    }

    return c.json({ success: true, results });
  } catch (error: any) {
    console.error('Batch OCR Error:', error);
    return c.json(
      { success: false, error: error.message || 'Unknown error occurred' },
      500
    );
  }
}

export async function processDocumentFromGCS(c: Context): Promise<Response> {
  try {
    const { gcsUri } = await c.req.json();

    if (!gcsUri) {
      return c.json<OCRResult>(
        { success: false, error: 'GCS URI is required' },
        400
      );
    }

    console.log(`Processing PDF from GCS: ${gcsUri}`);

    const accessToken = await getGoogleAccessToken();
    const result = await callDocumentAIFromGCS(gcsUri, accessToken);

    return c.json<OCRResult>({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('GCS OCR Error:', error);
    return c.json<OCRResult>(
      { success: false, error: error.message || 'Unknown error occurred' },
      500
    );
  }
}


export async function callDocumentAI(
  base64Content: string,
  accessToken: string
): Promise<Omit<OCRResult, 'success'>> {
  const config = getGoogleCloudConfig();
  const { projectId, location, processorId } = config;

  if (!projectId || !processorId) {
    throw new Error('Missing GCP_PROJECT_ID or PROCESSOR_ID in environment variables');
  }

  const endpoint = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;

  const requestBody = {
    rawDocument: {
      content: base64Content,
      mimeType: 'application/pdf',
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Document AI error: ${error}`);
  }

  const result: any = await response.json();
  return parseDocumentAIResponse(result);
}


async function callDocumentAIFromGCS(
  gcsUri: string,
  accessToken: string
): Promise<Omit<OCRResult, 'success'>> {
  const config = getGoogleCloudConfig();
  const { projectId, location, processorId } = config;

  if (!projectId || !processorId) {
    throw new Error('Missing GCP_PROJECT_ID or PROCESSOR_ID in environment variables');
  }

  const endpoint = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;

  const requestBody = {
    gcsDocument: {
      gcsUri: gcsUri,
      mimeType: 'application/pdf',
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Document AI error: ${error}`);
  }

  const result: any = await response.json();
  return parseDocumentAIResponse(result);
}


function parseDocumentAIResponse(result: any): Omit<OCRResult, 'success'> {
  const document = result.document;

  if (!document) {
    throw new Error('Invalid response from Document AI');
  }

  const fullText = document.text || '';
  const pages: OCRPage[] = [];
  const entities = document.entities || [];
  const tables: any[] = [];

  if (document.pages) {
    document.pages.forEach((page: any, index: number) => {
      const pageText = extractPageText(fullText, page);
      pages.push({
        pageNumber: index + 1,
        text: pageText,
        confidence: page.confidence,
      });

      if (page.tables) {
        page.tables.forEach((table: any) => {
          const extractedTable = extractTable(fullText, table);
          tables.push({
            pageNumber: index + 1,
            ...extractedTable,
          });
        });
      }
    });
  }

  return { fullText, pages, entities, tables };
}


function extractPageText(fullText: string, page: any): string {
  if (!page.layout || !page.layout.textAnchor) {
    return '';
  }

  const textAnchor = page.layout.textAnchor;
  if (!textAnchor.textSegments) {
    return '';
  }

  let pageText = '';
  textAnchor.textSegments.forEach((segment: any) => {
    const startIndex = parseInt(segment.startIndex || '0');
    const endIndex = parseInt(segment.endIndex || fullText.length);
    pageText += fullText.substring(startIndex, endIndex);
  });

  return pageText;
}


function extractTable(fullText: string, table: any): any {
  const rows: string[][] = [];

  if (table.bodyRows) {
    table.bodyRows.forEach((row: any) => {
      const rowData: string[] = [];
      if (row.cells) {
        row.cells.forEach((cell: any) => {
          const cellText = extractTextFromLayout(fullText, cell.layout);
          rowData.push(cellText);
        });
      }
      rows.push(rowData);
    });
  }

  let headers: string[][] = [];
  if (table.headerRows) {
    table.headerRows.forEach((row: any) => {
      const rowData: string[] = [];
      if (row.cells) {
        row.cells.forEach((cell: any) => {
          const cellText = extractTextFromLayout(fullText, cell.layout);
          rowData.push(cellText);
        });
      }
      headers.push(rowData);
    });
  }

  return { headers, rows };
}


function extractTextFromLayout(fullText: string, layout: any): string {
  if (!layout || !layout.textAnchor || !layout.textAnchor.textSegments) {
    return '';
  }

  let text = '';
  layout.textAnchor.textSegments.forEach((segment: any) => {
    const startIndex = parseInt(segment.startIndex || '0');
    const endIndex = parseInt(segment.endIndex || fullText.length);
    text += fullText.substring(startIndex, endIndex);
  });

  return text.trim();
}