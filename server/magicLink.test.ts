import { describe, it, expect, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

// Mock database functions
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    createMagicLink: vi.fn(),
    getMagicLinkByToken: vi.fn(),
    markMagicLinkAsUsed: vi.fn(),
  };
});

const mockedCreateMagicLink = vi.mocked(db.createMagicLink);
const mockedGetMagicLinkByToken = vi.mocked(db.getMagicLinkByToken);
const mockedMarkMagicLinkAsUsed = vi.mocked(db.markMagicLinkAsUsed);

describe("Magic Link Authentication", () => {
  const mockReq = {} as any;
  const mockRes = {
    setHeader: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("auth.sendMagicLink", () => {
    it("should send magic link for valid @egixia.com email", async () => {
      mockedCreateMagicLink.mockResolvedValue(true);

      const caller = appRouter.createCaller({ req: mockReq, res: mockRes, user: null });
      const result = await caller.auth.sendMagicLink({ email: "test@egixia.com" });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Link mágico enviado");
      expect(mockedCreateMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@egixia.com",
          token: expect.any(String),
          expiresAt: expect.any(Date),
          used: false,
        })
      );
    });

    it("should reject non-@egixia.com emails", async () => {
      const caller = appRouter.createCaller({ req: mockReq, res: mockRes, user: null });

      await expect(
        caller.auth.sendMagicLink({ email: "test@gmail.com" })
      ).rejects.toThrow("Solo se permiten correos @egixia.com");

      expect(mockedCreateMagicLink).not.toHaveBeenCalled();
    });
  });

  describe("auth.validateMagicLink", () => {
    it("should validate and create session for valid token", async () => {
      const mockMagicLink = {
        id: 1,
        email: "admin@egixia.com",
        token: "valid-token",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
        used: false,
        createdAt: new Date(),
      };

      mockedGetMagicLinkByToken.mockResolvedValue(mockMagicLink);
      mockedMarkMagicLinkAsUsed.mockResolvedValue(true);

      const caller = appRouter.createCaller({ req: mockReq, res: mockRes, user: null });
      const result = await caller.auth.validateMagicLink({ token: "valid-token" });

      expect(result.success).toBe(true);
      expect(result.email).toBe("admin@egixia.com");
      expect(mockedMarkMagicLinkAsUsed).toHaveBeenCalledWith("valid-token");
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        "Set-Cookie",
        expect.stringContaining("admin_session=")
      );
    });

    it("should reject invalid token", async () => {
      mockedGetMagicLinkByToken.mockResolvedValue(null);

      const caller = appRouter.createCaller({ req: mockReq, res: mockRes, user: null });

      await expect(
        caller.auth.validateMagicLink({ token: "invalid-token" })
      ).rejects.toThrow("Link inválido o expirado");

      expect(mockedMarkMagicLinkAsUsed).not.toHaveBeenCalled();
    });

    it("should reject already used token", async () => {
      const mockMagicLink = {
        id: 1,
        email: "admin@egixia.com",
        token: "used-token",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        used: true, // Already used
        createdAt: new Date(),
      };

      mockedGetMagicLinkByToken.mockResolvedValue(mockMagicLink);

      const caller = appRouter.createCaller({ req: mockReq, res: mockRes, user: null });

      await expect(
        caller.auth.validateMagicLink({ token: "used-token" })
      ).rejects.toThrow("Este link ya fue utilizado");

      expect(mockedMarkMagicLinkAsUsed).not.toHaveBeenCalled();
    });

    it("should reject expired token", async () => {
      const mockMagicLink = {
        id: 1,
        email: "admin@egixia.com",
        token: "expired-token",
        expiresAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        used: false,
        createdAt: new Date(),
      };

      mockedGetMagicLinkByToken.mockResolvedValue(mockMagicLink);

      const caller = appRouter.createCaller({ req: mockReq, res: mockRes, user: null });

      await expect(
        caller.auth.validateMagicLink({ token: "expired-token" })
      ).rejects.toThrow("Este link ha expirado");

      expect(mockedMarkMagicLinkAsUsed).not.toHaveBeenCalled();
    });
  });

  describe("auth.checkAdminSession", () => {
    it("should return isAdmin=true for valid admin session", async () => {
      const sessionData = JSON.stringify({ email: "admin@egixia.com", isAdmin: true });
      const mockReqWithCookie = {
        headers: {
          cookie: `admin_session=${sessionData}`,
        },
      } as any;

      const caller = appRouter.createCaller({ req: mockReqWithCookie, res: mockRes, user: null });
      const result = await caller.auth.checkAdminSession();

      expect(result.isAdmin).toBe(true);
      expect(result.email).toBe("admin@egixia.com");
    });

    it("should return isAdmin=false when no session cookie", async () => {
      const mockReqNoCookie = {
        headers: {},
      } as any;

      const caller = appRouter.createCaller({ req: mockReqNoCookie, res: mockRes, user: null });
      const result = await caller.auth.checkAdminSession();

      expect(result.isAdmin).toBe(false);
      expect(result.email).toBeNull();
    });

    it("should return isAdmin=false for invalid session data", async () => {
      const mockReqWithInvalidCookie = {
        headers: {
          cookie: "admin_session=invalid-json",
        },
      } as any;

      const caller = appRouter.createCaller({ req: mockReqWithInvalidCookie, res: mockRes, user: null });
      const result = await caller.auth.checkAdminSession();

      expect(result.isAdmin).toBe(false);
      expect(result.email).toBeNull();
    });
  });
});
