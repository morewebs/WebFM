import type { Page, Project } from "@webfm/model";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageView } from "./render";
import type { RenderOptions } from "./types";

/**
 * Server-side page markup. Returns the rendered React fragment only; the
 * publisher wraps it in its HTML document and prepends `buildPageCss`.
 */
export function renderPageToHtml(project: Project, page: Page, options: RenderOptions): string {
  return renderToStaticMarkup(createElement(PageView, { project, page, options }));
}
