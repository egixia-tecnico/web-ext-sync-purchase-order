import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock axios to avoid real API calls
vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

// Mock db functions
vi.mock("./db", () => ({
  getDefaultApiConfig: vi.fn(),
  upsertApiConfig: vi.fn(),
  saveVerificationLog: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  getActiveClient: vi.fn(),
  getClients: vi.fn(),
  getClientById: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  deleteClient: vi.fn(),
  setActiveClient: vi.fn(),
  getVerificationHistory: vi.fn(),
}));

import axios from "axios";
import { getDefaultApiConfig, upsertApiConfig, saveVerificationLog, getActiveClient } from "./db";

const mockedAxios = vi.mocked(axios);
const mockedGetConfig = vi.mocked(getDefaultApiConfig);
const mockedUpsertConfig = vi.mocked(upsertApiConfig);
const mockedSaveLog = vi.mocked(saveVerificationLog);
const mockedGetActiveClient = vi.mocked(getActiveClient);

function createContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("egixia.getConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns configured:false when no config exists", async () => {
    mockedGetConfig.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createContext());
    const result = await caller.egixia.getConfig();
    expect(result.configured).toBe(false);
    expect(result.hasCredentials).toBe(false);
  });

  it("returns configured:true with masked data when config exists", async () => {
    mockedGetConfig.mockResolvedValue({
      id: 1,
      configName: "default",
      baseUrl: "https://egixia.net/ProveedoresManuelita",
      userName: "apimanager.manuelita",
      password: "secret",
      clientId: "abc123",
      clientSecret: "def456",
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(createContext());
    const result = await caller.egixia.getConfig();
    expect(result.configured).toBe(true);
    expect(result.baseUrl).toBe("https://egixia.net/ProveedoresManuelita");
    expect(result.userName).toBe("apimanager.manuelita");
    expect(result.hasCredentials).toBe(true);
  });
});

describe("egixia.testConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns failure when no config and no input", async () => {
    mockedGetActiveClient.mockResolvedValue(null);
    mockedGetConfig.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createContext());
    const result = await caller.egixia.testConnection(undefined);
    expect(result.success).toBe(false);
    expect(result.message).toContain("No hay cliente activo");
  });

  it("returns success when token is obtained", async () => {
    mockedGetActiveClient.mockResolvedValue(null);
    mockedGetConfig.mockResolvedValue({
      id: 1,
      configName: "default",
      baseUrl: "https://egixia.net/ProveedoresManuelita",
      userName: "apimanager.manuelita",
      password: "1nt3grAc1on@.2026",
      clientId: "abc",
      clientSecret: "def",
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockedAxios.post.mockResolvedValueOnce({
      data: { AccessToken: "test-token-12345678" },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    });

    const caller = appRouter.createCaller(createContext());
    const result = await caller.egixia.testConnection(undefined);
    expect(result.success).toBe(true);
    expect(result.message).toBe("Conexión exitosa");
  });
});

describe("egixia.saveConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves config after successful token test", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { AccessToken: "new-token-abc" },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    });
    mockedUpsertConfig.mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createContext());
    const result = await caller.egixia.saveConfig({
      baseUrl: "https://test.egixia.net/Portal",
      userName: "testuser",
      password: "testpass",
      clientId: "cid",
      clientSecret: "csec",
    });

    expect(result.success).toBe(true);
    expect(mockedUpsertConfig).toHaveBeenCalledWith({
      baseUrl: "https://test.egixia.net/Portal",
      userName: "testuser",
      password: "testpass",
      clientId: "cid",
      clientSecret: "csec",
    });
  });

  it("returns failure when token test fails", async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error("Connection refused"));

    const caller = appRouter.createCaller(createContext());
    const result = await caller.egixia.saveConfig({
      baseUrl: "https://bad-url.com",
      userName: "user",
      password: "pass",
      clientId: "cid",
      clientSecret: "csec",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Connection refused");
    expect(mockedUpsertConfig).not.toHaveBeenCalled();
  });
});

describe("egixia.verifyBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when no config exists", async () => {
    mockedGetActiveClient.mockResolvedValue(null);
    mockedGetConfig.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createContext());
    const result = await caller.egixia.verifyBatch({
      records: [{ buyerCode: "0100", supplierCode: "1222748", purchaseOrderNumber: "3300293553" }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No hay cliente activo");
  });

  it("verifies a synced OC correctly", async () => {
    mockedGetActiveClient.mockResolvedValue(null);
    mockedGetConfig.mockResolvedValue({
      id: 1,
      configName: "default",
      baseUrl: "https://egixia.net/ProveedoresManuelita",
      userName: "apimanager.manuelita",
      password: "pass",
      clientId: "cid",
      clientSecret: "csec",
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Token call
    mockedAxios.post.mockResolvedValueOnce({
      data: { AccessToken: "token-123" },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    });

    // OC list call - found
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        SDTOrdenesCompra: [{
          buyer_external_code: "0100",
          buyer_name: "ACEITES MANUELITA",
          provider_external_code: "1222748",
          provider_name: "PROVEEDOR TEST",
          purchase_order_number: "3300293553",
          document_date: "2026-01-15",
          delivery_status: "Entrega Completa",
          canceled: "No",
          updated: "Sí",
          synchronization_date: "2026-01-16",
        }],
      },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    });

    mockedSaveLog.mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createContext());
    const result = await caller.egixia.verifyBatch({
      records: [{ buyerCode: "0100", supplierCode: "1222748", purchaseOrderNumber: "3300293553" }],
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe("synced");
    expect(result.results[0].portalData?.providerName).toBe("PROVEEDOR TEST");
    expect(result.summary?.synced).toBe(1);
    expect(result.summary?.notFound).toBe(0);
  });

  it("verifies a not_found OC and checks supplier", async () => {
    mockedGetActiveClient.mockResolvedValue(null);
    mockedGetConfig.mockResolvedValue({
      id: 1,
      configName: "default",
      baseUrl: "https://egixia.net/ProveedoresManuelita",
      userName: "apimanager.manuelita",
      password: "pass",
      clientId: "cid",
      clientSecret: "csec",
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Token call
    mockedAxios.post.mockResolvedValueOnce({
      data: { AccessToken: "token-123" },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    });

    // OC list call - not found
    mockedAxios.get.mockResolvedValueOnce({
      data: { SDTOrdenesCompra: [] },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    });

    // Supplier exists call - not found
    mockedAxios.post.mockResolvedValueOnce({
      data: { outlist_provider: [], Message: "rated 0" },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    });

    mockedSaveLog.mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createContext());
    const result = await caller.egixia.verifyBatch({
      records: [{ buyerCode: "0100", supplierCode: "9999999", purchaseOrderNumber: "FAKE123" }],
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe("supplier_not_exists");
    expect(result.summary?.supplierNotExists).toBe(1);
  });
});

describe("egixia.checkSupplier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when no config", async () => {
    mockedGetActiveClient.mockResolvedValue(null);
    mockedGetConfig.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createContext());
    const result = await caller.egixia.checkSupplier({ supplierCode: "1222748" });
    expect(result.success).toBe(false);
  });
});
