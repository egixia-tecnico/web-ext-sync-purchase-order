import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

describe("egixia.getVerificationHistory", () => {
  it("should return verification history logs", async () => {
    const caller = appRouter.createCaller({} as any);
    const history = await caller.egixia.getVerificationHistory();
    
    expect(Array.isArray(history)).toBe(true);
    
    // If there are logs, verify structure
    if (history.length > 0) {
      const log = history[0];
      expect(log).toHaveProperty("id");
      expect(log).toHaveProperty("totalRecords");
      expect(log).toHaveProperty("syncedCount");
      expect(log).toHaveProperty("notFoundCount");
      expect(log).toHaveProperty("supplierNotExistsCount");
      expect(log).toHaveProperty("errorCount");
      expect(log).toHaveProperty("durationMs");
      expect(log).toHaveProperty("executedAt");
      
      expect(typeof log.id).toBe("number");
      expect(typeof log.totalRecords).toBe("number");
      expect(typeof log.syncedCount).toBe("number");
      expect(typeof log.notFoundCount).toBe("number");
      expect(typeof log.supplierNotExistsCount).toBe("number");
      expect(typeof log.errorCount).toBe("number");
      expect(typeof log.durationMs).toBe("number");
      expect(log.executedAt).toBeInstanceOf(Date);
    }
  });
});
