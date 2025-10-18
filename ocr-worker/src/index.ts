// export interface Env {
//   NANONETS_API_KEY: string;
//   NANONETS_MODEL_ID: string;
//   BACKEND_URL: string;
//   BACKEND_SECRET: string; // For authenticating callbacks
// }

// export default {
//   async fetch(request: Request, env: Env): Promise<Response> {
//     // Only allow POST requests
//     if (request.method !== "POST") {
//       return new Response("Method not allowed", { status: 405 });
//     }

//     try {
//       const payload = (await request.json()) as {
//         documentId: string;
//         downloadUrl: string;
//         filename: string;
//         userId: string;
//       };

//       console.log("Processing OCR for document:", payload.documentId);

//       // Call Nanonets API with the R2 download URL
//       const formBody = `urls=${encodeURIComponent(payload.downloadUrl)}`;

//       const nanoResponse = await fetch(
//         `https://app.nanonets.com/api/v2/OCR/Model/${env.NANONETS_MODEL_ID}/LabelFile/`,
//         {
//           method: "POST",
//           headers: {
//             Authorization: `Basic ${btoa(env.NANONETS_API_KEY + ":")}`,
//             "Content-Type": "application/x-www-form-urlencoded",
//           },
//           body: formBody,
//         }
//       );

//       if (!nanoResponse.ok) {
//         const errorText = await nanoResponse.text();
//         console.error("Nanonets error:", errorText);
//         throw new Error(`Nanonets API failed: ${errorText}`);
//       }

//       const ocrResult = (await nanoResponse.json()) as any;
//       console.log("OCR processing successful");

//       // Extract text from Nanonets response
//       let extractedText = "";
//       let terms: Array<{ term: string; definition: string }> = [];

//       if (ocrResult.result && ocrResult.result.length > 0) {
//         const prediction = ocrResult.result[0].prediction;

//         if (Array.isArray(prediction)) {
//           extractedText = prediction
//             .map((pred: any) => pred.ocr_text || "")
//             .filter((text: string) => text.trim())
//             .join("\n");
//         }
//       }

//       // Send results back to your backend
//       const callbackResponse = await fetch(
//         `${env.BACKEND_URL}/documents/ocr-result`,
//         {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Bearer ${env.BACKEND_SECRET}`,
//           },
//           body: JSON.stringify({
//             documentId: payload.documentId,
//             extractedText: extractedText,
//             terms: terms,
//           }),
//         }
//       );

//       if (!callbackResponse.ok) {
//         console.error(
//           "Backend callback failed:",
//           await callbackResponse.text()
//         );
//       }

//       return new Response(
//         JSON.stringify({
//           success: true,
//           message: "OCR processing completed",
//           textLength: extractedText.length,
//         }),
//         {
//           headers: { "Content-Type": "application/json" },
//         }
//       );
//     } catch (error) {
//       console.error("OCR Worker error:", error);

//       return new Response(
//         JSON.stringify({
//           success: false,
//           error: error instanceof Error ? error.message : String(error),
//         }),
//         {
//           status: 500,
//           headers: { "Content-Type": "application/json" },
//         }
//       );
//     }
//   },
// };
