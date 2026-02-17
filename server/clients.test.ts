import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { encrypt, decrypt, maskValue } from "./encryption";

describe("Encryption", () => {
  it("should encrypt and decrypt a value correctly", () => {
    const original = "my-secret-password-123";
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(":");
    expect(decrypted).toBe(original);
  });

  it("should mask sensitive values", () => {
    const value = "a4559cf615a14a20acb38b6eef9d315e";
    const masked = maskValue(value);
    
    expect(masked).toBe("a45***15e");
    expect(masked).not.toBe(value);
  });

  it("should mask short values as ***", () => {
    const value = "short";
    const masked = maskValue(value);
    
    expect(masked).toBe("***");
  });
});

describe("clients.create", () => {
  it("should create a client with encrypted sensitive fields", async () => {
    const caller = appRouter.createCaller({} as any);
    
    const result = await caller.clients.create({
      name: "Test Client",
      baseUrl: "https://test.example.com",
      userName: "testuser",
      password: "testpass123",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      primaryColor: "#FF5722",
      isActive: false,
    });
    
    expect(result.success).toBe(true);
  });
});

describe("clients.list", () => {
  it("should return clients with masked sensitive data", async () => {
    const caller = appRouter.createCaller({} as any);
    const clients = await caller.clients.list();
    
    expect(Array.isArray(clients)).toBe(true);
    
    if (clients.length > 0) {
      const client = clients[0];
      expect(client).toHaveProperty("id");
      expect(client).toHaveProperty("name");
      expect(client).toHaveProperty("baseUrl");
      expect(client).toHaveProperty("userName");
      expect(client).toHaveProperty("passwordMasked");
      expect(client).toHaveProperty("clientIdMasked");
      expect(client).toHaveProperty("clientSecretMasked");
      expect(client).toHaveProperty("primaryColor");
      expect(client).toHaveProperty("isActive");
      
      // Verify masked values don't contain full sensitive data
      expect(client.passwordMasked).toContain("***");
      expect(client.clientIdMasked).toContain("***");
      expect(client.clientSecretMasked).toContain("***");
    }
  });
});

describe("clients.getActive", () => {
  it("should return active client or null", async () => {
    const caller = appRouter.createCaller({} as any);
    const activeClient = await caller.clients.getActive();
    
    // Can be null if no client is active
    if (activeClient) {
      expect(activeClient).toHaveProperty("id");
      expect(activeClient).toHaveProperty("name");
      expect(activeClient).toHaveProperty("baseUrl");
      expect(activeClient).toHaveProperty("userName");
      expect(activeClient).toHaveProperty("primaryColor");
      expect(activeClient.isActive).toBe(true);
      
      // Should not expose sensitive fields
      expect(activeClient).not.toHaveProperty("password");
      expect(activeClient).not.toHaveProperty("clientId");
      expect(activeClient).not.toHaveProperty("clientSecret");
    }
  });
});
