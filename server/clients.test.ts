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
    const uniqueKey = `testclient_${Date.now()}`;
    
    const result = await caller.clients.create({
      clientKey: uniqueKey,
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
      expect(client).toHaveProperty("password");
      expect(client).toHaveProperty("clientId");
      expect(client).toHaveProperty("clientSecret");
      expect(client).toHaveProperty("primaryColor");
      expect(client).toHaveProperty("isActive");
      
      // Verify masked values don't contain full sensitive data
      expect(client.password).toContain("***");
      expect(client.clientId).toContain("***");
      expect(client.clientSecret).toContain("***");
    }
  });
});

describe("clients.getByKey", () => {
  it("should return client by clientKey or null", async () => {
    const caller = appRouter.createCaller({} as any);
    const client = await caller.clients.getByKey({ clientKey: "nonexistent_key" });
    
    // Can be null if clientKey doesn't exist
    if (client) {
      expect(client).toHaveProperty("id");
      expect(client).toHaveProperty("name");
      expect(client).toHaveProperty("baseUrl");
      expect(client).toHaveProperty("userName");
      expect(client).toHaveProperty("primaryColor");
      
      // Should not expose sensitive fields
      expect(client).not.toHaveProperty("password");
      expect(client).not.toHaveProperty("clientId");
      expect(client).not.toHaveProperty("clientSecret");
    }
  });
});
