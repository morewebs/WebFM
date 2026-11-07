import type { Page, Project, SceneNode } from "@webfm/model";
import {
  createComponentDefinition,
  createFrame,
  createPage,
  createProject,
  createText,
} from "@webfm/model";
import { describe, expect, it } from "vitest";
import {
  collectProjectFonts,
  FONT_OPTIONS,
  googleFontHref,
  isGoogleFont,
  projectFontHrefs,
} from "./fonts";

const NOW = "2026-01-01T00:00:00.000Z";

function text(id: string, family: string, content = id): SceneNode {
  return createText({ id, name: id, content, props: { text: { fontFamily: family } } });
}

function pageWith(id: string, children: SceneNode[], path = "/"): Page {
  return createPage({
    id: `page_${id}`,
    name: id,
    path,
    root: createFrame({ id: `root_${id}`, name: "Desktop", children }),
  });
}

function projectWith(pages: Page[]): Project {
  const project = createProject({ name: "Fonts", now: NOW });
  project.pages = pages;
  return project;
}

describe("font catalog", () => {
  it("has a unique family for every entry", () => {
    const families = FONT_OPTIONS.map((option) => option.family.toLowerCase());
    expect(new Set(families).size).toBe(FONT_OPTIONS.length);
  });

  it("covers the required Google and system families", () => {
    const families = new Set(FONT_OPTIONS.map((option) => option.family));
    for (const family of [
      "Inter",
      "Roboto",
      "Open Sans",
      "Lato",
      "Montserrat",
      "Poppins",
      "Source Sans 3",
      "Nunito",
      "Raleway",
      "Work Sans",
      "DM Sans",
      "Manrope",
      "Space Grotesk",
      "IBM Plex Sans",
      "Plus Jakarta Sans",
      "Figtree",
      "Outfit",
      "Sora",
      "Urbanist",
      "Karla",
      "Rubik",
      "Quicksand",
      "Barlow",
      "Oswald",
      "Playfair Display",
      "Merriweather",
      "Lora",
      "Libre Baskerville",
      "Crimson Text",
      "DM Serif Display",
      "Caveat",
      "Pacifico",
      "JetBrains Mono",
      "IBM Plex Mono",
      "Space Mono",
      "Fira Code",
      "Arial",
      "Georgia",
      "Times New Roman",
      "Courier New",
    ]) {
      expect(families.has(family)).toBe(true);
    }
  });

  it("marks the system families as not Google", () => {
    for (const family of ["Arial", "Georgia", "Times New Roman", "Courier New"]) {
      const option = FONT_OPTIONS.find((entry) => entry.family === family);
      expect(option?.category).toBe("system");
      expect(option?.google).toBe(false);
    }
  });
});

describe("googleFontHref", () => {
  it("builds the Google Fonts CSS URL", () => {
    expect(googleFontHref("Inter")).toBe(
      "https://fonts.googleapis.com/css2?family=Inter&display=swap",
    );
  });

  it("encodes spaces as plus signs", () => {
    expect(googleFontHref("Source Sans 3")).toBe(
      "https://fonts.googleapis.com/css2?family=Source+Sans+3&display=swap",
    );
    expect(googleFontHref("  Times New Roman ")).toBe(
      "https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap",
    );
  });
});

describe("isGoogleFont", () => {
  it("recognises catalog Google families", () => {
    expect(isGoogleFont("Inter")).toBe(true);
    expect(isGoogleFont("montserrat")).toBe(true);
    expect(isGoogleFont("Source Sans 3")).toBe(true);
  });

  it("rejects system and unknown families", () => {
    expect(isGoogleFont("Arial")).toBe(false);
    expect(isGoogleFont("Comic Sans MS")).toBe(false);
    expect(isGoogleFont("")).toBe(false);
  });
});

describe("collectProjectFonts", () => {
  it("collects unique Google families from pages and component variants", () => {
    const nested = createFrame({
      id: "node_nested",
      name: "Nested",
      children: [text("node_lora", "Lora")],
    });
    const project = projectWith([
      pageWith("home", [
        text("node_montserrat", "Montserrat"),
        text("node_montserrat_repeat", "Montserrat"),
        text("node_arial", "Arial"),
        nested,
      ]),
      pageWith("about", [text("node_caveat", "Caveat")], "/about"),
    ]);
    project.components = [
      createComponentDefinition({
        name: "Card",
        root: createFrame({
          id: "component_root",
          name: "Card",
          children: [text("node_card", "Lora")],
        }),
      }),
    ];

    expect(collectProjectFonts(project)).toEqual(["Montserrat", "Lora", "Caveat"]);
  });

  it("scans every variant of a component", () => {
    const definition = createComponentDefinition({
      name: "Button",
      root: createFrame({
        id: "variant_one",
        name: "Default",
        children: [text("node_one", "Inter")],
      }),
    });
    definition.variants.push({
      id: "variant_two",
      name: "Hover",
      root: createFrame({
        id: "variant_two_root",
        name: "Hover",
        children: [text("node_two", "Space Mono")],
      }),
    });
    const project = projectWith([]);
    project.components = [definition];

    expect(collectProjectFonts(project)).toEqual(["Inter", "Space Mono"]);
  });

  it("returns an empty list for an empty project or system-only text", () => {
    expect(collectProjectFonts(projectWith([]))).toEqual([]);
    expect(
      collectProjectFonts(projectWith([pageWith("home", [text("node_georgia", "Georgia")])])),
    ).toEqual([]);
  });
});

describe("projectFontHrefs", () => {
  it("returns unique stylesheet URLs for the project's Google fonts", () => {
    const project = projectWith([
      pageWith("home", [
        text("node_montserrat", "Montserrat"),
        text("node_montserrat_repeat", "Montserrat"),
        text("node_source", "Source Sans 3"),
        text("node_arial", "Arial"),
      ]),
    ]);

    expect(projectFontHrefs(project)).toEqual([
      "https://fonts.googleapis.com/css2?family=Montserrat&display=swap",
      "https://fonts.googleapis.com/css2?family=Source+Sans+3&display=swap",
    ]);
  });

  it("returns no links when only system fonts are used", () => {
    const project = projectWith([pageWith("home", [text("node_courier", "Courier New")])]);
    expect(projectFontHrefs(project)).toEqual([]);
  });
});
