// Test suite for Claude analysis pipeline
// Run with: npx jest lib/analyze.test.ts

import { analyzeWithLocalModel } from "./analyze-local";
import { getMockProvider } from "./mock-providers";

describe("Claude Analysis Pipeline", () => {
  describe("analyzeWithLocalModel", () => {
    it("should generate recommendations for high OpenAI spending", async () => {
      const integrations = {
        providers: {
          openai: getMockProvider("openai"),
        },
        domains: [],
        github_data: [],
      };

      const result = await analyzeWithLocalModel(integrations);

      expect(result.summary).toBeDefined();
      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it("should detect domain expiry issues", async () => {
      const integrations = {
        providers: {},
        domains: [
          {
            domain: "example.com",
            daysLeft: 5,
            expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
        github_data: [],
      };

      const result = await analyzeWithLocalModel(integrations);

      const expiryRecommendation = result.recommendations.find(r => r.category === "expiry");
      expect(expiryRecommendation).toBeDefined();
      expect(expiryRecommendation?.severity).toBe("critical");
    });

    it("should detect risky files in GitHub repos", async () => {
      const integrations = {
        providers: {},
        domains: [],
        github_data: [
          {
            repo: { full_name: "user/repo" },
            riskyFiles: [".env", ".key"],
            ciRuns: [{ status: "completed" }],
          },
        ],
      };

      const result = await analyzeWithLocalModel(integrations);

      const securityRecommendation = result.recommendations.find(r => r.category === "security" && r.provider === "github");
      expect(securityRecommendation).toBeDefined();
      expect(securityRecommendation?.severity).toBe("critical");
    });

    it("should detect missing CI/CD pipelines", async () => {
      const integrations = {
        providers: {},
        domains: [],
        github_data: [
          {
            repo: { full_name: "user/repo1" },
            riskyFiles: [],
            ciRuns: [],
          },
          {
            repo: { full_name: "user/repo2" },
            riskyFiles: [],
            ciRuns: [],
          },
        ],
      };

      const result = await analyzeWithLocalModel(integrations);

      const ciRecommendation = result.recommendations.find(r => r.category === "ci");
      expect(ciRecommendation).toBeDefined();
      expect(ciRecommendation?.description).toContain("2");
    });

    it("should calculate total monthly spend", async () => {
      const integrations = {
        providers: {
          openai: { ...getMockProvider("openai"), monthlySpendUsd: 150 },
          stripe: { ...getMockProvider("stripe"), monthlyRecurringRevenue: 50 },
        },
        domains: [],
        github_data: [],
      };

      const result = await analyzeWithLocalModel(integrations);

      expect(result.totalMonthlySpendUsd).toBe(200);
    });

    it("should limit recommendations to 12", async () => {
      const integrations = {
        providers: {
          openai: getMockProvider("openai"),
          stripe: getMockProvider("stripe"),
          vercel: getMockProvider("vercel"),
          resend: getMockProvider("resend"),
        },
        domains: Array.from({ length: 20 }, (_, i) => ({
          domain: `example${i}.com`,
          daysLeft: 5,
          expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        })),
        github_data: [],
      };

      const result = await analyzeWithLocalModel(integrations);

      expect(result.recommendations.length).toBeLessThanOrEqual(12);
    });

    it("should prioritize critical recommendations first", async () => {
      const integrations = {
        providers: {},
        domains: [
          {
            domain: "example.com",
            daysLeft: 5,
            expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
        github_data: [
          {
            repo: { full_name: "user/repo" },
            riskyFiles: [".env"],
            ciRuns: [],
          },
        ],
      };

      const result = await analyzeWithLocalModel(integrations);

      const criticalRecommendations = result.recommendations.filter(r => r.severity === "critical");
      expect(criticalRecommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0].severity).toBe("critical");
    });

    it("should handle empty integrations gracefully", async () => {
      const integrations = {
        providers: {},
        domains: [],
        github_data: [],
      };

      const result = await analyzeWithLocalModel(integrations);

      expect(result.summary).toBeDefined();
      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.totalMonthlySpendUsd).toBeNull();
    });
  });
});
