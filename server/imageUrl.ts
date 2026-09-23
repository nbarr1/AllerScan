// The allowlist for `/api/scan`'s `imageUrl` form. Kept apart from server.ts so it can be tested
// without starting the server.
//
// Hosts the preset sample images are served from. The imageUrl branch exists only for those;
// fetching an arbitrary caller-supplied URL would let anyone use this server to reach private
// addresses (cloud metadata endpoints, localhost services) it can see and they can't.
//
// Validating the caller's string and then fetching that same string still hands an
// attacker-controlled value to fetch(): it is only safe for as long as `new URL()` and the fetch
// implementation agree about how to parse a hostile URL, and that class of parser differential is
// exactly how allowlists get bypassed. So the host that reaches fetch() is never the caller's —
// the origin below is a literal, and only the path and query survive from the request.
//
// Written as an explicit conditional over string literals rather than a lookup table: with two
// hosts it is just as readable, there is no computed property access to get wrong, and the
// constant origin is obvious to a reader and to static analysis alike.
export function resolveAllowedImageUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.hash) return null;
  if (parsed.port && parsed.port !== "443") return null;

  const host = parsed.hostname.toLowerCase();
  let origin: string | null = null;
  if (host === "images.unsplash.com") origin = "https://images.unsplash.com";
  if (host === "plus.unsplash.com") origin = "https://plus.unsplash.com";
  if (!origin) return null;

  const pathname = parsed.pathname;
  if (!pathname.startsWith("/")) return null;
  if (pathname.includes("..")) return null;
  if (!/^\/[A-Za-z0-9\-._~/%]*$/.test(pathname)) return null;

  const safeParams = new URLSearchParams();
  const allowedParams = new Set(["w", "h", "fit", "crop", "fm", "q", "auto", "dpr"]);
  for (const [k, v] of parsed.searchParams.entries()) {
    if (!allowedParams.has(k)) continue;
    if (v.length > 64) return null;
    if (!/^[A-Za-z0-9\-._~]+$/.test(v)) return null;
    safeParams.append(k, v);
  }

  const query = safeParams.toString();
  return `${origin}${pathname}${query ? `?${query}` : ""}`;
}
