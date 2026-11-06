import { createProject } from "@webfm/model";
import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("api client", () => {
  it("sends project, expectedVersion and parses the saved project", async () => {
    const project = createProject({ id: "proj_1", name: "Demo" });
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        jsonResponse({ project: { ...project, version: 4 } }),
    );
    const client = createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const saved = await client.saveProject(project.id, project, 3);

    expect(saved.version).toBe(4);
    expect(saved.id).toBe(project.id);
    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe(`/api/projects/${project.id}`);
    const init = call?.[1];
    expect(init?.method).toBe("PUT");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({ project, expectedVersion: 3 });
  });

  it("throws a typed ApiError with status and parsed body", async () => {
    const project = createProject({ id: "proj_1" });
    const fetchImpl = vi.fn(
      async (): Promise<Response> =>
        jsonResponse({ error: "version_conflict", currentVersion: 9 }, 409),
    );
    const client = createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    let caught: unknown = null;
    try {
      await client.saveProject(project.id, project, 3);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const error = caught as ApiError;
    expect(error.status).toBe(409);
    expect(error.body).toEqual({ error: "version_conflict", currentVersion: 9 });
    expect(error.message).toBe("version_conflict");
  });

  it("accepts a bare array or a projects envelope from the list endpoint", async () => {
    const summary = {
      id: "proj_1",
      name: "Demo",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
      pageCount: 1,
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([summary]))
      .mockResolvedValueOnce(jsonResponse({ projects: [summary] }));
    const client = createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.listProjects()).resolves.toEqual([summary]);
    await expect(client.listProjects()).resolves.toEqual([summary]);
  });
});
