import type { BoxProps, DeepPartial, Project } from "@webfm/model";
import { createFrame, createProject, defaultBoxProps } from "@webfm/model";
import { describe, expect, it } from "vitest";
import { buildPageCss, nodeClassName, resolveBoxStyles } from "./index";
import type { RenderOptions, StyleContext } from "./types";

function box(overrides: DeepPartial<BoxProps> = {}): BoxProps {
  return defaultBoxProps(overrides);
}

const ABSOLUTE_PARENT: StyleContext = { parentLayout: "none", renderMode: "editor" };
const STACK_PARENT: StyleContext = { parentLayout: "stack", renderMode: "editor" };

describe("positioning modes", () => {
  it("keeps absolute positioning in free and stack parents", () => {
    const free = resolveBoxStyles(
      box({ position: { x: 16, y: 32, mode: "absolute" } }),
      ABSOLUTE_PARENT,
    );
    expect(free.position).toBe("absolute");
    expect(free.left).toBe("16px");
    expect(free.top).toBe("32px");

    const stack = resolveBoxStyles(
      box({ position: { x: 4, y: 8, mode: "absolute" } }),
      STACK_PARENT,
    );
    expect(stack.position).toBe("absolute");
    expect(stack.left).toBe("4px");
    expect(stack.top).toBe("8px");
  });

  it("defaults to absolute in a free parent and relative in a stack", () => {
    const free = resolveBoxStyles(box({ position: { x: 10, y: 20 } }), ABSOLUTE_PARENT);
    expect(free.position).toBe("absolute");
    expect(free.left).toBe("10px");

    const stack = resolveBoxStyles(box({ position: { x: 10, y: 20 } }), STACK_PARENT);
    expect(stack.position).toBe("relative");
    expect(stack.left).toBeUndefined();
    expect(stack.top).toBeUndefined();
  });

  it("offsets an explicit relative child by x/y", () => {
    const relative = resolveBoxStyles(
      box({ position: { x: 12, y: 6, mode: "relative" } }),
      STACK_PARENT,
    );
    expect(relative.position).toBe("relative");
    expect(relative.left).toBe("12px");
    expect(relative.top).toBe("6px");
  });

  it("renders fixed as absolute in the editor and fixed when publishing", () => {
    const props = box({ position: { x: 24, y: 48, mode: "fixed" } });

    const editor = resolveBoxStyles(props, { ...ABSOLUTE_PARENT, renderMode: "editor" });
    expect(editor.position).toBe("absolute");
    expect(editor.left).toBe("24px");
    expect(editor.top).toBe("48px");

    const publish = resolveBoxStyles(props, { ...ABSOLUTE_PARENT, renderMode: "publish" });
    expect(publish.position).toBe("fixed");
    expect(publish.left).toBe("24px");
    expect(publish.top).toBe("48px");
  });

  it("maps sticky to top and left offsets", () => {
    const sticky = resolveBoxStyles(
      box({ position: { x: 0, y: 32, mode: "sticky" } }),
      STACK_PARENT,
    );
    expect(sticky.position).toBe("sticky");
    expect(sticky.top).toBe("32px");
    expect(sticky.left).toBe("0px");
  });

  it("always keeps a page or variant root relative and ignores its mode", () => {
    for (const mode of ["absolute", "fixed", "sticky", "relative"] as const) {
      const root = resolveBoxStyles(box({ position: { x: 40, y: 80, mode } }), {
        parentLayout: "root",
        renderMode: "publish",
      });
      expect(root.position).toBe("relative");
      expect(root.left).toBeUndefined();
      expect(root.top).toBeUndefined();
    }
  });

  it("uses fixed positioning in published CSS", () => {
    const project: Project = createProject({
      name: "Layout modes",
      now: "2026-01-01T00:00:00.000Z",
    });
    const page = project.pages[0]!;
    page.root = createFrame({
      id: "node_root",
      name: "Desktop",
      children: [
        createFrame({
          id: "node_pinned",
          name: "Pinned",
          props: { position: { x: 8, y: 12, mode: "fixed" } },
        }),
      ],
    });
    const options: RenderOptions = { breakpointId: "bp_desktop", mode: "publish" };

    const css = buildPageCss(project, page, options);
    const ruleStart = css.indexOf(`.${nodeClassName("node_pinned")} {`);
    expect(ruleStart).toBeGreaterThan(-1);
    const ruleBody = css.slice(ruleStart, css.indexOf("}", ruleStart));
    expect(ruleBody).toContain("position: fixed");
    expect(ruleBody).toContain("left: 8px");
    expect(ruleBody).toContain("top: 12px");
  });
});

