import os from 'node:os';
import path from 'node:path';
import { chmod } from 'node:fs/promises';
import { atomicWrite, ensureDir, exists, readJson } from '../utils/fs.js';

const DEVICE_ENDPOINT = 'https://auth0.openai.com/oauth/device/code';
const TOKEN_ENDPOINT = 'https://auth0.openai.com/oauth/token';
const GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
export type OpenAITokens = { access_token: string; refresh_token?: string; expires_in?: number; obtained_at: string };

function tokenPath(): string { return path.join(process.env.SEED_HOME ?? path.join(os.homedir(), '.seed'), 'oauth', 'openai.json'); }
export async function loadOpenAITokens(): Promise<OpenAITokens | null> {
  const file = tokenPath(); if (!(await exists(file))) return null;
  try { return await readJson<OpenAITokens>(file); } catch { return null; }
}
export async function loginOpenAI(clientId = process.env.SEED_OPENAI_CLIENT_ID): Promise<OpenAITokens> {
  if (!clientId) throw new Error('oauth-client-id-required');
  const deviceResponse = await fetch(DEVICE_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: clientId, audience: 'https://api.openai.com/v1' }) });
  if (!deviceResponse.ok) throw new Error(`oauth device request failed (${deviceResponse.status})`);
  const device = await deviceResponse.json() as { device_code?: string; user_code?: string; verification_uri?: string; verification_uri_complete?: string; expires_in?: number; interval?: number };
  if (!device.device_code || !device.user_code || !device.verification_uri) throw new Error('oauth device response was incomplete');
  console.log(`Open ${device.verification_uri_complete ?? device.verification_uri} and enter code ${device.user_code}.`);
  const expiresAt = Date.now() + (device.expires_in ?? 600) * 1000; let interval = Math.max(2, device.interval ?? 5);
  while (Date.now() < expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    const tokenResponse = await fetch(TOKEN_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: GRANT, client_id: clientId, device_code: device.device_code }) });
    const payload = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (tokenResponse.ok && payload.access_token) {
      const tokens: OpenAITokens = { access_token: payload.access_token, ...(payload.refresh_token ? { refresh_token: payload.refresh_token } : {}), ...(payload.expires_in ? { expires_in: payload.expires_in } : {}), obtained_at: new Date().toISOString() };
      const file = tokenPath(); await ensureDir(path.dirname(file)); await atomicWrite(file, `${JSON.stringify(tokens, null, 2)}\n`); try { await chmod(file, 0o600); } catch { /* Windows ACLs are managed by the user profile. */ }
      return tokens;
    }
    if (payload.error === 'slow_down') interval += 5;
    else if (payload.error !== 'authorization_pending') throw new Error(`oauth token request failed: ${payload.error ?? tokenResponse.status}`);
  }
  throw new Error('oauth login expired before confirmation');
}
