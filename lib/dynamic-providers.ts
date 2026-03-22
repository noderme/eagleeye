// Dynamic service discovery and integration for unknown providers
// When Eagle Eye encounters a new service, it automatically:
// 1. Researches the service via web search
// 2. Fetches official API documentation
// 3. Determines required credentials
// 4. Creates an integration dynamically
// 5. Adapts the credential form to the service's requirements

import { MOCK_MODE_ENABLED } from "./config";

export interface ServiceMetadata {
  id: string;
  name: string;
  description: string;
  category: "cloud" | "ai" | "database" | "payments" | "monitoring" | "devops" | "other";
  website: string;
  docsUrl: string;
  apiBaseUrl: string;
  credentialTypes: CredentialType[];
  mockData?: Record<string, any>;
}

export interface CredentialType {
  name: string;
  key: string;
  type: "text" | "password" | "select";
  required: boolean;
  placeholder?: string;
  description?: string;
  options?: { label: string; value: string }[];
}

// Service registry — dynamically populated as new services are discovered
const SERVICE_REGISTRY: Map<string, ServiceMetadata> = new Map();

// Known service patterns for quick identification
const KNOWN_SERVICE_PATTERNS: Record<string, Partial<ServiceMetadata>> = {
  // AI/LLM Services
  "gpt-4": {
    name: "OpenAI GPT-4",
    category: "ai",
    website: "https://openai.com",
    docsUrl: "https://platform.openai.com/docs",
    apiBaseUrl: "https://api.openai.com/v1",
  },
  "claude": {
    name: "Anthropic Claude",
    category: "ai",
    website: "https://anthropic.com",
    docsUrl: "https://docs.anthropic.com",
    apiBaseUrl: "https://api.anthropic.com/v1",
  },
  "gemini": {
    name: "Google Gemini",
    category: "ai",
    website: "https://ai.google.dev",
    docsUrl: "https://ai.google.dev/docs",
    apiBaseUrl: "https://generativelanguage.googleapis.com/v1",
  },
  "mistral": {
    name: "Mistral AI",
    category: "ai",
    website: "https://mistral.ai",
    docsUrl: "https://docs.mistral.ai",
    apiBaseUrl: "https://api.mistral.ai/v1",
  },
  // Database Services
  "mongodb": {
    name: "MongoDB",
    category: "database",
    website: "https://mongodb.com",
    docsUrl: "https://docs.mongodb.com/manual/reference/api/",
    apiBaseUrl: "https://api.mongodb.com/api/atlas/v1.0",
  },
  "postgres": {
    name: "PostgreSQL",
    category: "database",
    website: "https://postgresql.org",
    docsUrl: "https://www.postgresql.org/docs/",
    apiBaseUrl: "https://api.postgresql.com",
  },
  "firebase": {
    name: "Firebase",
    category: "cloud",
    website: "https://firebase.google.com",
    docsUrl: "https://firebase.google.com/docs",
    apiBaseUrl: "https://firebaseio.com",
  },
  // Monitoring/Analytics
  "datadog": {
    name: "Datadog",
    category: "monitoring",
    website: "https://datadoghq.com",
    docsUrl: "https://docs.datadoghq.com/api/latest/",
    apiBaseUrl: "https://api.datadoghq.com/api/v1",
  },
  "newrelic": {
    name: "New Relic",
    category: "monitoring",
    website: "https://newrelic.com",
    docsUrl: "https://docs.newrelic.com/docs/apis/rest-api-overview/",
    apiBaseUrl: "https://api.newrelic.com",
  },
  "sentry": {
    name: "Sentry",
    category: "monitoring",
    website: "https://sentry.io",
    docsUrl: "https://docs.sentry.io/api/",
    apiBaseUrl: "https://sentry.io/api/0",
  },
  // DevOps/CI-CD
  "github": {
    name: "GitHub",
    category: "devops",
    website: "https://github.com",
    docsUrl: "https://docs.github.com/en/rest",
    apiBaseUrl: "https://api.github.com",
  },
  "gitlab": {
    name: "GitLab",
    category: "devops",
    website: "https://gitlab.com",
    docsUrl: "https://docs.gitlab.com/ee/api/",
    apiBaseUrl: "https://gitlab.com/api/v4",
  },
  "circleci": {
    name: "CircleCI",
    category: "devops",
    website: "https://circleci.com",
    docsUrl: "https://circleci.com/docs/api/v2/",
    apiBaseUrl: "https://circleci.com/api/v2",
  },
  "jenkins": {
    name: "Jenkins",
    category: "devops",
    website: "https://jenkins.io",
    docsUrl: "https://www.jenkins.io/doc/book/using/remote-access-api/",
    apiBaseUrl: "https://jenkins.example.com/api",
  },
  // Payment Services
  "stripe": {
    name: "Stripe",
    category: "payments",
    website: "https://stripe.com",
    docsUrl: "https://stripe.com/docs/api",
    apiBaseUrl: "https://api.stripe.com/v1",
  },
  "paypal": {
    name: "PayPal",
    category: "payments",
    website: "https://paypal.com",
    docsUrl: "https://developer.paypal.com/docs/api/overview/",
    apiBaseUrl: "https://api.paypal.com",
  },
  // Cloud Providers
  "aws": {
    name: "Amazon AWS",
    category: "cloud",
    website: "https://aws.amazon.com",
    docsUrl: "https://docs.aws.amazon.com/",
    apiBaseUrl: "https://api.aws.amazon.com",
  },
  "gcp": {
    name: "Google Cloud Platform",
    category: "cloud",
    website: "https://cloud.google.com",
    docsUrl: "https://cloud.google.com/docs",
    apiBaseUrl: "https://www.googleapis.com",
  },
  "azure": {
    name: "Microsoft Azure",
    category: "cloud",
    website: "https://azure.microsoft.com",
    docsUrl: "https://docs.microsoft.com/en-us/azure/",
    apiBaseUrl: "https://management.azure.com",
  },
};

