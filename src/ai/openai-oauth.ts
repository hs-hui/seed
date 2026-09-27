import { openaiCredentials } from '@openai-oauth/local';
import { runOpenAIOAuthLogin } from 'openai-oauth';
import { spawn } from 'node:child_process';
import { chmod, copyFile, mkdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { t } from '../i18n/index.js';

/** Normalized shape kept for the provider/config commands. */
export type OpenAITokens = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  account_id?: string;
  obtained_at?: string;
  source_path?: string;
};
type OAuthLanguage = 'en' | 'ko';

export function openAIAuthFilePath(): string {
  if (process.env.SEED_OPENAI_AUTH_FILE) return process.env.SEED_OPENAI_AUTH_FILE;
  const seedHome = process.env.SEED_HOME ?? path.join(os.homedir(), '.seed');
  return path.join(seedHome, 'oauth', 'openai.json');
}

async function fileExists(filePath: string): Promise<boolean> {
  try { await stat(filePath); return true; } catch { return false; }
}

async function prepareAuthFile(): Promise<string> {
  const target = openAIAuthFilePath();
  if (!process.env.SEED_OPENAI_AUTH_FILE && !(await fileExists(target))) {
    const legacy = path.join(os.homedir(), '.codex', 'auth.json');
    if (await fileExists(legacy)) {
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(legacy, target);
      try { await chmod(target, 0o600); } catch { /* Windows ACLs are managed by the user profile. */ }
    }
  }
  return target;
}

/** Ensure legacy Codex credentials are copied before an OAuth client is built. */
export async function ensureOpenAIAuthFile(): Promise<string> { return prepareAuthFile(); }

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

type OAuthWriter = (message: string) => void;

function openBrowser(url: string, language: OAuthLanguage = 'en', write: OAuthWriter = (message) => console.log(message)): void {
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => write(t('oauth.browserUrl', { url }, language)));
  child.unref();
}

export function addCodexOriginator(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.searchParams.set('originator', 'codex_cli_rs');
  return url.toString();
}

function openLoginUrl(message: string, language: OAuthLanguage, write: OAuthWriter): boolean {
  const prefix = 'OpenAI OAuth login URL: ';
  if (!message.startsWith(prefix)) return false;
  try {
    // The current Codex OAuth authorize endpoint requires the same originator
    // marker used by the official Codex CLI. openai-oauth 2.0.0 omits it.
    const loginUrl = addCodexOriginator(message.slice(prefix.length));
    write(t('oauth.loginUrl', { url: loginUrl }, language));
    openBrowser(loginUrl, language, write);
  } catch {
    write(message);
  }
  return true;
}

/** Read the local Codex auth file without forcing a refresh. */
export async function loadOpenAITokens(): Promise<OpenAITokens | null> {
  try {
    const credentials = openaiCredentials({ authFilePath: await prepareAuthFile(), ensureFresh: false });
    const session = await credentials.getSession();
    return session ? normalize(session) : null;
  } catch {
    return null;
  }
}

/** Read local Codex credentials and refresh them when the package requires it. */
export async function getOpenAIToken(): Promise<string | undefined> {
  try {
    const credentials = openaiCredentials({ authFilePath: await prepareAuthFile(), ensureFresh: true });
    const session = await credentials.getSession();
    return session?.accessToken;
  } catch {
    return undefined;
  }
}

/** Run the package's loopback browser OAuth flow and save Seed's auth file. */
export async function loginOpenAI(language: OAuthLanguage = 'en', json = false): Promise<OpenAITokens> {
  const authFilePath = await prepareAuthFile();
  // JSON callers still need the browser URL, but it must not corrupt stdout.
  // Keep the machine-readable result on stdout and send OAuth progress to stderr.
  const write: OAuthWriter = json ? (message) => console.error(message) : (message) => console.log(message);
  const saved = await runOpenAIOAuthLogin({
    authFilePath,
    // Open the URL ourselves so we can add the required Codex originator
    // parameter before the browser sends the authorization request.
    openBrowser: false,
    onMessage: (message) => {
      if (openLoginUrl(message, language, write)) return;
      const savedPrefix = 'Credentials saved to ';
      if (message.startsWith(savedPrefix)) {
        const filePath = message.slice(savedPrefix.length);
        write(t('oauth.credentialsSaved', { path: filePath }, language));
        return;
      }
      write(message);
    },
  });
  return normalize(saved.auth);
}
