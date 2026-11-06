import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Project, ProjectSummary } from "@webfm/model";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer, type ServerOptions } from "./index";
import type { PublishInput, PublishResult, PublishService } from "./publish";

class FakePublishService implements PublishService {
  readonly inputs: PublishInput[] = [];

  async publish(input: PublishInput): Promise<PublishResult> {
    this.inputs.push(input);
    return {
      artifactId: "pub_fake_001",
      entry: "index.html",
      summary: "Published 1 page",
      files: {
        "index.html": "<!doctype html><html><body><h1>Published</h1></body></html>",
        "assets/style.css": "body { color: red; }",
      },
    };
  }
}

function multipartBody(
  boundary: string,
  field: string,
  filename: string,
  contentType: string,
  content: Buffer,
): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

describe("server API", () => {
  let dataDir: string;
  const apps: FastifyInstance[] = [];
  const extraDirs: string[] = [];

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "webfm-server-"));
    apps.length = 0;
    extraDirs.length = 0;
  });

  afterEach(async () => {
    await Promise.all(apps.map(async (app) => app.close()));
    await rm(dataDir, { recursive: true, force: true });
    await Promise.all(extraDirs.map(async (dir) => rm(dir, { recursive: true, force: true })));
  });

  function makeApp(overrides: Partial<ServerOptions> = {}): FastifyInstance {
    const app = buildServer({ dataDir, logger: false, ...overrides });
    apps.push(app);
    return app;
  }

  async function createProject(app: FastifyInstance, name = "Site"): Promise<Project> {
    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as Project;
  }

  it("reports health", async () => {
    const app = makeApp();
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, name: "WebFM", version: "0.1.0" });
  });

  it("creates, lists and reads projects", async () => {
    const app = makeApp();
    const created = await createProject(app, "Portfolio");

    const list = await app.inject({ method: "GET", url: "/api/projects" });
    expect(list.statusCode).toBe(200);
    const summaries = list.json() as ProjectSummary[];
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ id: created.id, name: "Portfolio", version: 1, pageCount: 1 });

    const get = await app.inject({ method: "GET", url: `/api/projects/${created.id}` });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual(created);

    const missing = await app.inject({ method: "GET", url: "/api/projects/proj_missing" });
    expect(missing.statusCode).toBe(404);
  });

  it("increments version, preserves createdAt and rejects a stale expectedVersion", async () => {
    const app = makeApp();
    const created = await createProject(app);

    const first = await app.inject({
      method: "PUT",
      url: `/api/projects/${created.id}`,
      payload: { project: { ...created, name: "Renamed" }, expectedVersion: created.version },
    });
    expect(first.statusCode).toBe(200);
    const saved = first.json() as Project;
    expect(saved.version).toBe(created.version + 1);
    expect(saved.createdAt).toBe(created.createdAt);
    expect(saved.name).toBe("Renamed");
    expect(saved.updatedAt >= created.updatedAt).toBe(true);

    const stale = await app.inject({
      method: "PUT",
      url: `/api/projects/${created.id}`,
      payload: { project: { ...created, name: "Stale" }, expectedVersion: created.version },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({
      error: "version_conflict",
      currentVersion: created.version + 1,
    });
  });

  it("rejects a body id that does not match the route", async () => {
    const app = makeApp();
    const created = await createProject(app);

    const response = await app.inject({
      method: "PUT",
      url: `/api/projects/${created.id}`,
      payload: { project: { ...created, id: "proj_other" }, expectedVersion: created.version },
    });

    expect(response.statusCode).toBe(400);
  });

  it("deletes a project and then reports 404", async () => {
    const app = makeApp();
    const created = await createProject(app);

    const removed = await app.inject({ method: "DELETE", url: `/api/projects/${created.id}` });
    expect(removed.statusCode).toBe(204);

    const get = await app.inject({ method: "GET", url: `/api/projects/${created.id}` });
    expect(get.statusCode).toBe(404);

    const again = await app.inject({ method: "DELETE", url: `/api/projects/${created.id}` });
    expect(again.statusCode).toBe(404);
  });

  it("uploads an asset from a multipart body and serves its bytes", async () => {
    const app = makeApp();
    const created = await createProject(app);
    const boundary = "----webfm-test-boundary";
    const content = Buffer.from("hello asset bytes");
    const body = multipartBody(boundary, "file", "photo.png", "image/png", content);

    const upload = await app.inject({
      method: "POST",
      url: `/api/projects/${created.id}/assets`,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(upload.statusCode).toBe(200);
    const result = upload.json() as {
      asset: { id: string; name: string; mimeType: string; size: number; url: string };
      project: Project;
    };
    expect(result.asset.name).toBe("photo.png");
    expect(result.asset.mimeType).toBe("image/png");
    expect(result.asset.size).toBe(content.length);
    expect(result.asset.url).toBe(`/api/projects/${created.id}/assets/${result.asset.id}`);
    expect(result.project.assets.map((asset) => asset.id)).toEqual([result.asset.id]);
    expect(result.project.version).toBe(created.version + 1);

    const served = await app.inject({ method: "GET", url: result.asset.url });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(String(served.headers["cache-control"])).toContain("max-age=31536000");
    expect(served.rawPayload.equals(content)).toBe(true);

    const missing = await app.inject({
      method: "GET",
      url: `/api/projects/${created.id}/assets/asset_missing`,
    });
    expect(missing.statusCode).toBe(404);
  });

  it("rejects non-multipart asset uploads", async () => {
    const app = makeApp();
    const created = await createProject(app);

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${created.id}/assets`,
      payload: {},
    });
    expect(response.statusCode).toBe(415);
  });

  it("publishes through an injected service and serves the zip", async () => {
    const publishService = new FakePublishService();
    const app = makeApp({ publishService });
    const created = await createProject(app);

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${created.id}/publish`,
      payload: { adapterId: "static", options: { pretty: true } },
    });

    expect(response.statusCode).toBe(200);
    const result = response.json() as {
      artifactId: string;
      entry: string;
      summary: string;
      files: string[];
      zipUrl: string;
    };
    expect(result).toEqual({
      artifactId: "pub_fake_001",
      entry: "index.html",
      summary: "Published 1 page",
      files: ["assets/style.css", "index.html"],
      zipUrl: `/api/projects/${created.id}/publish/pub_fake_001/zip`,
    });
    expect(publishService.inputs).toHaveLength(1);
    expect(publishService.inputs[0]).toMatchObject({
      projectId: created.id,
      adapterId: "static",
      options: { pretty: true },
    });

    const outDir = path.join(dataDir, "projects", created.id, "publish", "pub_fake_001");
    expect(await readFile(path.join(outDir, "index.html"), "utf8")).toContain("Published");
    expect(await readFile(path.join(outDir, "assets", "style.css"), "utf8")).toContain("color: red");

    const zip = await app.inject({ method: "GET", url: result.zipUrl });
    expect(zip.statusCode).toBe(200);
    expect(zip.headers["content-type"]).toBe("application/zip");
    expect(zip.rawPayload.subarray(0, 2).toString()).toBe("PK");
    expect(zip.rawPayload.length).toBeGreaterThan(22);
  });

  it("returns 404 when publishing a missing project", async () => {
    const app = makeApp({ publishService: new FakePublishService() });

    const response = await app.inject({
      method: "POST",
      url: "/api/projects/proj_missing/publish",
      payload: { adapterId: "static" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("serves the editor build with a SPA fallback", async () => {
    const editorDir = await mkdtemp(path.join(os.tmpdir(), "webfm-editor-"));
    extraDirs.push(editorDir);
    await writeFile(path.join(editorDir, "index.html"), "<!doctype html><div id=\"app\">Editor</div>");
    await mkdir(path.join(editorDir, "assets"), { recursive: true });
    await writeFile(path.join(editorDir, "assets", "app.js"), "console.log('app');");

    const app = makeApp({ editorDistDir: editorDir });

    const root = await app.inject({ method: "GET", url: "/" });
    expect(root.statusCode).toBe(200);
    expect(root.body).toContain("Editor");

    const asset = await app.inject({ method: "GET", url: "/assets/app.js" });
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toContain("console.log");

    const spa = await app.inject({ method: "GET", url: "/dashboard/settings" });
    expect(spa.statusCode).toBe(200);
    expect(spa.body).toContain("Editor");

    const api = await app.inject({ method: "GET", url: "/api/does-not-exist" });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: "not_found" });
  });
});
