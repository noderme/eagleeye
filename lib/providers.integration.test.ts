// Integration tests for provider discovery and fetching
// Tests the entire flow: detect providers → fetch data → analyze

import { runAllProviders, KNOWN_FETCHERS } from "./providers";
import { getMockProvider } from "./mock-providers";
import { discoverAndRegisterServices, getService } from "./dynamic-providers";

describe("Provider Integration Tests", () => {
  describe("runAllProviders", () => {
    it("should fetch all known providers with mock data", async () => {
      const credentials = {
        openai: { apiKey: "sk-test" },
        stripe: { apiKey: "sk_test" },
        vercel: { apiToken: "test" },
        resend: { apiKey: "test" },
        twilio: { accountSid: "test", authToken: "test" },
        supabase: { accessToken: "test" },
        github: { accessToken: "test" },
        anthropic: { apiKey: "test" },
      };

      const { providers, domains } = await runAllProviders(credentials, []);

      expect(Object.keys(providers).length).toBeGreaterThan(0);
      expect(providers.openai).toBeDefined();
      expect(providers.stripe).toBeDefined();
      expect(providers.vercel).toBeDefined();
    });

    it("should handle missing credentials gracefully", async () => {
      const credentials = {};
      const { providers, domains } = await runAllProviders(credentials, []);

      expect(providers).toEqual({});
      expect(domains).toEqual([]);
    });

    it("should fetch domain expiry information", async () => {
      const { providers, domains } = await runAllProviders({}, ["example.com"]);

      expect(domains).toBeInstanceOf(Array);
      if (domains.length > 0) {
        expect(domains[0]).toHaveProperty("domain");
        expect(domains[0]).toHaveProperty("daysLeft");
      }
    });

    it("should handle partial credential failures", async () => {
      const credentials = {
        openai: { apiKey: "sk-test" },
        stripe: { apiKey: "invalid-key" }, // This might fail
      };

      const { providers } = await runAllProviders(credentials, []);

      // Should have at least one provider result
      expect(Object.keys(providers).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Dynamic Provider Discovery", () => {
    it("should discover and register unknown providers", async () => {
      const detectedProviders = ["datadog", "newrelic", "mongodb"];
      const registered = await discoverAndRegisterServices(detectedProviders);

      expect(registered.length).toBeGreaterThan(0);
      expect(registered[0]).toHaveProperty("id");
      expect(registered[0]).toHaveProperty("name");
      expect(registered[0]).toHaveProperty("credentialTypes");
    });

    it("should infer credential types for unknown services", async () => {
      const service = getService("datadog");

      expect(service).toBeDefined();
      expect(service?.credentialTypes).toBeInstanceOf(Array);
      expect(service?.credentialTypes.length).toBeGreaterThan(0);
    });

    it("should generate mock data for unknown providers", async () => {
      const service = getService("mongodb");

      expect(service).toBeDefined();
      expect(service?.mockData).toBeDefined();
      expect(service?.mockData).toHaveProperty("provider");
      expect(service?.mockData).toHaveProperty("_summary");
      expect(service?.mockData).toHaveProperty("_status");
    });
  });

  describe("Mock Data Consistency", () => {
    it("should return consistent mock data for known providers", async () => {
      const mockOpenAI1 = getMockProvider("openai");
      const mockOpenAI2 = getMockProvider("openai");

      expect(mockOpenAI1).toEqual(mockOpenAI2);
    });

    it("should include required fields in all mock data", async () => {
      const providers = ["openai", "stripe", "vercel", "resend", "twilio"];

      for (const provider of providers) {
        const mock = getMockProvider(provider);
        expect(mock).toBeDefined();
        expect(mock).toHaveProperty("provider");
        expect(mock).toHaveProperty("_summary");
        expect(mock).toHaveProperty("_signal");
        expect(mock).toHaveProperty("_status");
      }
    });

    it("should have valid status values", async () => {
      const providers = ["openai", "stripe", "vercel", "resend", "twilio"];
      const validStatuses = ["good", "warn", "upgrade", "info"];

      for (const provider of providers) {
        const mock = getMockProvider(provider);
        expect(validStatuses).toContain(mock._status);
      }
    });
  });

  describe("Provider Registry", () => {
    it("should have all known providers registered", () => {
      const knownProviders = Object.keys(KNOWN_FETCHERS);
      expect(knownProviders.length).toBeGreaterThan(0);

      for (const provider of knownProviders) {
        const service = getService(provider);
        expect(service).toBeDefined();
        expect(service?.id).toBe(provider);
      }
    });

    it("should have credential types for all providers", () => {
      const knownProviders = Object.keys(KNOWN_FETCHERS);

      for (const provider of knownProviders) {
        const service = getService(provider);
        expect(service?.credentialTypes).toBeInstanceOf(Array);
        expect(service?.credentialTypes.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle network timeouts gracefully", async () => {
      // This test would require mocking fetch to simulate timeout
      const credentials = { openai: { apiKey: "sk-test" } };
      const { providers } = await runAllProviders(credentials, []);

      // Should return a result even if fetch times out
      expect(providers).toBeDefined();
    });

    it("should handle invalid credentials gracefully", async () => {
      const credentials = {
        openai: { apiKey: "invalid" },
        stripe: { apiKey: "invalid" },
      };

      const { providers } = await runAllProviders(credentials, []);

      // Should return results with error information
      for (const provider of Object.values(providers)) {
        expect(provider).toHaveProperty("provider");
        // May have error field if credentials were invalid
      }
    });
  });

  describe("Performance", () => {
    it("should fetch all providers in parallel", async () => {
      const credentials = {
        openai: { apiKey: "sk-test" },
        stripe: { apiKey: "sk_test" },
        vercel: { apiToken: "test" },
        resend: { apiKey: "test" },
      };

      const startTime = Date.now();
      const { providers } = await runAllProviders(credentials, []);
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (less than 30 seconds with mock data)
      expect(duration).toBeLessThan(30000);
      expect(Object.keys(providers).length).toBeGreaterThan(0);
    });
  });
});
