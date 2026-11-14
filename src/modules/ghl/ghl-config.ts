export const GHL_DEFAULT_BASE_URL = 'https://services.leadconnectorhq.com';

export type GhlConfig = {
  apiKey: string;
  locationId: string;
  baseUrl: URL;
  pipelineId?: string;
  pipelineStageId?: string;
};

export const GHL_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Read on every call so rotated credentials apply without a restart; never log the values.
export function getGhlConfig(env: NodeJS.ProcessEnv = process.env): GhlConfig | null {
  const apiKey = env.GHL_API_KEY?.trim();
  const locationId = env.GHL_LOCATION_ID?.trim();
  if (!apiKey || !locationId || !GHL_ID.test(locationId)) return null;
  const pipelineId = env.GHL_PIPELINE_ID?.trim() || undefined;
  const pipelineStageId = env.GHL_PIPELINE_STAGE_ID?.trim() || undefined;
  if ((pipelineId && !GHL_ID.test(pipelineId)) || (pipelineStageId && !GHL_ID.test(pipelineStageId))) return null;
  const baseUrl = getGhlBaseUrl(env);
  return baseUrl ? { apiKey, locationId, baseUrl, pipelineId, pipelineStageId } : null;
}

// Shared by ARK's own account and connected provider accounts.
export function getGhlBaseUrl(env: NodeJS.ProcessEnv = process.env): URL | null {
  try {
    const baseUrl = new URL(env.GHL_BASE_URL?.trim() || GHL_DEFAULT_BASE_URL);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname);
    if ((baseUrl.protocol !== 'https:' && !(local && baseUrl.protocol === 'http:')) ||
        baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || baseUrl.pathname !== '/') return null;
    return baseUrl;
  } catch {
    return null;
  }
}
