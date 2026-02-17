import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

describe("egixia.getVerificationHistory", () => {
  it("should return verification history logs", async () => {
    const caller = appRouter.createCaller({} as any);
    const history = await caller.egixia.getVerificationHistory({});
    
    expect(Array.isArray(history)).toBe(true);
    
    // If there are logs, verify structure
    if (history.length > 0) {
      const log = history[0];
      expect(log).toHaveProperty("id");
      expect(log).toHaveProperty("totalRecords");
      expect(log).toHaveProperty("synced");
      expect(log).toHaveProperty("notFound");
      expect(log).toHaveProperty("supplierNotExists");
      expect(log).toHaveProperty("errors");
      expect(log).toHaveProperty("executionTimeMs");
      expect(log).toHaveProperty("createdAt");
      
      expect(typeof log.id).toBe("number");
      expect(typeof log.totalRecords).toBe("number");
      expect(typeof log.synced).toBe("number");
      expect(typeof log.notFound).toBe("number");
      expect(typeof log.supplierNotExists).toBe("number");
      expect(typeof log.errors).toBe("number");
      expect(typeof log.executionTimeMs).toBe("number");
      expect(log.createdAt).toBeInstanceOf(Date);
    }
  });
});