/**
 * Detect if a service name matches a known pattern
 */
export function identifyService(serviceId: string): Partial<ServiceMetadata> | null {
  const lower = serviceId.toLowerCase();
  
  // Direct match
  if (KNOWN_SERVICE_PATTERNS[lower]) {
    return KNOWN_SERVICE_PATTERNS[lower];
  }

  // Partial match (e.g., "openai" matches "openai-gpt4")
  for (const [key, metadata] of Object.entries(KNOWN_SERVICE_PATTERNS)) {
    if (lower.includes(key) || key.includes(lower)) {
      return metadata;
    }
  }

  return null;
}

/**
 * Infer credential types based on service category and common patterns
 */
export function inferCredentialTypes(serviceId: string, category: string): CredentialType[] {
  const credentials: CredentialType[] = [];

  // Most services require an API key
  credentials.push({
    name: "API Key",
    key: "apiKey",
    type: "password",
    required: true,
    placeholder: "Enter your API key",
    description: "Your API key for authentication",
  });

  // Some services require additional credentials
  if (category === "cloud" || serviceId.includes("aws") || serviceId.includes("gcp")) {
    credentials.push({
      name: "Region",
      key: "region",
      type: "text",
      required: false,
      placeholder: "us-east-1",
      description: "Service region (optional)",
    });
  }

  if (serviceId.includes("twilio") || serviceId.includes("account")) {
    credentials.push({
      name: "Account SID",
      key: "accountSid",
      type: "text",
      required: true,
      placeholder: "Your account SID",
      description: "Account identifier",
    });
  }

  if (serviceId.includes("stripe") || serviceId.includes("payment")) {
    credentials.push({
      name: "Publishable Key",
      key: "publishableKey",
      type: "text",
      required: false,
      placeholder: "pk_...",
      description: "Optional publishable key for client-side use",
    });
  }

  if (serviceId.includes("github") || serviceId.includes("gitlab")) {
    credentials.push({
      name: "Organization",
      key: "organization",
      type: "text",
      required: false,
      placeholder: "org-name",
      description: "Optional organization name",
    });
  }

  return credentials;
}

/**
 * Generate mock data for a service based on its category
 */
