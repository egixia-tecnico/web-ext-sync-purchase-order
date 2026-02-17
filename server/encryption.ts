/**
 * Encryption utilities for sensitive client data
 * Uses AES-256-CBC encryption with a secret key from environment
 */
import crypto from "crypto";
import { ENV } from "./_core/env";

const ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(ENV.cookieSecret) // Use cookieSecret (JWT_SECRET) as base for encryption key
  .digest();
const IV_LENGTH = 16;

/**
 * Encrypt a string value
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

/**
 * Decrypt an encrypted string value
 */
export function decrypt(text: string): string {
  const parts = text.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted text format");
  }
  const iv = Buffer.from(parts[0], "hex");
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Mask a sensitive value for display (show first 3 and last 3 chars)
 */
export function maskValue(value: string): string {
  if (value.length <= 6) {
    return "***";
  }
  return value.slice(0, 3) + "***" + value.slice(-3);
}
