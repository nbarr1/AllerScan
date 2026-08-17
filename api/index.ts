// Vercel Node.js Function entrypoint. Vercel invokes the default export per-request
// instead of the app calling app.listen() itself (see the VERCEL guard in server.ts).
// All routes (API + static asset serving + SPA fallback) are registered on import.
import app from "../server";

export default app;
