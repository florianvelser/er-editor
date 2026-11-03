import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const indexHtmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.html");

/**
 * Mounts the real index.html body (minus its module script tag) into the jsdom
 * document, so classes that look up elements by id (ERDiagram, Contextmenu,
 * the modal classes, ...) find the same markup they do in the browser.
 */
export function mountAppShell(): void {
    const html = readFileSync(indexHtmlPath, "utf-8");
    const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
    const body = bodyMatch ? bodyMatch[1] : "";
    document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, "");
}
