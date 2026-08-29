import { openaiCredentials } from '@openai-oauth/local';
import { runOpenAIOAuthLogin } from 'openai-oauth';

/** Normalized shape kept for the provider/config commands. */
export type OpenAITokens = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  account_id?: string;
  obtained_at?: string;
  source_path?: string;
};

function credentialOptions(): { authFilePath?: string; ensureFresh?: boolean } {
  const authFilePath = process.env.SEED_OPENAI_AUTH_FILE;
  return authFilePath ? { authFilePath } : {};
}

function normalize(session: {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  accountId: string;
  sourcePath?: string;
  lastRefresh?: string;
}): OpenAITokens {
  return {
    access_token: session.accessToken,
    ...(session.refreshToken ? { refresh_token: session.refreshToken } : {}),
    ...(session.idToken ? { id_token: session.idToken } : {}),
    ...(session.accountId ? { account_id: session.accountId } : {}),
    ...(session.lastRefresh ? { obtained_at: session.lastRefresh } : {}),
    ...(session.sourcePath ? { source_path: session.sourcePath } : {}),
  };
}

/** Read the local Codex auth file without forcing a refresh. */
export async function loadOpenAITokens(): Promise<OpenAITokens | null> {
  try {
    const credentials = openaiCredentials({ ...credentialOptions(), ensureFresh: false });
    const session = await credentials.getSession();
    return session ? normalize(session) : null;
  } catch {
    return null;
  }
}

/** Read local Codex credentials and refresh them when the package requires it. */
export async function getOpenAIToken(): Promise<string | undefined> {
  try {
    const credentials = openaiCredentials({ ...credentialOptions(), ensureFresh: true });
    const session = await credentials.getSession();
    return session?.accessToken;
  } catch {
    return undefined;
  }
}

/** Run the package's loopback browser OAuth flow and save ~/.codex/auth.json. */
export async function loginOpenAI(): Promise<OpenAITokens> {
  const saved = await runOpenAIOAuthLogin({
    ...(credentialOptions().authFilePath ? { authFilePath: credentialOptions().authFilePath } : {}),
    openBrowser: true,
    onMessage: (message) => console.log(message),
  });
  return normalize(saved.auth);
}
