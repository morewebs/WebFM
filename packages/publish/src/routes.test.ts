import { describe, expect, it } from "vitest";
import { normalizeRoute, routeDepth, routeToFilePath, withRouteSuffix } from "./routes";

describe("static route mapping", () => {
  it("maps the site root to index.html", () => {
    expect(routeToFilePath("/")).toBe("index.html");
    expect(routeDepth("/")).toBe(0);
  });

  it("maps nested routes to route folders", () => {
    expect(routeToFilePath("/about")).toBe("about/index.html");
    expect(routeToFilePath("/a/b")).toBe("a/b/index.html");
    expect(routeToFilePath("/a/b/")).toBe("a/b/index.html");
    expect(routeDepth("/a/b")).toBe(2);
  });

  it("normalizes duplicate and trailing slashes", () => {
    expect(normalizeRoute("//about///team/")).toBe("about/team");
    expect(routeToFilePath("///blog//2026//")).toBe("blog/2026/index.html");
    expect(routeToFilePath("")).toBe("index.html");
  });

  it("rejects traversal segments", () => {
    expect(() => routeToFilePath("/../secret")).toThrow(/Unsafe page route/);
    expect(() => routeToFilePath("/a/../../b")).toThrow(/escapes the output directory/);
    expect(() => routeToFilePath("/a/\0b")).toThrow(/Unsafe page route/);
  });

  it("rejects absolute filesystem paths", () => {
    expect(() => routeToFilePath("C:\\Users\\site")).toThrow(/absolute filesystem path/);
    expect(() => routeToFilePath("\\\\server\\share")).toThrow(/absolute filesystem path/);
  });

  it("adds a numeric suffix to colliding files", () => {
    expect(withRouteSuffix("index.html", 2)).toBe("index-2.html");
    expect(withRouteSuffix("about/index.html", 2)).toBe("about-2/index.html");
    expect(withRouteSuffix("a/b/index.html", 3)).toBe("a/b-3/index.html");
  });
});
