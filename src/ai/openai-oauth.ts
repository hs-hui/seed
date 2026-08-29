import { openaiCredentials } from '@openai-oauth/local';
import { runOpenAIOAuthLogin } from 'openai-oauth';
import { spawn } from 'node:child_process';

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

function openBrowser(url: string): void {
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => console.log(`Open this URL in your browser: ${url}`));
  child.unref();
}

export function addCodexOriginator(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.searchParams.set('originator', 'codex_cli_rs');
  return url.toString();
}

function openLoginUrl(message: string): boolean {
  const prefix = 'OpenAI OAuth login URL: ';
  if (!message.startsWith(prefix)) return false;
  try {
    // The current Codex OAuth authorize endpoint requires the same originator
    // marker used by the official Codex CLI. openai-oauth 2.0.0 omits it.
    const loginUrl = addCodexOriginator(message.slice(prefix.length));
    console.log(`OpenAI OAuth login URL: ${loginUrl}`);
    openBrowser(loginUrl);
  } catch {
    console.log(message);
  }
  return true;
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
    // Open the URL ourselves so we can add the required Codex originator
    // parameter before the browser sends the authorization request.
    openBrowser: false,
    onMessage: (message) => { if (!openLoginUrl(message)) console.log(message); },
  });
  return normalize(saved.auth);
}
