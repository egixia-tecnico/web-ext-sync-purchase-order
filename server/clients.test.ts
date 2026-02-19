import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";

describe("clients.create", () => {
  it("should create a client with plain text credentials", async () => {
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
  it("should return clients with plain text credentials", async () => {
    const caller = appRouter.createCaller({} as any);
    const clients = await caller.clients.list();
    
    expect(Array.isArray(clients)).toBe(true);
    
    if (clients.length > 0) {
      const client = clients[0];
      expect(client).toHaveProperty("id");
      expect(client).toHaveProperty("clientKey");
      expect(client).toHaveProperty("name");
      expect(client).toHaveProperty("baseUrl");
      expect(client).toHaveProperty("userName");
      expect(client).toHaveProperty("password");
      expect(client).toHaveProperty("clientId");
      expect(client).toHaveProperty("clientSecret");
      expect(client).toHaveProperty("primaryColor");
      expect(client).toHaveProperty("syncRules");
      expect(client).toHaveProperty("isActive");
      expect(client).toHaveProperty("createdAt");
      
      // Credentials are stored in plain text
      expect(typeof client.password).toBe("string");
      expect(typeof client.clientId).toBe("string");
      expect(typeof client.clientSecret).toBe("string");
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
