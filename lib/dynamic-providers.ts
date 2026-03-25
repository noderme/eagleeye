// Dynamic service discovery — hybrid approach:
// 1. Static JSON registry covers 80+ common dev services (zero cost, instant)
// 2. Generic credential inference as fallback for truly unknown providers
// No LLM calls here — Claude is only used in analyze.ts for post-scan insights

import { MOCK_MODE_ENABLED } from "./config";
import registryData from "./provider-registry.json";

export interface ServiceMetadata {
  id: string;
  name: string;
  description: string;
  category: "cloud" | "ai" | "database" | "payments" | "monitoring" | "devops" | "email" | "messaging" | "auth" | "analytics" | "search" | "media" | "cms" | "ecommerce" | "realtime" | "devtools" | "finance" | "data" | "support" | "crm" | "hosting" | "other";
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

// ── Static registry loaded from JSON ──────────────────────────────────────────
// Each entry has: id, name, category, docsUrl, credentialFields[], signals[]
// signals[] are package names / env var names used to auto-detect the provider

interface RegistryEntry {
  id: string;
  name: string;
  category: string;
  docsUrl: string;
  credentialFields: Array<{ key: string; label: string; placeholder: string; secret: boolean }>;
  signals: string[];
}

const STATIC_REGISTRY: RegistryEntry[] = registryData as RegistryEntry[];

// Build a fast lookup map: signal → registry entry
const SIGNAL_MAP = new Map<string, RegistryEntry>();
for (const entry of STATIC_REGISTRY) {
  // Index by id
  SIGNAL_MAP.set(entry.id.toLowerCase(), entry);
  // Index by each signal string
  for (const signal of entry.signals) {
    SIGNAL_MAP.set(signal.toLowerCase(), entry);
  }
}

// Runtime registry for dynamically discovered / registered services
const SERVICE_REGISTRY: Map<string, ServiceMetadata> = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function registryEntryToMetadata(entry: RegistryEntry): ServiceMetadata {
  return {
    id: entry.id,
    name: entry.name,
    description: `${entry.name} integration`,
    category: entry.category as ServiceMetadata["category"],
    website: `https://${entry.id}.com`,
    docsUrl: entry.docsUrl,
    apiBaseUrl: `https://api.${entry.id}.com`,
    credentialTypes: entry.credentialFields.map((f) => ({
      name: f.label,
      key: f.key,
      type: f.secret ? "password" : "text",
      required: true,
      placeholder: f.placeholder,
      description: f.label,
    })),
    mockData: MOCK_MODE_ENABLED ? generateMockDataForService(entry.id, entry.category) : undefined,
  };
}

/**
 * Detect if a service name matches a known pattern in the static registry
 */
export function identifyService(serviceId: string): Partial<ServiceMetadata> | null {
  const lower = serviceId.toLowerCase();

  // Exact match
  const exact = SIGNAL_MAP.get(lower);
  if (exact) return registryEntryToMetadata(exact);

  // Partial match — serviceId contains or is contained by a signal
  for (const [signal, entry] of SIGNAL_MAP.entries()) {
    if (lower.includes(signal) || signal.includes(lower)) {
      return registryEntryToMetadata(entry);
    }
  }

  return null;
}

/**
 * Infer credential types for completely unknown providers
 */
export function inferCredentialTypes(serviceId: string, category: string): CredentialType[] {
  const credentials: CredentialType[] = [
    {
      name: "API Key",
      key: "apiKey",
      type: "password",
      required: true,
      placeholder: "Enter your API key",
      description: "Your API key for authentication",
    },
  ];

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

  return credentials;
}

/**
 * Generate mock data for a service based on its category
 */
export function generateMockDataForService(serviceId: string, category: string): Record<string, any> {
  switch (category) {
    case "ai":
      return {
        provider: serviceId,
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
        _summary: "3 databases · 2.5 GB used",
        _signal: "Database health is good",
        _status: "good",
      };
    case "payments":
      return {
        provider: serviceId,
        balance: 5234.56,
        currency: "USD",
        _summary: "$5,234.56 available",
        _signal: "Payment processing active",
        _status: "good",
      };
    case "monitoring":
      return {
        provider: serviceId,
        uptime: "99.95%",
        _summary: "99.95% uptime",
        _signal: "System health is excellent",
        _status: "good",
      };
    case "hosting":
    case "cloud":
      return {
        provider: serviceId,
        resources: 15,
        spend: 234.56,
        _summary: "15 resources · $234.56/mo",
        _signal: "Infrastructure healthy",
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
 * Get service metadata by ID — checks static registry first, then runtime registry
 */
export function getService(serviceId: string): ServiceMetadata | null {
  // Check runtime registry first (user-registered or previously resolved)
  if (SERVICE_REGISTRY.has(serviceId)) {
    return SERVICE_REGISTRY.get(serviceId) || null;
  }

  // Try static registry
  const identified = identifyService(serviceId);
  if (identified && identified.id) {
    const full = registerService(serviceId, identified);
    return full;
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
 * Get all providers from the static registry (for display/search)
 */
export function getStaticRegistry(): RegistryEntry[] {
  return STATIC_REGISTRY;
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
    } else {
      // Unknown provider — register with generic credentials
      const generic = registerService(providerId, {
        name: providerId.charAt(0).toUpperCase() + providerId.slice(1),
        category: "other",
      });
      registered.push(generic);
    }
  }
  return registered;
}

/**
 * Fetch API documentation for a service
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
