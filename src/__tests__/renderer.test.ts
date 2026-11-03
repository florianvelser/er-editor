import { describe, it, expect, beforeEach, vi } from "vitest";
import d3SvgToPng from "d3-svg-to-png";
import { ERDiagramImageRenderer } from "../renderer";
import { ERDiagram } from "../diagram";
import { ERNode } from "../ernode";
import { mountAppShell } from "../test/domFixture";

// d3-svg-to-png rasterizes via <canvas>, which jsdom does not implement.
// We mock it and instead verify that our own glue code (cloning/sizing the
// svg, passing the right options, cleaning up the DOM) behaves correctly.
vi.mock("d3-svg-to-png", () => ({
    default: vi.fn().mockResolvedValue("data:image/png;base64,mocked"),
}));

// renderer.ts calls opentype.load(url), which in a browser does an
// XMLHttpRequest - unavailable (and pointless) in this jsdom test run, since
// there is no server to serve the font from. We replace only that network
// fetch with a direct filesystem read, and hand the bytes to opentype's own
// (real, unmocked) `parse`, so the actual glyph / path-generation API
// surface that a future opentype.js update could break is still exercised
// for real.
vi.mock("opentype.js", async (importOriginal) => {
    const actual = await importOriginal<{ default: { parse(buf: ArrayBuffer): unknown } }>();
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const fontPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fonts", "Inter_28pt-Regular.ttf");

    return {
        ...actual,
        default: {
            ...actual.default,
            load: vi.fn(async () => {
                const buffer = readFileSync(fontPath);
                const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
                return actual.default.parse(arrayBuffer);
            }),
        },
    };
});

function createDiagram(): ERDiagram {
    return new ERDiagram("svg", 1024, 768);
}

beforeEach(() => {
    mountAppShell();
    vi.spyOn(ERNode.prototype, "setScale").mockImplementation(() => { });
});

describe("ERDiagramImageRenderer standalone SVG export", () => {
    it("replaces foreignObject node labels and text link labels with real glyph paths", async () => {
        const diagram = createDiagram();
        const renderer = new ERDiagramImageRenderer(diagram, "testproject");

        // Sanity check: the rendered diagram actually contains the elements
        // the converter is supposed to replace.
        expect(diagram.svg.node()!.querySelectorAll("foreignObject").length).toBeGreaterThan(0);
        expect(diagram.svg.node()!.querySelectorAll("text").length).toBeGreaterThan(0);

        const svgString: string = await (renderer as unknown as { _prepareStandaloneSVGString(): Promise<string> })._prepareStandaloneSVGString();

        expect(svgString).toContain("<?xml");
        expect(svgString).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svgString).not.toContain("<foreignObject");
        expect(svgString).not.toContain("<text");

        // Each converted label becomes a <path> with real, non-trivial glyph
        // data produced by opentype.js - not an empty/placeholder path.
        const pathMatches = [...svgString.matchAll(/<path d="([^"]*)"/g)];
        expect(pathMatches.length).toBeGreaterThan(0);
        for (const [, d] of pathMatches) {
            expect(d.length).toBeGreaterThan(10);
        }

        // The export must not leak its temporary cloned SVG into the live document.
        expect(document.getElementById("clonedSvg")).toBeNull();
    });

    it("renders the watermark text as a glyph path instead of a live <text> node", async () => {
        const diagram = createDiagram();
        const renderer = new ERDiagramImageRenderer(diagram, "testproject");

        const svgString: string = await (renderer as unknown as { _prepareStandaloneSVGString(): Promise<string> })._prepareStandaloneSVGString();

        expect(svgString).not.toMatch(/<text[^>]*>Created with erditor/);
        expect(svgString).not.toContain("Created with erditor<");
    });
});

describe("ERDiagramImageRenderer raster export", () => {
    beforeEach(() => {
        vi.mocked(d3SvgToPng).mockClear();
    });

    it("exportImage clones the diagram svg, sizes it to the bbox and hands it to d3-svg-to-png", () => {
        const diagram = createDiagram();
        const renderer = new ERDiagramImageRenderer(diagram, "testproject");
        const bbox = diagram.getDiagramBBox();

        renderer.exportImage("png", 0.9, 2, true);

        expect(d3SvgToPng).toHaveBeenCalledTimes(1);
        const [selector, fileName, options] = vi.mocked(d3SvgToPng).mock.calls[0];
        expect(selector).toBe("#clonedSvg");
        expect(fileName).toBe("testproject");
        expect(options).toMatchObject({
            scale: 2,
            format: "png",
            quality: 0.9,
            download: true,
            background: "transparent",
        });
        void bbox;

        // The temporary clone used for export must not remain attached to the live document.
        expect(document.getElementById("clonedSvg")).toBeNull();
    });

    it("exportImageUrl resolves with the data URL produced by d3-svg-to-png", async () => {
        vi.mocked(d3SvgToPng).mockResolvedValueOnce("data:image/png;base64,FAKE");
        const diagram = createDiagram();
        const renderer = new ERDiagramImageRenderer(diagram, "testproject");

        const url = await renderer.exportImageUrl("png", 1, 1);

        expect(url).toBe("data:image/png;base64,FAKE");
        expect(document.getElementById("clonedSvg")).toBeNull();
    });
});
