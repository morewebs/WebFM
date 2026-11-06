import type { Asset, Page, Project } from "@webfm/model";
import { type RenderOptions } from "@webfm/render";
import { buildPageCss, renderPageToHtml } from "@webfm/render/server";
import { defaultAssetPath, normalizeAssetPath, publishAssetUrl } from "../asset-paths";
import { relativeStylesheetHref, renderPageDocument } from "../document";
import { routeDepth, routeToFilePath, withRouteSuffix } from "../routes";
import type {
  AssetPayload,
  AssetResolver,
  PublishAdapter,
  PublishFiles,
  PublishInput,
  PublishResult,
} from "../types";

function pageTitle(page: Page, project: Project): string {
  const name = page.name.trim() || "Untitled";
  const projectName = project.name.trim();
  return projectName ? `${name} — ${projectName}` : name;
}

/** Resolves every project asset before the synchronous render pass. */
async function resolveAssets(
  project: Project,
  resolver: AssetResolver,
  files: PublishFiles,
): Promise<{ urls: Map<string, string>; count: number }> {
  const urls = new Map<string, string>();
  let count = 0;

  for (const asset of project.assets) {
    let payload: AssetPayload | null = null;
    try {
      payload = await resolver.resolve(asset.id);
    } catch {
      // An asset that cannot be read must not fail the whole publish.
      continue;
    }
    if (payload === null) continue;

    const supplied = normalizeAssetPath(payload.path);
    const path = supplied ?? defaultAssetPath(asset.id, asset.name);
    const url = publishAssetUrl(path);
    if (url === null) continue;

    files[path] = payload.bytes;
    urls.set(asset.id, url);
    count += 1;
  }

  return { urls, count };
}

/** A page path that does not collide with an earlier page. */
function uniquePagePath(route: string, used: Set<string>): string {
  const base = routeToFilePath(route);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = withRouteSuffix(base, suffix);
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Static site adapter. Renders every page to a standalone HTML document and
 * a shared stylesheet, and copies every resolvable project asset. The result
 * is self-contained: no runtime fetch and no framework required.
 */
export const staticAdapter: PublishAdapter = {
  id: "static",
  name: "Static site",

  async publish(input: PublishInput): Promise<PublishResult> {
    const { project, assets } = input;
    const primary = project.breakpoints[0];
    if (!primary) {
      throw new Error("Cannot publish: the project has no breakpoints.");
    }

    const files: PublishFiles = {};
    const resolved = await resolveAssets(project, assets, files);

    const options: RenderOptions = {
      breakpointId: primary.id,
      mode: "publish",
      assetUrl: (asset: Asset) => resolved.urls.get(asset.id) ?? asset.url,
    };

    const usedPaths = new Set<string>();
    const stylesheets: string[] = [];

    for (const page of project.pages) {
      const filePath = uniquePagePath(page.path, usedPaths);
      files[filePath] = renderPageDocument({
        title: pageTitle(page, project),
        stylesheetHref: relativeStylesheetHref(routeDepth(page.path)),
        body: renderPageToHtml(project, page, options),
      });
      stylesheets.push(buildPageCss(project, page, options));
    }

    files["styles.css"] = stylesheets.join("\n\n");

    return {
      files,
      entry: "index.html",
      summary: `${project.pages.length} pages, ${resolved.count} assets`,
    };
  },
};
