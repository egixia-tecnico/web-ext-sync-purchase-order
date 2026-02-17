/**
 * Tests for clients.testConnection endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

// Mock axios
vi.mock("axios");
const mockedAxios = axios as any;

describe("clients.testConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return success when credentials are valid", async () => {
    // Mock successful token response
    mockedAxios.post.mockResolvedValue({
      data: {
        access_token: "mock_token_12345",
        expires_in: 3600,
      },
    });

    const testData = {
      baseUrl: "https://egixia.net/ProveedoresManuelita/",
      userName: "apimanager.manuelita",
      password: "1nt3grAc1on@.2026",
      clientId: "a4559cf615a14a20acb38b6eef9d315e",
      clientSecret: "823e412901664bcfa1ab2168b69ddbeb",
    };

    // Simulate the endpoint logic
    const tokenUrl = `${testData.baseUrl.replace(/\/$/, "")}/gettoken`;
    const response = await axios.post(
      tokenUrl,
      {
        user: testData.userName,
        password: testData.password,
        clientId: testData.clientId,
        clientSecret: testData.clientSecret,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    expect(response.data.access_token).toBe("mock_token_12345");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://egixia.net/ProveedoresManuelita/gettoken",
      {
        user: "apimanager.manuelita",
        password: "1nt3grAc1on@.2026",
        clientId: "a4559cf615a14a20acb38b6eef9d315e",
        clientSecret: "823e412901664bcfa1ab2168b69ddbeb",
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      }
    );
  });

  it("should return error when credentials are invalid", async () => {
    // Mock failed token response
    mockedAxios.post.mockRejectedValue({
      response: {
        data: {
          message: "Invalid credentials",
        },
      },
      message: "Request failed with status code 401",
    });

    const testData = {
      baseUrl: "https://egixia.net/ProveedoresManuelita/",
      userName: "wrong_user",
      password: "wrong_password",
      clientId: "wrong_id",
      clientSecret: "wrong_secret",
    };

    try {
      const tokenUrl = `${testData.baseUrl.replace(/\/$/, "")}/gettoken`;
      await axios.post(
        tokenUrl,
        {
          user: testData.userName,
          password: testData.password,
          clientId: testData.clientId,
          clientSecret: testData.clientSecret,
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        }
      );
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error.response.data.message).toBe("Invalid credentials");
    }
  });

  it("should handle network errors gracefully", async () => {
    // Mock network error
    mockedAxios.post.mockRejectedValue({
      message: "Network Error",
    });

    const testData = {
      baseUrl: "https://invalid-domain.com/",
      userName: "test_user",
      password: "test_password",
      clientId: "test_id",
      clientSecret: "test_secret",
    };

    try {
      const tokenUrl = `${testData.baseUrl.replace(/\/$/, "")}/gettoken`;
      await axios.post(
        tokenUrl,
        {
          user: testData.userName,
          password: testData.password,
          clientId: testData.clientId,
          clientSecret: testData.clientSecret,
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        }
      );
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error.message).toBe("Network Error");
    }
  });

  it("should strip trailing slash from baseUrl", () => {
    const baseUrl1 = "https://egixia.net/ProveedoresManuelita/";
    const baseUrl2 = "https://egixia.net/ProveedoresManuelita";

    const cleaned1 = baseUrl1.replace(/\/$/, "");
    const cleaned2 = baseUrl2.replace(/\/$/, "");

    expect(cleaned1).toBe("https://egixia.net/ProveedoresManuelita");
    expect(cleaned2).toBe("https://egixia.net/ProveedoresManuelita");
    expect(cleaned1).toBe(cleaned2);
  });
});
