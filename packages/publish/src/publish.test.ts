import type { Asset, Page, Project, SceneNode } from "@webfm/model";
import { createFrame, createImage, createPage, createProject, createText } from "@webfm/model";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { renderPageDocument } from "./document";
import { getAdapter, listAdapters, publishWithAdapter, staticAdapter, zipFiles } from "./index";
import type { AssetResolver, PublishInput } from "./types";

type TestRequest = PublishInput & { adapterId: string };

const NOW = "2026-01-01T00:00:00.000Z";

function page(name: string, path: string, children: SceneNode[] = [], id = "page"): Page {
  return createPage({
    id: `page_${id}`,
    name,
    path,
    root: createFrame({
      id: `node_root_${id}`,
      name: "Desktop",
      props: {
        size: { width: { mode: "fill" }, height: { mode: "hug" } },
        style: { fill: null },
      },
      children,
    }),
  });
}

function textNode(id: string, content: string): SceneNode {
  return createText({ id, name: content, content });
}

function projectWithPages(pages: Page[], name = "Acme"): Project {
  const project = createProject({ name, now: NOW });
  project.pages = pages;
  return project;
}

interface AssetEntry {
  bytes: Uint8Array;
  path?: string;
  mimeType?: string;
}

function resolver(entries: Record<string, AssetEntry> = {}): AssetResolver {
  return {
    async resolve(assetId) {
      const entry = entries[assetId];
      if (!entry) return null;
      return {
        path: entry.path ?? "",
        mimeType: entry.mimeType ?? "application/octet-stream",
        bytes: entry.bytes,
      };
    },
  };
}

function request(
  project: Project,
  assets: AssetResolver = resolver(),
  adapterId = "static",
): TestRequest {
  return { adapterId, project, config: {}, assets };
}

const LOGO: Asset = {
  id: "asset_logo",
  name: "logo.png",
  mimeType: "image/png",
  size: 4,
  url: "/api/projects/proj_1/assets/asset_logo",
  createdAt: NOW,
};

describe("adapter registry", () => {
  it("registers the static adapter", () => {
    expect(listAdapters()).toContainEqual({ id: "static", name: "Static site" });
    expect(getAdapter("static")).toBe(staticAdapter);
  });
});

describe("static adapter routes", () => {
  it("emits index.html for root and route folders for other pages", async () => {
    const project = projectWithPages([
      page("Home", "/", [textNode("node_home", "Home")], "home"),
      page("About", "/about", [textNode("node_about", "About")], "about"),
      page("Team", "/a/b", [textNode("node_team", "Team")], "team"),
    ]);

    const result = await staticAdapter.publish(request(project));

    expect(Object.keys(result.files).sort()).toEqual([
      "a/b/index.html",
      "about/index.html",
      "index.html",
      "styles.css",
    ]);
    expect(result.entry).toBe("index.html");
  });

  it("suffixes colliding page paths", async () => {
    const project = projectWithPages([
      page("About", "/about", [], "about_one"),
      page("About duplicate", "/about/", [], "about_two"),
    ]);

    const result = await staticAdapter.publish(request(project));
    const paths = Object.keys(result.files);

    expect(paths).toContain("about/index.html");
    expect(paths).toContain("about-2/index.html");
  });
});

describe("static adapter documents", () => {
  it("wraps the fragment in a complete document with title and stylesheet", async () => {
    const project = projectWithPages(
      [page("Home", "/", [textNode("node_hello", "Hello from WebFM")], "home")],
      "Acme",
    );

    const result = await staticAdapter.publish(request(project));
    const html = result.files["index.html"] as string;

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('name="viewport"');
    expect(html).toContain("<title>Home — Acme</title>");
    expect(html).toContain('href="styles.css"');
    expect(html).toContain('class="wfm-page"');
    expect(html).toContain("Hello from WebFM");
  });

  it("links the stylesheet relative to the route depth", async () => {
    const project = projectWithPages([
      page("Home", "/", [], "home"),
      page("About", "/about", [], "about"),
      page("Team", "/a/b", [], "team"),
    ]);

    const result = await staticAdapter.publish(request(project));

    expect(result.files["index.html"]).toContain('href="styles.css"');
    expect(result.files["about/index.html"]).toContain('href="../styles.css"');
    expect(result.files["a/b/index.html"]).toContain('href="../../styles.css"');
  });

  it("escapes the page title", async () => {
    const project = projectWithPages([page("A <Home>", "/", [], "home")], "Acme & Co");

    const result = await staticAdapter.publish(request(project));
    const html = result.files["index.html"] as string;

    expect(html).toContain("<title>A &lt;Home&gt; — Acme &amp; Co</title>");
    expect(html).not.toContain("<title>A <Home>");
  });
});

