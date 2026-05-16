/**
 * S3 / File Upload Helper
 *
 * Provides file upload functionality for profile images and media.
 *
 * ARCHITECTURE:
 * Files are uploaded to the backend's /api/upload endpoint which handles
 * storage. The backend may store in AWS S3 or fall back to base64 encoding
 * depending on configuration.
 *
 * UPLOAD FLOW:
 * 1. Client reads file as base64 using FileReader
 * 2. Sends base64 data to /api/upload endpoint
 * 3. Backend stores file and returns URL
 * 4. URL is stored in user record or asset record
 *
 * SECURITY:
 * - Requires authentication via Bearer token (Authorization header)
 * - File type should be validated client-side before upload
 * - File size limits enforced by backend
 *
 * NOTE:
 * Despite the filename "s3.ts", actual storage backend is abstracted.
 * The backend may use S3 or base64 fallback depending on AWS configuration.
 */

import { getAuthHeader } from "./auth-token";

const API_BASE = (import.meta.env as any).VITE_BACKEND_URL || "";

/**
 * Upload a file to the backend storage system.
 *
 * Converts file to base64 and sends to /api/upload endpoint.
 * The backend handles actual storage (S3 or base64 fallback).
 *
 * @param file - The File object to upload (typically an image)
 *
 * @returns Promise<{ url: string; key: string }>
 *   - url: Full URL to access the uploaded file
 *   - key: Storage key/identifier for the file
 *
 * @throws Error if:
 *   - File cannot be read
 *   - Upload request fails
 *   - Server returns error
 *
 * Example usage:
 *   const { url } = await uploadToS3(fileInput.files[0]);
 *   // Store url in your data model
 */
export async function uploadToS3(
  file: File,
): Promise<{ url: string; key: string }> {
  const reader = new FileReader();

  return new Promise((resolve, reject) => {
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        };

        const res = await fetch(`${API_BASE}/api/upload`, {
          method: "POST",
          headers,
          body: JSON.stringify({ imageData: base64, name: file.name }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          reject(new Error(`Upload failed: ${res.statusText} — ${errorText}`));
          return;
        }

        const data = await res.json();
        resolve({ url: data.url, key: data.key ?? file.name });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error("Failed to read file"));

    reader.readAsDataURL(file);
  });
}