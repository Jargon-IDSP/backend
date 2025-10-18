import crypto from 'crypto';
import type { OCRData } from '../interfaces/OCRInterfaces';


export async function getGoogleAccessToken(): Promise<string> {
  const serviceAccount: OCRData = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT || '{}'
  );

  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Invalid or missing Google service account credentials');
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const jwt = createJWT(header, payload, serviceAccount.private_key);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}


function createJWT(
  header: { alg: string; typ: string },
  payload: Record<string, any>,
  privateKey: string
): string {
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(privateKey);

  const signatureB64 = base64UrlEncode(signature);
  return `${unsigned}.${signatureB64}`;
}

function base64UrlEncode(data: string | Buffer): string {
  const base64 = Buffer.isBuffer(data)
    ? data.toString('base64')
    : Buffer.from(data).toString('base64');

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}


export function getGoogleCloudConfig() {
  return {
    projectId: process.env.GCP_PROJECT_ID,
    location: process.env.GCP_LOCATION || 'us',
    processorId: process.env.PROCESSOR_ID,
  };
}