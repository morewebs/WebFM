import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";

export interface ServerOptions {
  logger?: boolean;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get("/api/health", async () => ({
    ok: true,
    name: "WebFM",
    version: "0.1.0",
  }));

  return app;
}

async function start(): Promise<void> {
  const app = buildServer({ logger: true });
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";
  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

const entry = process.argv[1];
const isEntry = entry !== undefined && import.meta.url === pathToFileURL(entry).href;
if (isEntry) {
  void start();
}
