import { describe, it, expect } from "vitest";
import { isSendGridConfigured } from "./email";

describe("SendGrid Configuration", () => {
  it("should have SendGrid configured with API key and from email", () => {
    const isConfigured = isSendGridConfigured();
    expect(isConfigured).toBe(true);
    
    // Verify environment variables are set
    expect(process.env.SENDGRID_API_KEY).toBeDefined();
    expect(process.env.SENDGRID_API_KEY).not.toBe("");
    expect(process.env.SENDGRID_FROM_EMAIL).toBeDefined();
    expect(process.env.SENDGRID_FROM_EMAIL).not.toBe("");
    
    // Verify API key format (should start with SG.)
    expect(process.env.SENDGRID_API_KEY).toMatch(/^SG\./);
    
    // Verify from email format
    expect(process.env.SENDGRID_FROM_EMAIL).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });
});