describe("overflow", () => {
  it("uses the single overflow when no axis override exists", () => {
    expect(resolveBoxStyles(box({ style: { overflow: "hidden" } }), ABSOLUTE_PARENT).overflow).toBe(
      "hidden",
    );
    expect(resolveBoxStyles(box({ style: { overflow: "clip" } }), ABSOLUTE_PARENT).overflow).toBe(
      "clip",
    );
    expect(
      resolveBoxStyles(box({ style: { overflow: "visible" } }), ABSOLUTE_PARENT).overflow,
    ).toBeUndefined();
  });

  it("emits overflowX and inherits the single value for the other axis", () => {
    const styles = resolveBoxStyles(
      box({ style: { overflow: "clip", overflowX: "hidden" } }),
      ABSOLUTE_PARENT,
    );
    expect(styles.overflow).toBeUndefined();
    expect(styles.overflowX).toBe("hidden");
    expect(styles.overflowY).toBe("clip");
  });

  it("emits overflowY with the other axis inheriting", () => {
    const styles = resolveBoxStyles(
      box({ style: { overflow: "visible", overflowY: "scroll" } }),
      ABSOLUTE_PARENT,
    );
    expect(styles.overflowX).toBe("visible");
    expect(styles.overflowY).toBe("scroll");
  });

  it("maps scroll and auto per axis", () => {
    const styles = resolveBoxStyles(
      box({ style: { overflowX: "scroll", overflowY: "auto" } }),
      ABSOLUTE_PARENT,
    );
    expect(styles.overflowX).toBe("scroll");
    expect(styles.overflowY).toBe("auto");
    expect(styles.overflow).toBeUndefined();
  });

  it("treats a null axis as absent", () => {
    const styles = resolveBoxStyles(
      box({ style: { overflow: "hidden", overflowX: null, overflowY: null } }),
      ABSOLUTE_PARENT,
    );
    expect(styles.overflow).toBe("hidden");
    expect(styles.overflowX).toBeUndefined();
    expect(styles.overflowY).toBeUndefined();
  });
});

describe("viewport sizing", () => {
  it("maps viewport sizing to vw/vh per axis", () => {
    const styles = resolveBoxStyles(
      box({
        size: {
          width: { mode: "viewport", value: 50 },
          height: { mode: "viewport" },
        },
      }),
      ABSOLUTE_PARENT,
    );
    expect(styles.width).toBe("50vw");
    expect(styles.height).toBe("100vh");
  });

  it("still emits min/max sizes and aspect ratio", () => {
    const styles = resolveBoxStyles(
      box({
        size: {
          width: { mode: "viewport", value: 100 },
          height: { mode: "fill" },
          minWidth: 320,
          maxWidth: 1440,
          minHeight: 200,
          maxHeight: 900,
          aspectRatio: 1.5,
        },
      }),
      ABSOLUTE_PARENT,
    );
    expect(styles.width).toBe("100vw");
    expect(styles.height).toBe("100%");
    expect(styles.minWidth).toBe("320px");
    expect(styles.maxWidth).toBe("1440px");
    expect(styles.minHeight).toBe("200px");
    expect(styles.maxHeight).toBe("900px");
    expect(styles.aspectRatio).toBe("1.5");
  });

  it("omits min/max sizes that were cleared with null", () => {
    const styles = resolveBoxStyles(
      box({
        size: {
          width: { mode: "fixed", value: 100 },
          height: { mode: "fixed", value: 100 },
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
        },
      }),
      ABSOLUTE_PARENT,
    );
    expect(styles.minWidth).toBeUndefined();
    expect(styles.maxWidth).toBeUndefined();
    expect(styles.minHeight).toBeUndefined();
    expect(styles.maxHeight).toBeUndefined();
  });
});
