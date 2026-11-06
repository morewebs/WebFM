/**
 * Server entry point for the renderer. Kept separate so the editor bundle
 * never pulls in react-dom/server.
 */
export * from "./index";
export { renderPageToHtml } from "./html";