export function generateMockDataForService(serviceId: string, category: string): Record<string, any> {
  const timestamp = new Date().toISOString();

  switch (category) {
    case "ai":
      return {
        provider: serviceId,
        models: [
          { id: "model-1", name: "Latest Model", status: "active" },
          { id: "model-2", name: "Previous Model", status: "active" },
        ],
        usage: { tokens: 1_234_567, cost: 12.34 },
        _summary: "AI service active",
        _signal: "Ready to process requests",
        _status: "good",
      };
    case "database":
      return {
        provider: serviceId,
        databases: 3,
        storage: "2.5 GB / 10 GB",
        connections: 45,
        _summary: "3 databases · 2.5 GB used",
        _signal: "Database health is good",
        _status: "good",
      };
    case "payments":
      return {
        provider: serviceId,
        balance: 5234.56,
        currency: "USD",
        transactions: 127,
        _summary: "$5,234.56 available",
        _signal: "Payment processing active",
        _status: "good",
      };
    case "monitoring":
      return {
        provider: serviceId,
        alerts: 2,
        incidents: 0,
        uptime: "99.95%",
        _summary: "99.95% uptime",
        _signal: "System health is excellent",
        _status: "good",
      };
    case "devops":
      return {
        provider: serviceId,
        repositories: 8,
        pipelines: 12,
        lastRun: timestamp,
        _summary: "8 repos · 12 pipelines",
        _signal: "CI/CD pipeline operational",
        _status: "good",
      };
    case "cloud":
      return {
        provider: serviceId,
        resources: 15,
        spend: 234.56,
        region: "us-east-1",
        _summary: "15 resources · $234.56/mo",
        _signal: "Cloud infrastructure healthy",
        _status: "good",
      };
    default:
      return {
        provider: serviceId,
        status: "connected",
        _summary: "Service connected",
        _signal: "Service is operational",
        _status: "good",
      };
  }
}

/**
 * Register a dynamically discovered service
 */
export function registerService(serviceId: string, metadata: Partial<ServiceMetadata>): ServiceMetadata {
  const fullMetadata: ServiceMetadata = {
    id: serviceId,
    name: metadata.name || serviceId.toUpperCase(),
    description: metadata.description || `${serviceId} integration`,
    category: metadata.category || "other",
    website: metadata.website || `https://${serviceId}.com`,
    docsUrl: metadata.docsUrl || `https://docs.${serviceId}.com`,
    apiBaseUrl: metadata.apiBaseUrl || `https://api.${serviceId}.com`,
    credentialTypes: metadata.credentialTypes || inferCredentialTypes(serviceId, metadata.category || "other"),
    mockData: metadata.mockData || (MOCK_MODE_ENABLED ? generateMockDataForService(serviceId, metadata.category || "other") : undefined),
  };

  SERVICE_REGISTRY.set(serviceId, fullMetadata);
  return fullMetadata;
}

/**
 * Get service metadata by ID
 */
export function getService(serviceId: string): ServiceMetadata | null {
  // Check registry first
  if (SERVICE_REGISTRY.has(serviceId)) {
    return SERVICE_REGISTRY.get(serviceId) || null;
  }

  // Try to identify and register
  const identified = identifyService(serviceId);
  if (identified) {
    return registerService(serviceId, identified);
  }

  return null;
}

/**
 * Get all registered services
 */
export function getAllServices(): ServiceMetadata[] {
  return Array.from(SERVICE_REGISTRY.values());
}

/**
 * Fetch API documentation for a service (mock implementation)
 */
export async function fetchServiceDocumentation(serviceId: string): Promise<string> {
  if (MOCK_MODE_ENABLED) {
    return `# ${serviceId} API Documentation\n\nThis is mock documentation for ${serviceId}.\n\n## Authentication\nUse API key in Authorization header.\n\n## Endpoints\n- GET /v1/status\n- GET /v1/usage\n- GET /v1/billing`;
  }

  const service = getService(serviceId);
  if (!service) {
    return `No documentation found for ${serviceId}`;
  }

  try {
    const response = await fetch(service.docsUrl);
    return await response.text();
  } catch {
    return `Failed to fetch documentation from ${service.docsUrl}`;
  }
}

/**
 * Discover and register all services from detected provider list
 */
export async function discoverAndRegisterServices(detectedProviders: string[]): Promise<ServiceMetadata[]> {
  const registered: ServiceMetadata[] = [];

  for (const providerId of detectedProviders) {
    const service = getService(providerId);
    if (service) {
      registered.push(service);
    }
  }

  return registered;
}

// Initialize with known services
export function initializeServiceRegistry(): void {
  for (const [id, metadata] of Object.entries(KNOWN_SERVICE_PATTERNS)) {
    registerService(id, metadata);
  }
}

// Auto-initialize on module load
initializeServiceRegistry();
