// Private GitHub firmware source (read-only token).
//
// Lets the app read the firmware catalog + binaries from a PRIVATE GitHub repo
// via the Contents API, authenticated with a fine-grained read-only PAT. This
// is the "quick" option: no separate hosting/CDN, publish = git push.
//
// Configure via env (Vite):
//   VITE_FIRMWARE_GITHUB_REPO   "owner/repo"  (e.g. "NjordKonge/njord-firmware")
//   VITE_FIRMWARE_GITHUB_PATH   base dir in the repo (default "public/firmware")
//   VITE_FIRMWARE_GITHUB_REF    branch / tag / sha (default "main")
//   VITE_FIRMWARE_GITHUB_TOKEN  fine-grained PAT, Contents: Read-only on that repo
//
// !! SECURITY: the token is bundled into the shipped APK (Vite inlines VITE_*
// env at build time) and is EXTRACTABLE by anyone who unpacks the app. Treat it
// as low-value: make it read-only and scope it to ONE dedicated firmware repo so
// a leak exposes only the firmware binaries (which already ship inside the APK),
// not any real source. Fine-grained PAT `Contents: read` is repo-WIDE, so do NOT
// point this at a repo that also holds private source.

const REPO = (import.meta.env.VITE_FIRMWARE_GITHUB_REPO as string | undefined)?.trim();
const BASE_PATH = (
  (import.meta.env.VITE_FIRMWARE_GITHUB_PATH as string | undefined) ?? "public/firmware"
)
  .trim()
  .replace(/^\/+|\/+$/g, "");
const REF = (
  (import.meta.env.VITE_FIRMWARE_GITHUB_REF as string | undefined) ?? "main"
).trim();
const TOKEN = (import.meta.env.VITE_FIRMWARE_GITHUB_TOKEN as string | undefined)?.trim();

const API_HOST = "api.github.com";

/** True when a private GitHub firmware source is configured (repo + token). */
export function hasGithubFirmwareSource(): boolean {
  return !!REPO && !!TOKEN;
}

/** Build the GitHub Contents API URL for a path relative to the firmware base. */
export function githubContentsUrl(relPath: string): string {
  const clean = relPath.replace(/^\/+/, "");
  const full = BASE_PATH ? `${BASE_PATH}/${clean}` : clean;
  const u = new URL(`https://${API_HOST}/repos/${REPO}/contents/${full}`);
  if (REF) u.searchParams.set("ref", REF);
  return u.toString();
}

/** Catalog (index.json) URL for the configured GitHub source, or null. */
export function githubCatalogUrl(): string | null {
  return hasGithubFirmwareSource() ? githubContentsUrl("index.json") : null;
}

/** Manifest (latest.json) URL for the configured GitHub source, or null. */
export function githubManifestUrl(): string | null {
  return hasGithubFirmwareSource() ? githubContentsUrl("latest.json") : null;
}

/**
 * fetch() wrapper that authenticates GitHub Contents API requests with the
 * configured token and asks for the RAW file bytes. Any non-GitHub URL (e.g.
 * the bundled `/firmware/` fallback, or a plain public URL) is passed straight
 * through to `fetch`, so this is safe to use for every firmware fetch.
 */
export function firmwareFetch(url: string, init?: RequestInit): Promise<Response> {
  let u: URL | null = null;
  try {
    u = new URL(url, window.location.href);
  } catch {
    u = null;
  }

  if (!u || u.host !== API_HOST || !TOKEN) {
    return fetch(url, init);
  }

  // `new URL(relative, apiUrl)` drops the ?ref query when resolving release
  // binary paths, so re-apply it here.
  if (REF && !u.searchParams.has("ref")) {
    u.searchParams.set("ref", REF);
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${TOKEN}`);
  // The raw media type makes the endpoint return the file's bytes directly
  // (instead of the base64 JSON metadata envelope).
  if (!headers.has("Accept")) headers.set("Accept", "application/vnd.github.raw");
  headers.set("X-GitHub-Api-Version", "2022-11-28");

  return fetch(u.toString(), { ...init, headers });
}
