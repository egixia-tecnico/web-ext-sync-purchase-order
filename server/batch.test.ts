import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

describe("batch configuration in clients", () => {
  it("should create a client with batch configuration", async () => {
    const caller = appRouter.createCaller({} as any);
    const uniqueKey = `batchtest_${Date.now()}`;

    const result = await caller.clients.create({
      clientKey: uniqueKey,
      name: "Batch Test Client",
      baseUrl: "https://batch-test.example.com",
      userName: "batchuser",
      password: "batchpass123",
      clientId: "batch-client-id",
      clientSecret: "batch-client-secret",
      primaryColor: "#2E7D32",
      batchSize: 5,
      batchDelaySeconds: 2,
      isActive: false,
    });

    expect(result.success).toBe(true);
  });

  it("should create a client with default batch values when not specified", async () => {
    const caller = appRouter.createCaller({} as any);
    const uniqueKey = `batchdefault_${Date.now()}`;

    const result = await caller.clients.create({
      clientKey: uniqueKey,
      name: "Batch Default Client",
      baseUrl: "https://batch-default.example.com",
      userName: "defaultuser",
      password: "defaultpass123",
      clientId: "default-client-id",
      clientSecret: "default-client-secret",
      primaryColor: "#1565C0",
      isActive: false,
    });

    expect(result.success).toBe(true);
  });

  it("should return batch fields in clients.list", async () => {
    const caller = appRouter.createCaller({} as any);
    const clients = await caller.clients.list();

    expect(Array.isArray(clients)).toBe(true);

    if (clients.length > 0) {
      const client = clients[0];
      expect(client).toHaveProperty("batchSize");
      expect(client).toHaveProperty("batchDelaySeconds");
      expect(typeof client.batchSize).toBe("number");
      expect(typeof client.batchDelaySeconds).toBe("number");
      expect(client.batchSize).toBeGreaterThanOrEqual(1);
      expect(client.batchSize).toBeLessThanOrEqual(100);
      expect(client.batchDelaySeconds).toBeGreaterThanOrEqual(1);
      expect(client.batchDelaySeconds).toBeLessThanOrEqual(60);
    }
  });

  it("should return batch fields in clients.getById", async () => {
    const caller = appRouter.createCaller({} as any);

    // First create a client with specific batch values
    const uniqueKey = `batchgetbyid_${Date.now()}`;
    await caller.clients.create({
      clientKey: uniqueKey,
      name: "Batch GetById Client",
      baseUrl: "https://batch-getbyid.example.com",
      userName: "getbyiduser",
      password: "getbyidpass123",
      clientId: "getbyid-client-id",
      clientSecret: "getbyid-client-secret",
      primaryColor: "#FF5722",
      batchSize: 15,
      batchDelaySeconds: 5,
      isActive: false,
    });

    // Find the client in the list
    const clients = await caller.clients.list();
    const created = clients.find(c => c.clientKey === uniqueKey);
    expect(created).toBeDefined();

    if (created) {
      const client = await caller.clients.getById({ id: created.id });
      expect(client).not.toBeNull();
      expect(client?.batchSize).toBe(15);
      expect(client?.batchDelaySeconds).toBe(5);
    }
  });

  it("should update batch configuration", async () => {
    const caller = appRouter.createCaller({} as any);

    // Create a client
    const uniqueKey = `batchupdate_${Date.now()}`;
    await caller.clients.create({
      clientKey: uniqueKey,
      name: "Batch Update Client",
      baseUrl: "https://batch-update.example.com",
      userName: "updateuser",
      password: "updatepass123",
      clientId: "update-client-id",
      clientSecret: "update-client-secret",
      primaryColor: "#9C27B0",
      batchSize: 10,
      batchDelaySeconds: 3,
      isActive: false,
    });

    // Find the client
    const clients = await caller.clients.list();
    const created = clients.find(c => c.clientKey === uniqueKey);
    expect(created).toBeDefined();

    if (created) {
      // Update batch config
      const updateResult = await caller.clients.update({
        id: created.id,
        clientKey: uniqueKey,
        name: "Batch Update Client",
        baseUrl: "https://batch-update.example.com",
        userName: "updateuser",
        password: "updatepass123",
        clientId: "update-client-id",
        clientSecret: "update-client-secret",
        primaryColor: "#9C27B0",
        batchSize: 20,
        batchDelaySeconds: 8,
        isActive: false,
      });

      expect(updateResult.success).toBe(true);

      // Verify update
      const updated = await caller.clients.getById({ id: created.id });
      expect(updated?.batchSize).toBe(20);
      expect(updated?.batchDelaySeconds).toBe(8);
    }
  });
});
