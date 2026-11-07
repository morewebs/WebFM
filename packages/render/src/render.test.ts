import type {
  Asset,
  BoxProps,
  ComponentDefinition,
  DeepPartial,
  ImageContent,
  Page,
  Project,
  SceneNode,
  TextContent,
} from "@webfm/model";
import {
  createComponentDefinition,
  createComponentInstance,
  createFrame,
  createImage,
  createProject,
  createText,
  defaultBoxProps,
  defaultImageProps,
  defaultLayout,
  defaultTextProps,
} from "@webfm/model";
import { describe, expect, it } from "vitest";
import { renderPageToHtml } from "./html";
import {
  buildPageCss,
  nodeClassName,
  resolveBoxStyles,
  resolveImageStyles,
  resolveTextStyles,
} from "./index";
import type { RenderOptions } from "./types";

const EDITOR: RenderOptions = { breakpointId: "bp_desktop", mode: "editor" };
const PUBLISH: RenderOptions = { breakpointId: "bp_desktop", mode: "publish" };

const LOGO: Asset = {
  id: "asset_logo",
  name: "logo.png",
  mimeType: "image/png",
  size: 1024,
  url: "/media/logo.png",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function projectWith(children: SceneNode[] = []): { project: Project; page: Page } {
  const project = createProject({ name: "Render test", now: "2026-01-01T00:00:00.000Z" });
  const page = project.pages[0]!;
  page.root = createFrame({
    id: "node_root",
    name: "Desktop",
    props: {
      size: { width: { mode: "fill" }, height: { mode: "hug" } },
      style: { fill: null },
    },
    children,
  });
  return { project, page };
}

function box(overrides: DeepPartial<BoxProps>): BoxProps {
  return defaultBoxProps(overrides);
}

function textContent(overrides: Partial<TextContent> = {}): TextContent {
  return { ...defaultTextProps().text, ...overrides };
}

function imageContent(overrides: Partial<ImageContent> = {}): ImageContent {
  return { ...defaultImageProps().image, ...overrides };
}

describe("PageView markup", () => {
  it("includes text content and editor data attributes in editor mode", () => {
    const headline = createText({ id: "node_hello", name: "Headline", content: "Hello WebFM" });
    const { project, page } = projectWith([headline]);

    const html = renderPageToHtml(project, page, EDITOR);

    expect(html).toContain("Hello WebFM");
    expect(html).toContain('class="wfm-page"');
    expect(html).toContain(`class="${nodeClassName("node_hello")}"`);
    expect(html).toContain('data-node-id="node_hello"');
    expect(html).toContain('data-node-type="text"');
    expect(html).toContain('data-node-name="Headline"');
    expect(html).toContain('data-node-locked="false"');
    expect(html).toContain("style=");
    expect(html).not.toContain("<html");
  });

  it("emits classes and no editor attributes in publish mode", () => {
    const headline = createText({ id: "node_hello", name: "Headline", content: "Hello WebFM" });
    const { project, page } = projectWith([headline]);

    const html = renderPageToHtml(project, page, PUBLISH);

    expect(html).toContain("Hello WebFM");
    expect(html).toContain(`class="${nodeClassName("node_hello")}"`);
    expect(html).not.toContain("data-node-id");
    expect(html).not.toContain("style=");
  });

  it("omits invisible nodes but renders locked nodes", () => {
    const hidden = createText({ id: "node_hidden", content: "Secret copy", visible: false });
    const locked = createText({ id: "node_locked", content: "Locked copy", locked: true });
    const { project, page } = projectWith([hidden, locked]);

    const editorHtml = renderPageToHtml(project, page, EDITOR);
    expect(editorHtml).not.toContain("Secret copy");
    expect(editorHtml).not.toContain("node_hidden");
    expect(editorHtml).toContain("Locked copy");
    expect(editorHtml).toContain('data-node-locked="true"');
  });

  it("resolves image sources through assetUrl and falls back to image.src", () => {
    const withAsset = createImage({
      id: "node_img",
      props: {
        image: imageContent({
          assetId: LOGO.id,
          src: "https://fallback.example/photo.png",
          alt: "Logo",
        }),
      },
    });
    const withoutAsset = createImage({
      id: "node_img_external",
      props: { image: imageContent({ src: "https://example.com/photo.jpg", alt: "Photo" }) },
    });
    const { project, page } = projectWith([withAsset, withoutAsset]);
    project.assets = [LOGO];

    const withResolver: RenderOptions = {
      ...EDITOR,
      assetUrl: (asset: Asset) => `https://cdn.example/${asset.id}.png`,
    };
    const rewritten = renderPageToHtml(project, page, withResolver);
    expect(rewritten).toContain('src="https://cdn.example/asset_logo.png"');
    expect(rewritten).not.toContain("https://fallback.example/photo.png");

    const plain = renderPageToHtml(project, page, EDITOR);
    expect(plain).toContain('src="/media/logo.png"');
    expect(plain).toContain('src="https://example.com/photo.jpg"');
    expect(plain).toContain('alt="Photo"');
  });

  it("renders an editor placeholder for an image without a source and an empty div when publishing", () => {
    const image = createImage({ id: "node_empty_image", props: { image: imageContent() } });
    const { project, page } = projectWith([image]);

    const editorHtml = renderPageToHtml(project, page, EDITOR);
    expect(editorHtml).toContain(`class="${nodeClassName("node_empty_image")}-img"`);
    expect(editorHtml).toContain("background-color:#e5e7eb");
    expect(editorHtml).not.toContain("<img");

    const publishHtml = renderPageToHtml(project, page, PUBLISH);
    expect(publishHtml).not.toContain("<img");
    expect(publishHtml).toContain(`class="${nodeClassName("node_empty_image")}-img"`);
  });
});

describe("buildPageCss", () => {
  it("emits base rules and each smaller breakpoint as a media query", () => {
    const card = createFrame({
      id: "node_card",
      name: "Card",
      props: {
        size: { width: { mode: "fixed", value: 400 }, height: { mode: "fixed", value: 200 } },
        style: { fill: { type: "solid", color: "#ff0000", opacity: 1 } },
      },
    });
    card.responsive.overrides.bp_tablet = {
      size: { width: { mode: "fixed", value: 300 } },
    };
    card.responsive.overrides.bp_phone = {
      size: { width: { mode: "fixed", value: 200 } },
      style: { fill: { type: "solid", color: "#0000ff", opacity: 1 } },
    };
    const { project, page } = projectWith([card]);

    const css = buildPageCss(project, page, PUBLISH);

    expect(css).toContain("box-sizing: border-box");
    expect(css).toContain("max-width: 100%");
    expect(css).toContain(".wfm-page {");
    expect(css).toContain(`.${nodeClassName("node_card")} {`);
    expect(css).toContain("width: 400px");
    expect(css).toContain("background-color: #ff0000");

    const tabletIndex = css.indexOf("@media (max-width: 1199px)");
    const phoneIndex = css.indexOf("@media (max-width: 809px)");
    expect(tabletIndex).toBeGreaterThan(-1);
    expect(phoneIndex).toBeGreaterThan(tabletIndex);
    expect(css).toContain("width: 300px");
    expect(css).toContain("width: 200px");
    expect(css).toContain("background-color: #0000ff");
  });

  it("publishes denormalized linked color styles without a project lookup", () => {
    const card = createFrame({
      id: "node_linked_card",
      props: {
        style: {
          fill: { type: "solid", color: "#00ff00", opacity: 0.5, styleId: "color_1" },
        },
      },
    });
    const title = createText({ id: "node_linked_title", content: "Title" });
    title.responsive.base.text.color = "#123456";
    title.responsive.base.colorStyleId = "color_1";

    const { project, page } = projectWith([card, title]);
    // Rendering must use the fill/text values, never the style record.
    project.colorStyles = [{ id: "color_1", name: "Brand", color: "#ff0000", opacity: 1 }];

    const css = buildPageCss(project, page, PUBLISH);

    expect(css).toContain("background-color: rgba(0, 255, 0, 0.5)");
    expect(css).toContain("color: #123456");
    expect(css).not.toContain("#ff0000");
  });

  it("publishes denormalized linked text styles without a project lookup", () => {
    const title = createText({ id: "node_linked_heading", content: "Heading" });
    title.responsive.base.textStyleId = "text_1";
    Object.assign(title.responsive.base.text, {
      fontFamily: "Poppins",
      fontSize: 32,
      fontWeight: 700,
      lineHeight: 40,
      letterSpacing: 1,
      color: "#123456",
      align: "center",
      textTransform: "uppercase",
      textDecoration: "underline",
      italic: true,
    });

    const { project, page } = projectWith([title]);
    // Rendering must use the denormalized typography, never the style record.
    project.textStyles = [
      {
        id: "text_1",
        name: "Display",
        values: {
          fontFamily: "Inter",
          fontSize: 12,
          fontWeight: 400,
          lineHeight: "auto",
          letterSpacing: 0,
          color: "#ff0000",
          align: "left",
          textTransform: "none",
          textDecoration: "none",
          italic: false,
        },
      },
    ];

    const css = buildPageCss(project, page, PUBLISH);

    expect(css).toContain("font-family: Poppins");
    expect(css).toContain("font-size: 32px");
    expect(css).toContain("font-weight: 700");
    expect(css).toContain("line-height: 40px");
    expect(css).toContain("letter-spacing: 1px");
    expect(css).toContain("color: #123456");
    expect(css).toContain("text-align: center");
    expect(css).toContain("text-transform: uppercase");
    expect(css).toContain("text-decoration: underline");
    expect(css).toContain("font-style: italic");
    expect(css).not.toContain("#ff0000");
  });

  it("emits text and image child classes", () => {
    const headline = createText({ id: "node_title", content: "Title", name: "Title" });
    const image = createImage({
      id: "node_photo",
      props: { image: imageContent({ src: "https://example.com/a.png", fit: "crop" }) },
    });
    const { project, page } = projectWith([headline, image]);

    const css = buildPageCss(project, page, PUBLISH);

    expect(css).toContain(`.${nodeClassName("node_title")}-text {`);
    expect(css).toContain("font-size: 16px");
    expect(css).toContain(`.${nodeClassName("node_photo")}-img {`);
    expect(css).toContain("object-fit: cover");
  });

  it("uses the asset resolver for image fills", () => {
    const hero = createFrame({
      id: "node_hero",
      props: {
        style: {
          fill: {
            type: "image",
            assetId: LOGO.id,
            src: "",
            fit: "crop",
            positionX: 20,
            positionY: 80,
          },
        },
      },
    });
    const { project, page } = projectWith([hero]);
    project.assets = [LOGO];

    const options: RenderOptions = {
      ...PUBLISH,
      assetUrl: (asset: Asset) => `https://cdn.example/${asset.id}.png`,
    };
    const css = buildPageCss(project, page, options);

    expect(css).toContain('url("https://cdn.example/asset_logo.png")');
    expect(css).toContain("background-size: cover");
    expect(css).toContain("background-position: 20% 80%");
  });
});

describe("resolveBoxStyles", () => {
  it("maps fixed, fill, hug and relative sizing", () => {
    const fixed = resolveBoxStyles(
      box({ size: { width: { mode: "fixed", value: 320 }, height: { mode: "hug" } } }),
      { parentLayout: "root" },
    );
    expect(fixed.width).toBe("320px");
    expect(fixed.height).toBe("fit-content");

    const fill = resolveBoxStyles(box({ size: { width: { mode: "fill" } } }), {
      parentLayout: "root",
    });
    expect(fill.width).toBe("100%");

    const relative = resolveBoxStyles(box({ size: { width: { mode: "relative", value: 50 } } }), {
      parentLayout: "root",
    });
    expect(relative.width).toBe("50%");
  });

  it("maps a stack to flex with direction, gap, padding, align and justify", () => {
    const styles = resolveBoxStyles(
      box({
        layout: {
          mode: "stack",
          direction: "horizontal",
          gap: 12,
          padding: { top: 1, right: 2, bottom: 3, left: 4 },
          align: "center",
          justify: "space-between",
          wrap: true,
        },
      }),
      { parentLayout: "root" },
    );

    expect(styles.display).toBe("flex");
    expect(styles.flexDirection).toBe("row");
    expect(styles.gap).toBe("12px");
    expect(styles.padding).toBe("1px 2px 3px 4px");
    expect(styles.alignItems).toBe("center");
    expect(styles.justifyContent).toBe("space-between");
    expect(styles.flexWrap).toBe("wrap");
  });

  it("maps a grid to columns and gaps", () => {
    const styles = resolveBoxStyles(
      box({
        layout: {
          ...defaultLayout(),
          mode: "grid",
          grid: { columns: 3, rows: 2, columnGap: 8, rowGap: 16 },
        },
      }),
      { parentLayout: "root" },
    );

    expect(styles.display).toBe("grid");
    expect(styles.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    expect(styles.columnGap).toBe("8px");
    expect(styles.rowGap).toBe("16px");
  });

  it("grows a fill child along the stack's main axis and stretches it on the cross axis", () => {
    const grown = resolveBoxStyles(
      box({ size: { width: { mode: "fill" }, height: { mode: "fill" } } }),
      { parentLayout: "stack", parentDirection: "horizontal" },
    );
    expect(grown.flexGrow).toBe(1);
    expect(grown.flexBasis).toBe(0);
    expect(grown.alignSelf).toBe("stretch");

    const vertical = resolveBoxStyles(box({ size: { height: { mode: "fill" } } }), {
      parentLayout: "stack",
      parentDirection: "vertical",
    });
    expect(vertical.flexGrow).toBe(1);
    expect(vertical.flexBasis).toBe(0);
  });

  it("positions children absolutely only inside a layout:none parent", () => {
    const absolute = resolveBoxStyles(box({ position: { x: 24, y: 48, zIndex: 3 } }), {
      parentLayout: "none",
    });
    expect(absolute.position).toBe("absolute");
    expect(absolute.left).toBe("24px");
    expect(absolute.top).toBe("48px");
    expect(absolute.zIndex).toBe(3);

    const inStack = resolveBoxStyles(box({ position: { x: 24, y: 48 } }), {
      parentLayout: "stack",
    });
    expect(inStack.position).toBe("relative");
    expect(inStack.left).toBeUndefined();
  });

  it("maps fill, border, radius, shadow, opacity and rotation", () => {
    const styles = resolveBoxStyles(
      box({
        style: {
          fill: { type: "solid", color: "#ff0000", opacity: 0.5 },
          border: { width: 2, color: "#111111", style: "dashed" },
          radius: { topLeft: 4, topRight: 8, bottomRight: 12, bottomLeft: 16 },
          shadows: [{ x: 0, y: 4, blur: 8, spread: 0, color: "#00000033", inset: false }],
          opacity: 0.75,
          overflow: "hidden",
          blendMode: "multiply",
          rotate: 15,
        },
      }),
      { parentLayout: "root" },
    );

    expect(styles.backgroundColor).toBe("rgba(255, 0, 0, 0.5)");
    expect(styles.border).toBe("2px dashed #111111");
    expect(styles.borderTopLeftRadius).toBe("4px");
    expect(styles.borderTopRightRadius).toBe("8px");
    expect(styles.borderBottomRightRadius).toBe("12px");
    expect(styles.borderBottomLeftRadius).toBe("16px");
    expect(styles.boxShadow).toBe("0px 4px 8px 0px #00000033");
    expect(styles.opacity).toBe(0.75);
    expect(styles.overflow).toBe("hidden");
    expect(styles.mixBlendMode).toBe("multiply");
    expect(styles.transform).toBe("rotate(15deg)");
  });

  it("builds gradient and image backgrounds", () => {
    const gradient = resolveBoxStyles(
      box({
        style: {
          fill: {
            type: "linear-gradient",
            angle: 90,
            stops: [
              { color: "#000000", position: 0 },
              { color: "#ffffff", position: 100 },
            ],
          },
        },
      }),
      { parentLayout: "root" },
    );
    expect(gradient.backgroundImage).toBe("linear-gradient(90deg, #000000 0%, #ffffff 100%)");

    const image = resolveBoxStyles(
      box({
        style: {
          fill: {
            type: "image",
            assetId: LOGO.id,
            src: "https://fallback.example/x.png",
            fit: "crop",
            positionX: 10,
            positionY: 90,
          },
        },
      }),
      { parentLayout: "root" },
      (assetId) => (assetId === LOGO.id ? "https://cdn.example/logo.png" : null),
    );
    expect(image.backgroundImage).toBe('url("https://cdn.example/logo.png")');
    expect(image.backgroundSize).toBe("cover");
    expect(image.backgroundPosition).toBe("10% 90%");
  });
});

describe("resolveTextStyles", () => {
  it("maps typography, including auto line height", () => {
    const styles = resolveTextStyles(
      textContent({
        fontFamily: "DM Sans",
        fontSize: 20,
        fontWeight: 600,
        lineHeight: "auto",
        letterSpacing: 1.5,
        color: "#112233",
        align: "center",
        textTransform: "uppercase",
        textDecoration: "underline",
        italic: true,
        whiteSpace: "pre-wrap",
      }),
    );

    expect(styles.fontFamily).toBe('"DM Sans"');
    expect(styles.fontSize).toBe("20px");
    expect(styles.fontWeight).toBe(600);
    expect(styles.lineHeight).toBe("normal");
    expect(styles.letterSpacing).toBe("1.5px");
    expect(styles.color).toBe("#112233");
    expect(styles.textAlign).toBe("center");
    expect(styles.textTransform).toBe("uppercase");
    expect(styles.textDecoration).toBe("underline");
    expect(styles.fontStyle).toBe("italic");
    expect(styles.whiteSpace).toBe("pre-wrap");
  });

  it("maps truncation to ellipsis and nowrap", () => {
    const styles = resolveTextStyles(textContent({ truncate: true }));
    expect(styles.overflow).toBe("hidden");
    expect(styles.textOverflow).toBe("ellipsis");
    expect(styles.whiteSpace).toBe("nowrap");
  });
});

describe("resolveImageStyles", () => {
  it("fills its box and maps Framer fit and position", () => {
    const styles = resolveImageStyles(imageContent({ fit: "crop", positionX: 25, positionY: 75 }));
    expect(styles.width).toBe("100%");
    expect(styles.height).toBe("100%");
    expect(styles.objectFit).toBe("cover");
    expect(styles.objectPosition).toBe("25% 75%");

    expect(resolveImageStyles(imageContent({ fit: "fit" })).objectFit).toBe("contain");
    expect(resolveImageStyles(imageContent({ fit: "fill" })).objectFit).toBe("fill");
  });
});

describe("component instances", () => {
  function cardComponent(): ComponentDefinition {
    const label = createText({ id: "node_label", content: "Default label" });
    const root = createFrame({
      id: "node_component_root",
      name: "Card",
      props: {
        layout: { ...defaultLayout(), mode: "stack", direction: "vertical" },
        size: { width: { mode: "fixed", value: 200 }, height: { mode: "hug" } },
      },
      children: [label],
    });
    const component = createComponentDefinition({ id: "component_card", name: "Card", root });
    component.properties = [
      {
        id: "prop_label",
        name: "Label",
        type: "text",
        defaultValue: "Default label",
        control: "text",
      },
    ];
    component.bindings = [{ propertyId: "prop_label", nodeId: "node_label", path: "text.content" }];
    return component;
  }

  it("renders the selected variant and applies a property binding", () => {
    const { project, page } = projectWith();
    project.components = [cardComponent()];
    page.root.children.push(
      createComponentInstance({
        id: "node_instance",
        name: "Card instance",
        componentId: "component_card",
        propertyValues: { prop_label: "Bound label" },
      }),
    );

    const html = renderPageToHtml(project, page, EDITOR);

    expect(html).toContain("Bound label");
    expect(html).not.toContain(">Default label<");
    expect(html).toContain(`class="${nodeClassName("node_instance")}"`);
    expect(html).toContain('data-node-type="componentInstance"');
    expect(html).toContain('data-node-name="Card instance"');
    expect(html).toContain(`class="${nodeClassName("node_label")}"`);
  });

  it("renders a dashed placeholder in editor mode when the component is missing", () => {
    const { project, page } = projectWith([
      createComponentInstance({
        id: "node_missing",
        name: "Missing card",
        componentId: "component_missing",
      }),
    ]);

    const editorHtml = renderPageToHtml(project, page, EDITOR);
    expect(editorHtml).toContain("Missing card");
    expect(editorHtml).toContain("border:1px dashed #9ca3af");

    const publishHtml = renderPageToHtml(project, page, PUBLISH);
    expect(publishHtml).not.toContain("Missing card");
    expect(publishHtml).not.toContain(nodeClassName("node_missing"));
  });

  it("emits the instance class in the publish stylesheet", () => {
    const { project, page } = projectWith();
    project.components = [cardComponent()];
    page.root.children.push(
      createComponentInstance({
        id: "node_instance",
        componentId: "component_card",
        propertyValues: { prop_label: "Bound label" },
      }),
    );

    const css = buildPageCss(project, page, PUBLISH);
    expect(css).toContain(`.${nodeClassName("node_instance")} {`);
    expect(css).toContain(`.${nodeClassName("node_label")}-text {`);
  });
});

describe("disjoint breakpoint CSS", () => {
  it("scopes each breakpoint so narrower overrides can remove wider declarations", () => {
    const project = createProject({ name: "Disjoint", now: "2026-01-01T00:00:00.000Z" });
    const page = project.pages[0]!;
    const frame = createFrame({
      id: "node_gradient",
      props: {
        style: {
          fill: {
            type: "linear-gradient",
            angle: 90,
            stops: [
              { color: "#ff0000", position: 0 },
              { color: "#0000ff", position: 100 },
            ],
          },
        },
      },
    });
    frame.responsive.overrides.bp_phone = {
      style: { fill: { type: "solid", color: "#00ff00", opacity: 1 } },
    };
    page.root.children.push(frame);

    const css = buildPageCss(project, page, {
      breakpointId: "bp_desktop",
      mode: "publish",
    });
    expect(css).toContain("@media (min-width: 1200px)");
    expect(css).toContain("@media (max-width: 1199px) and (min-width: 810px)");
    expect(css).toContain("@media (max-width: 809px)");

    const phoneStart = css.indexOf("@media (max-width: 809px)");
    const phoneBlock = css.slice(phoneStart);
    const ruleStart = phoneBlock.indexOf(`.${nodeClassName("node_gradient")} {`);
    expect(ruleStart).toBeGreaterThan(-1);
    const ruleBody = phoneBlock.slice(ruleStart, phoneBlock.indexOf("}", ruleStart));
    expect(ruleBody).toContain("background-color: #00ff00");
    expect(ruleBody).not.toContain("background-image");
  });
});