describe("static adapter fonts", () => {
  it("renders each Google Fonts link before the shared stylesheet", () => {
    const html = renderPageDocument({
      title: "Home",
      stylesheetHref: "../styles.css",
      fontLinks: [
        "https://fonts.googleapis.com/css2?family=Montserrat&display=swap",
        "https://fonts.googleapis.com/css2?family=Source+Sans+3&display=swap",
      ],
      body: "<div></div>",
    });

    const montserrat = html.indexOf(
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat&amp;display=swap">',
    );
    const sourceSans = html.indexOf(
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3&amp;display=swap">',
    );
    const shared = html.indexOf('<link rel="stylesheet" href="../styles.css">');

    expect(montserrat).toBeGreaterThan(-1);
    expect(sourceSans).toBeGreaterThan(-1);
    expect(shared).toBeGreaterThan(-1);
    expect(montserrat).toBeLessThan(shared);
    expect(sourceSans).toBeLessThan(shared);
  });

  it("emits no font links when the project only uses system fonts", async () => {
    const project = projectWithPages([
      page(
        "Home",
        "/",
        [
          createText({
            id: "node_arial",
            name: "Arial",
            content: "System",
            props: { text: { fontFamily: "Arial" } },
          }),
        ],
        "home",
      ),
    ]);

    const result = await staticAdapter.publish(request(project));
    const html = result.files["index.html"] as string;

    expect(html).not.toContain("fonts.googleapis.com");
  });

  it("links the Google fonts a project uses in every page document", async () => {
    const project = projectWithPages([
      page(
        "Home",
        "/",
        [
          createText({
            id: "node_montserrat",
            name: "Montserrat",
            content: "Hello",
            props: { text: { fontFamily: "Montserrat" } },
          }),
        ],
        "home",
      ),
      page("About", "/about", [], "about"),
    ]);

    const result = await staticAdapter.publish(request(project));
    const link =
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat&amp;display=swap">';

    expect(result.files["index.html"]).toContain(link);
    expect(result.files["about/index.html"]).toContain(link);
  });
});

describe("static adapter stylesheet", () => {
  it("concatenates every page CSS into one responsive stylesheet", async () => {
    const project = projectWithPages([
      page("Home", "/", [textNode("node_home", "Home")], "home"),
      page("About", "/about", [textNode("node_about", "About")], "about"),
    ]);

    const result = await staticAdapter.publish(request(project));
    const css = result.files["styles.css"] as string;

    expect(css).toContain("@media (max-width: 1199px)");
    expect(css).toContain(".wfm-node_home");
    expect(css).toContain(".wfm-node_about");
  });
});

describe("static adapter assets", () => {
  it("copies assets and uses their published URLs in the markup", async () => {
    const project = projectWithPages([
      page(
        "Home",
        "/",
        [
          createImage({
            id: "node_logo",
            name: "Logo",
            props: { image: { assetId: LOGO.id, src: "" } },
          }),
        ],
        "home",
      ),
    ]);
    project.assets = [LOGO];
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const result = await staticAdapter.publish(
      request(project, resolver({ [LOGO.id]: { bytes } })),
    );

    const copied = result.files["assets/asset_logo-logo.png"];
    expect(copied).toBeInstanceOf(Uint8Array);
    expect([...(copied as Uint8Array)]).toEqual([1, 2, 3, 4]);

    const html = result.files["index.html"] as string;
    expect(html).toContain('src="/assets/asset_logo-logo.png"');
    expect(result.summary).toBe("1 pages, 1 assets");
  });

  it("uses the path supplied by the asset payload", async () => {
    const project = projectWithPages([
      page(
        "Home",
        "/",
        [
          createImage({
            id: "node_logo",
            name: "Logo",
            props: { image: { assetId: LOGO.id, src: "" } },
          }),
        ],
        "home",
      ),
    ]);
    project.assets = [LOGO];

    const result = await staticAdapter.publish(
      request(
        project,
        resolver({ [LOGO.id]: { bytes: new Uint8Array([9]), path: "media/hero.png" } }),
      ),
    );

    expect(result.files["media/hero.png"]).toBeInstanceOf(Uint8Array);
    expect(result.files["index.html"]).toContain('src="/media/hero.png"');
  });

  it("skips assets that fail to resolve", async () => {
    const project = projectWithPages([
      page(
        "Home",
        "/",
        [
          createImage({
            id: "node_logo",
            name: "Logo",
            props: { image: { assetId: LOGO.id, src: "" } },
          }),
        ],
        "home",
      ),
    ]);
    project.assets = [LOGO];

    const result = await staticAdapter.publish(request(project, resolver()));

    expect(Object.keys(result.files).some((path) => path.startsWith("assets/"))).toBe(false);
    expect(result.summary).toBe("1 pages, 0 assets");
  });
});

describe("zipFiles", () => {
  it("produces a ZIP containing every entry", () => {
    const zip = zipFiles({
      "index.html": "<!doctype html>",
      "styles.css": ".wfm-page {}",
      "assets/a.bin": new Uint8Array([9, 8, 7]),
    });

    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);

    const unzipped = unzipSync(zip);
    expect(Object.keys(unzipped).sort()).toEqual(["assets/a.bin", "index.html", "styles.css"]);
    expect(unzipped["assets/a.bin"]).toBeInstanceOf(Uint8Array);
  });
});

describe("publishWithAdapter", () => {
  it("rejects an unknown adapter with a clear error", async () => {
    const project = projectWithPages([page("Home", "/", [], "home")]);

    await expect(publishWithAdapter(request(project, resolver(), "missing"))).rejects.toThrow(
      /Unknown publish adapter "missing"/,
    );
  });

  it("does not mutate the project", async () => {
    const project = projectWithPages([
      page("Home", "/", [textNode("node_hello", "Hello")], "home"),
    ]);
    const snapshot = JSON.stringify(project);

    await publishWithAdapter(request(project));

    expect(JSON.stringify(project)).toBe(snapshot);
  });
});
