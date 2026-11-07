import type { Interaction, Page, Project, SceneNode } from "@webfm/model";
import {
  createComponentDefinition,
  createComponentInstance,
  createFrame,
  createImage,
  createProject,
  createText,
  defaultLayout,
} from "@webfm/model";
import { describe, expect, it } from "vitest";
import { renderPageToHtml } from "./html";
import { buildPageCss, nodeClassName } from "./index";
import type { RenderOptions } from "./types";

const PUBLISH: RenderOptions = { breakpointId: "bp_desktop", mode: "publish" };

function projectWith(children: SceneNode[] = []): { project: Project; page: Page } {
  const project = createProject({ name: "Interactions test", now: "2026-01-01T00:00:00.000Z" });
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

function effect(overrides: Partial<Interaction> = {}): Interaction {
  return {
    id: "i_effect",
    trigger: "appear",
    effect: "fade",
    direction: "up",
    duration: 300,
    delay: 0,
    easing: "ease",
    ...overrides,
  };
}

function cssFor(children: SceneNode[]): string {
  const { project, page } = projectWith(children);
  return buildPageCss(project, page, PUBLISH);
}

describe("interaction appear effects", () => {
  it("emits keyframes once and the animation on the node rule", () => {
    const card = createFrame({ id: "node_card" });
    card.interactions = [effect()];
    const css = cssFor([card]);

    expect(css).toContain("@keyframes wfm-i_effect-appear");
    expect(css).toContain("from { opacity: 0; }");
    expect(css).toContain("to { opacity: 1; }");
    expect(css).toContain(`.${nodeClassName("node_card")} {`);
    expect(css).toContain("animation: wfm-i_effect-appear 300ms ease 0ms both;");
  });

  it("slides in 16px from the opposite direction and settles at none", () => {
    const cases = [
      ["up", "translate3d(0, 16px, 0)"],
      ["down", "translate3d(0, -16px, 0)"],
      ["left", "translate3d(16px, 0, 0)"],
      ["right", "translate3d(-16px, 0, 0)"],
    ] as const;

    for (const [direction, transform] of cases) {
      const card = createFrame({ id: "node_card" });
      card.interactions = [effect({ effect: "slide", direction })];
      const css = cssFor([card]);

      expect(css).toContain(`from { opacity: 0; transform: ${transform}; }`);
      expect(css).toContain("to { opacity: 1; transform: none; }");
    }
  });

  it("scales in from 0.95", () => {
    const card = createFrame({ id: "node_card" });
    card.interactions = [effect({ effect: "scale" })];
    const css = cssFor([card]);

    expect(css).toContain("from { opacity: 0; transform: scale(0.95); }");
    expect(css).toContain("to { opacity: 1; transform: none; }");
  });

  it("preserves a base transform and base opacity in the final state", () => {
    const card = createFrame({
      id: "node_card",
      props: { style: { rotate: 15, opacity: 0.5 } },
    });
    card.interactions = [effect({ effect: "slide", direction: "left" })];
    const css = cssFor([card]);

    expect(css).toContain("from { opacity: 0; transform: translate3d(16px, 0, 0) rotate(15deg); }");
    expect(css).toContain("to { opacity: 0.5; transform: rotate(15deg); }");
  });
});

describe("interaction hover and tap effects", () => {
  it("adds a hover transition and a scale hover rule", () => {
    const card = createFrame({ id: "node_card" });
    card.interactions = [
      effect({
        id: "i_hover",
        trigger: "hover",
        effect: "scale",
        duration: 400,
        delay: 10,
        easing: "ease-in",
      }),
    ];
    const css = cssFor([card]);

    expect(css).toContain("transition: opacity 400ms ease-in 10ms, transform 400ms ease-in 10ms;");
    expect(css).toContain(`.${nodeClassName("node_card")}:hover { transform: scale(1.03); }`);
    expect(css).not.toContain(":active");
  });

  it("uses the hover timing for the transition and adds an active rule", () => {
    const card = createFrame({ id: "node_card" });
    card.interactions = [
      effect({ id: "i_hover", trigger: "hover", effect: "slide", direction: "right" }),
      effect({
        id: "i_tap",
        trigger: "tap",
        effect: "fade",
        duration: 80,
        easing: "linear",
      }),
    ];
    const css = cssFor([card]);

    expect(css).toContain("transition: opacity 300ms ease 0ms, transform 300ms ease 0ms;");
    expect(css).toContain(
      `.${nodeClassName("node_card")}:hover { transform: translate3d(-4px, 0, 0); }`,
    );
    expect(css).toContain(`.${nodeClassName("node_card")}:active { opacity: 0.5; }`);
  });

  it("falls back to tap timing when there is no hover, with 2px slide and 0.97 scale", () => {
    const tapped = createFrame({ id: "node_tapped" });
    tapped.interactions = [
      effect({ id: "i_tap", trigger: "tap", effect: "slide", direction: "up", easing: "ease-out" }),
    ];
    const slidingCss = cssFor([tapped]);
    expect(slidingCss).toContain(
      "transition: opacity 300ms ease-out 0ms, transform 300ms ease-out 0ms;",
    );
    expect(slidingCss).toContain(
      `.${nodeClassName("node_tapped")}:active { transform: translate3d(0, 2px, 0); }`,
    );

    const scaled = createFrame({ id: "node_scaled" });
    scaled.interactions = [effect({ trigger: "tap", effect: "scale" })];
    const scaledCss = cssFor([scaled]);
    expect(scaledCss).toContain(
      `.${nodeClassName("node_scaled")}:active { transform: scale(0.97); }`,
    );
  });

  it("darkens a hover fade relative to a base opacity below 1", () => {
    const card = createFrame({ id: "node_card", props: { style: { opacity: 0.5 } } });
    card.interactions = [effect({ trigger: "hover", effect: "fade" })];
    expect(cssFor([card])).toContain(`.${nodeClassName("node_card")}:hover { opacity: 0.3; }`);

    const plain = createFrame({ id: "node_plain" });
    plain.interactions = [effect({ trigger: "hover", effect: "fade" })];
    expect(cssFor([plain])).toContain(`.${nodeClassName("node_plain")}:hover { opacity: 0.6; }`);
  });
});

describe("interaction CSS scope", () => {
  it("emits breakpoint-scoped keyframes and disjoint media blocks", () => {
    const card = createFrame({ id: "node_card" });
    card.interactions = [effect()];
    const css = cssFor([card]);

    // The end state is baked from each breakpoint's resolved styles.
    expect((css.match(/@keyframes/g) ?? []).length).toBe(3);
    expect(css).toContain("@keyframes wfm-i_effect-appear {");
    expect(css).toContain("@keyframes wfm-i_effect-appear-bp_tablet {");
    expect(css).toContain("@keyframes wfm-i_effect-appear-bp_phone {");
    expect((css.match(/animation: wfm-i_effect-appear/g) ?? []).length).toBe(3);
    expect(css).toContain("@media (min-width: 1200px)");
    expect(css.indexOf("@keyframes")).toBeLessThan(css.indexOf("@media (min-width: 1200px)"));
  });

  it("applies interactions to text and image entries", () => {
    const headline = createText({ id: "node_title", content: "Title" });
    headline.interactions = [effect({ id: "i_text" })];
    const photo = createImage({ id: "node_photo" });
    photo.interactions = [effect({ id: "i_image", trigger: "hover", effect: "scale" })];

    const css = cssFor([headline, photo]);

    expect(css).toContain("animation: wfm-i_text-appear 300ms ease 0ms both;");
    expect(css).toContain(`.${nodeClassName("node_photo")}:hover { transform: scale(1.03); }`);
  });

  it("emits an instance wrapper rule and variant child rules", () => {
    const label = createText({ id: "node_label", content: "Label" });
    label.interactions = [effect({ id: "i_child", trigger: "hover", effect: "fade" })];
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

    const instance = createComponentInstance({
      id: "node_instance",
      componentId: "component_card",
    });
    instance.interactions = [effect({ id: "i_instance", effect: "scale" })];

    const { project, page } = projectWith([instance]);
    project.components = [component];
    const css = buildPageCss(project, page, PUBLISH);

    expect(css).toContain(`.${nodeClassName("node_instance")} {`);
    expect(css).toContain("animation: wfm-i_instance-appear 300ms ease 0ms both;");
    expect(css).toContain("@keyframes wfm-i_instance-appear");
    expect(css).toContain(`.${nodeClassName("node_label")}:hover { opacity: 0.6; }`);
  });

  it("emits no interaction CSS when a node has none", () => {
    const card = createFrame({ id: "node_card" });
    const css = cssFor([card]);

    expect(css).not.toContain("@keyframes");
    expect(css).not.toContain("animation:");
    expect(css).not.toContain(":hover");
    expect(css).not.toContain(":active");
    expect(css).not.toContain("transition:");
  });
});

describe("interaction scroll effects", () => {
  function scrollEffect(overrides: Partial<Interaction> = {}): Interaction {
    return effect({ id: "i_scroll", trigger: "scroll", effect: "fade", ...overrides });
  }

  it("hides only under .wfm-js and reveals with a scroll animation", () => {
    const card = createFrame({ id: "node_card" });
    card.interactions = [scrollEffect()];
    const css = cssFor([card]);

    expect(css).toContain('.wfm-js [data-wfm-scroll="i_scroll"]:not(.wfm-revealed) { opacity: 0; }');
    expect(css).toContain(
      '.wfm-js [data-wfm-scroll="i_scroll"].wfm-revealed { animation: wfm-i_scroll-scroll 300ms ease 0ms backwards; }',
    );
    expect(css).toContain("@keyframes wfm-i_scroll-scroll {");
    expect(css).toContain("from { opacity: 0; }");
    expect(css).toContain("to { opacity: 1; transform: none; }");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(
      '.wfm-js [data-wfm-scroll="i_scroll"].wfm-revealed { animation: none; }',
    );
    expect(css).toContain("@media print");
    expect(css).toContain(
      '.wfm-js [data-wfm-scroll="i_scroll"] { animation: none; opacity: 1; transform: none; }',
    );

    // The node's own rule never hides the layer, so a no-JS visitor sees it.
    expect(css).not.toContain(`.${nodeClassName("node_card")} { opacity: 0;`);
  });

  it("emits per-breakpoint scroll keyframes and reveal rules", () => {
    const card = createFrame({ id: "node_card" });
    card.interactions = [scrollEffect({ effect: "slide", direction: "up" })];
    const css = cssFor([card]);

    expect((css.match(/@keyframes wfm-i_scroll-scroll/g) ?? []).length).toBe(3);
    expect(css).toContain("@keyframes wfm-i_scroll-scroll-bp_tablet {");
    expect(css).toContain("@keyframes wfm-i_scroll-scroll-bp_phone {");
    expect(css).toContain(
      'animation: wfm-i_scroll-scroll-bp_tablet 300ms ease 0ms backwards;',
    );
    expect(css).toContain(
      'animation: wfm-i_scroll-scroll-bp_phone 300ms ease 0ms backwards;',
    );
  });

  it("uses the effect offset for the hidden start state", () => {
    const slide = createFrame({ id: "node_slide" });
    slide.interactions = [scrollEffect({ effect: "slide", direction: "left" })];
    const slideCss = cssFor([slide]);
    expect(slideCss).toContain(
      '.wfm-js [data-wfm-scroll="i_scroll"]:not(.wfm-revealed) { opacity: 0; transform: translate3d(16px, 0, 0); }',
    );
    expect(slideCss).toContain("to { opacity: 1; transform: none; }");

    const scale = createFrame({ id: "node_scale" });
    scale.interactions = [scrollEffect({ effect: "scale" })];
    expect(cssFor([scale])).toContain(
      '.wfm-js [data-wfm-scroll="i_scroll"]:not(.wfm-revealed) { opacity: 0; transform: scale(0.95); }',
    );
  });

  it("keeps the resolved base opacity and transform in the final state", () => {
    const card = createFrame({
      id: "node_card",
      props: { style: { rotate: 15, opacity: 0.5 } },
    });
    card.interactions = [scrollEffect({ effect: "slide", direction: "up" })];
    const css = cssFor([card]);

    expect(css).toContain(
      "from { opacity: 0; transform: translate3d(0, 16px, 0) rotate(15deg); }",
    );
    expect(css).toContain("to { opacity: 0.5; transform: rotate(15deg); }");
  });

  it("marks the first scroll layer in editor and publish markup", () => {
    const card = createFrame({ id: "node_card", name: "Card" });
    card.interactions = [
      scrollEffect({ id: "i_first" }),
      scrollEffect({ id: "i_second", effect: "scale" }),
    ];
    const { project, page } = projectWith([card]);
    const editorHtml = renderPageToHtml(project, page, {
      breakpointId: "bp_desktop",
      mode: "editor",
    });
    const publishHtml = renderPageToHtml(project, page, {
      breakpointId: "bp_desktop",
      mode: "publish",
    });

    for (const html of [editorHtml, publishHtml]) {
      expect(html).toContain('data-wfm-scroll="i_first"');
      expect(html).not.toContain('data-wfm-scroll="i_second"');
      expect(html).not.toContain("wfm-js");
    }
    expect(editorHtml).toContain('data-node-id="node_card"');
    expect(publishHtml).not.toContain("data-node-id");

    const css = buildPageCss(project, page, PUBLISH);
    expect(css).toContain("wfm-i_first-scroll");
    expect(css).not.toContain("wfm-i_second-scroll");
  });

  it("lets scroll supersede appear on the same node", () => {
    const card = createFrame({ id: "node_card" });
    card.interactions = [
      effect({ id: "i_appear", trigger: "appear" }),
      scrollEffect({ id: "i_scroll" }),
    ];
    const css = cssFor([card]);

    expect(css).not.toContain("animation: wfm-i_appear-appear");
    expect(css).toContain(".wfm-revealed { animation: wfm-i_scroll-scroll");
  });

  it("keeps hover/tap interactive while scroll reveals", () => {
    const card = createFrame({ id: "node_card" });
    card.interactions = [
      scrollEffect({ effect: "fade" }),
      effect({ id: "i_hover", trigger: "hover", effect: "scale" }),
      effect({ id: "i_tap", trigger: "tap", effect: "scale" }),
    ];
    const css = cssFor([card]);

    expect(css).toContain(`.${nodeClassName("node_card")}:hover { transform: scale(1.03); }`);
    expect(css).toContain(`.${nodeClassName("node_card")}:active { transform: scale(0.97); }`);
    // The reveal animation releases opacity/transform after it finishes.
    expect(css).toContain(
      ".wfm-js [data-wfm-scroll=\"i_scroll\"].wfm-revealed { animation: wfm-i_scroll-scroll 300ms ease 0ms backwards; }",
    );
    expect(css).toContain(
      ".wfm-js [data-wfm-scroll=\"i_scroll\"]:not(.wfm-revealed) { opacity: 0; }",
    );
  });

  it("applies a variant-root scroll effect to the instance wrapper", () => {
    const { project, page } = projectWith([]);
    const root = createFrame({ id: "node_component_root", name: "Card" });
    root.interactions = [scrollEffect({ id: "i_root_scroll" })];
    const component = createComponentDefinition({ name: "Card", root });
    project.components = [component];
    page.root.children.push(
      createComponentInstance({ id: "node_instance", componentId: component.id }),
    );

    const html = renderPageToHtml(project, page, PUBLISH);
    expect(html).toContain('data-wfm-scroll="i_root_scroll"');
    const css = buildPageCss(project, page, PUBLISH);
    expect(css).toContain('data-wfm-scroll="i_root_scroll"');
    expect(css).toContain("wfm-i_root_scroll-scroll");
  });

  it("prefers an instance scroll effect over the variant root effect", () => {
    const { project, page } = projectWith([]);
    const root = createFrame({ id: "node_component_root", name: "Card" });
    root.interactions = [scrollEffect({ id: "i_root_scroll" })];
    const component = createComponentDefinition({ name: "Card", root });
    project.components = [component];
    const instance = createComponentInstance({
      id: "node_instance",
      componentId: component.id,
    });
    instance.interactions = [scrollEffect({ id: "i_instance_scroll" })];
    page.root.children.push(instance);

    const html = renderPageToHtml(project, page, PUBLISH);
    expect(html).toContain('data-wfm-scroll="i_instance_scroll"');
    expect(html).not.toContain('data-wfm-scroll="i_root_scroll"');
    const css = buildPageCss(project, page, PUBLISH);
    expect(css).toContain("wfm-i_instance_scroll-scroll");
    expect(css).not.toContain("wfm-i_root_scroll-scroll");
  });

  it("emits no scroll rules for other triggers", () => {
    const card = createFrame({ id: "node_card" });
    card.interactions = [
      effect({ id: "i_appear", trigger: "appear" }),
      effect({ id: "i_hover", trigger: "hover", effect: "scale" }),
    ];
    const css = cssFor([card]);

    expect(css).not.toContain("-scroll");
    expect(css).not.toContain("data-wfm-scroll");
  });
});
