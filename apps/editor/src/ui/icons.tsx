import type { SVGProps } from "react";
import { FRAMER_ICONS, type ExtractedIconName } from "../assets/framer/icons";

/**
 * Editor chrome icons. Extracted Framer glyphs win; hand-drawn fallbacks cover
 * controls the live capture did not include (OVAL, layer/page glyphs, align
 * actions). Swap a fallback for an extracted asset as soon as it is captured.
 */

export type IconName =
  | ExtractedIconName
  | "framer"
  | "plus"
  | "minus"
  | "close"
  | "check"
  | "chevron-right"
  | "home"
  | "page"
  | "frame"
  | "stack"
  | "grid"
  | "oval"
  | "text"
  | "vector"
  | "image"
  | "play"
  | "branch"
  | "cursor"
  | "hand"
  | "comment"
  | "moon"
  | "link"
  | "eye"
  | "eye-off"
  | "lock"
  | "unlock"
  | "align-left"
  | "align-center-h"
  | "align-right"
  | "distribute-h"
  | "align-top"
  | "align-center-v"
  | "align-bottom"
  | "distribute-v"
  | "folder"
  | "component"
  | "trash"
  | "more";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

const FRAMER_ALIASES: Partial<Record<IconName, ExtractedIconName>> = {
  framer: "logo",
  plus: "insert",
  cursor: "select",
};

function extractedKey(name: IconName): ExtractedIconName | null {
  const alias = FRAMER_ALIASES[name];
  if (alias) return alias;
  return name in FRAMER_ICONS ? (name as ExtractedIconName) : null;
}

const strokePaths: Partial<Record<IconName, React.ReactNode>> = {
  "chevron-down": <path d="M3.5 6.25 8 10.75l4.5-4.5" />,
  "chevron-right": <path d="M6.25 3.5 10.75 8l-4.5 4.5" />,
  minus: <path d="M3 8h10" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  check: <path d="m3 8.5 3.25 3.25L13 4.75" />,
  home: <path d="M3 7.5 8 3l5 4.5V13H9.75V9.5h-3.5V13H3z" />,
  page: (
    <>
      <path d="M4 2.75h5l3 3v7.5H4z" />
      <path d="M9 2.75v3h3" />
    </>
  ),
  frame: (
    <>
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
      <path d="M3 6.5h10" />
    </>
  ),
  stack: (
    <>
      <rect x="3" y="3" width="10" height="3.5" rx=".75" />
      <rect x="3" y="8.25" width="10" height="4.75" rx=".75" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="4" height="4" rx=".5" />
      <rect x="9" y="3" width="4" height="4" rx=".5" />
      <rect x="3" y="9" width="4" height="4" rx=".5" />
      <rect x="9" y="9" width="4" height="4" rx=".5" />
    </>
  ),
  oval: <circle cx="8" cy="8" r="5" />,
  image: (
    <>
      <rect x="2.75" y="3.25" width="10.5" height="9.5" rx="1" />
      <circle cx="6" cy="6.5" r="1" />
      <path d="m3.5 11 3-3 2.25 2.25L10.5 8l2 2" />
    </>
  ),
  link: (
    <path d="M6.5 9.5 9.5 6.5M5.75 7.25 4.5 8.5a2.1 2.1 0 0 0 3 3l1.25-1.25M10.25 8.75l1.25-1.25a2.1 2.1 0 0 0-3-3L7.25 5.75" />
  ),
  eye: (
    <>
      <path d="M1.75 8S4 4.25 8 4.25 14.25 8 14.25 8 12 11.75 8 11.75 1.75 8 1.75 8z" />
      <circle cx="8" cy="8" r="1.75" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M2.25 2.25l11.5 11.5" />
      <path d="M6.2 4.55A6.5 6.5 0 0 1 8 4.25c4 0 6.25 3.75 6.25 3.75a11 11 0 0 1-2.2 2.5M4.3 5.7A10.8 10.8 0 0 0 1.75 8S4 11.75 8 11.75c.7 0 1.35-.1 1.95-.3" />
    </>
  ),
  lock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
      <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
    </>
  ),
  unlock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
      <path d="M5.5 7V5.25a2.5 2.5 0 0 1 4.75-1" />
    </>
  ),
  "align-left": <path d="M2.75 3v10M5 5.25h7M5 10.75h4.5" />,
  "align-center-h": <path d="M8 2.75v10.5M4 5.25h8M5.5 10.75h5" />,
  "align-right": <path d="M13.25 3v10M4 5.25h7M6.5 10.75H13" />,
  "distribute-h": <path d="M2.75 3v10M13.25 3v10M6 5.25h4M5 10.75h6" />,
  "align-top": <path d="M3 2.75h10M5.25 5v7M10.75 5v4.5" />,
  "align-center-v": <path d="M2.75 8h10.5M5.25 4v8M10.75 5.5v5" />,
  "align-bottom": <path d="M3 13.25h10M5.25 4v7M10.75 6.5V11" />,
  "distribute-v": <path d="M3 2.75h10M3 13.25h10M5.25 6v4M10.75 5v6" />,
  folder: <path d="M2.75 4h4l1.25 1.5h5.25v7.25H2.75z" />,
  component: <path d="m8 2.5 3 3-3 3-3-3zM8 7.5l3 3-3 3-3-3z" />,
  trash: <path d="M3.5 4.5h9M6 4.5V3h4v1.5M5 4.5l.5 9h5l.5-9M7 7v4M9 7v4" />,
  more: (
    <>
      <circle cx="3.5" cy="8" r=".9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r=".9" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="8" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
};

export function Icon({ name, size = 16, ...props }: IconProps) {
  const key = extractedKey(name);
  if (key) {
    const asset = FRAMER_ICONS[key];
    const isLogo = key === "logo";
    const width = isLogo ? Math.round((size * asset.width) / asset.height) : size;
    return (
      <svg
        width={width}
        height={size}
        viewBox={asset.viewBox}
        fill="none"
        aria-hidden="true"
        {...props}
        dangerouslySetInnerHTML={{ __html: asset.inner }}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {strokePaths[name]}
    </svg>
  );
}
