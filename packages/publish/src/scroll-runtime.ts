import type { Project, SceneNode } from "@webfm/model";
import { walkNode } from "@webfm/model";

/**
 * The published scroll runtime. It is dependency-free and works from a plain
 * file:// page: it adds `.wfm-js` immediately so the stylesheet may hide scroll
 * layers, then reveals each `[data-wfm-scroll]` element once it intersects the
 * viewport. Without IntersectionObserver every layer is revealed at once.
 */
export const SCROLL_RUNTIME_JS = `(function () {
  "use strict";
  window.__wfmScrollReady = true;
  var root = document.documentElement;
  root.classList.add("wfm-js");
  var elements = document.querySelectorAll("[data-wfm-scroll]");
  if (!elements.length) return;

  function reveal(element) {
    element.classList.add("wfm-revealed");
  }

  if (typeof IntersectionObserver !== "function") {
    for (var i = 0; i < elements.length; i += 1) reveal(elements[i]);
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      for (var j = 0; j < entries.length; j += 1) {
        if (!entries[j].isIntersecting) continue;
        reveal(entries[j].target);
        observer.unobserve(entries[j].target);
      }
    },
    { threshold: 0.01, rootMargin: "0px" }
  );

  for (var k = 0; k < elements.length; k += 1) observer.observe(elements[k]);
})();
`;

function nodeHasScrollInteraction(root: SceneNode): boolean {
  let found = false;
  walkNode(root, (node) => {
    if (found) return;
    if (node.interactions?.some((interaction) => interaction.trigger === "scroll")) {
      found = true;
    }
  });
  return found;
}

/** True when any page or component variant carries a scroll effect. */
export function projectHasScrollInteractions(project: Project): boolean {
  for (const page of project.pages) {
    if (nodeHasScrollInteraction(page.root)) return true;
  }
  for (const component of project.components) {
    for (const variant of component.variants) {
      if (nodeHasScrollInteraction(variant.root)) return true;
    }
  }
  return false;
}
