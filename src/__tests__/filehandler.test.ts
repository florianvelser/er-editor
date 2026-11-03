import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JsonFileHandler } from "../filehandler";
import type { StateSnapshot } from "../types";

describe("JsonFileHandler.downloadJson", () => {
    beforeEach(() => {
        // jsdom does not implement the Blob URL store or anchor navigation.
        vi.stubGlobal("URL", {
            ...URL,
            createObjectURL: vi.fn(() => "blob:mock-url"),
            revokeObjectURL: vi.fn(),
        });
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("triggers a download with the serialized JSON and given filename", () => {
        const state: StateSnapshot = {
            nodes: [{ id: "n1", text: "Entity", type: "entity", x: 1, y: 2 }],
            links: [],
        };

        let capturedAnchor: HTMLAnchorElement | undefined;
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
            const el = originalCreateElement(tagName);
            if (tagName === "a") capturedAnchor = el as HTMLAnchorElement;
            return el;
        });

        JsonFileHandler.downloadJson(state, "my-diagram.json");

        expect(capturedAnchor).toBeDefined();
        expect(capturedAnchor!.download).toBe("my-diagram.json");
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    });

    it("defaults the filename to data.json", () => {
        const state: StateSnapshot = { nodes: [], links: [] };
        let capturedAnchor: HTMLAnchorElement | undefined;
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
            const el = originalCreateElement(tagName);
            if (tagName === "a") capturedAnchor = el as HTMLAnchorElement;
            return el;
        });

        JsonFileHandler.downloadJson(state);

        expect(capturedAnchor!.download).toBe("data.json");
    });
});

describe("JsonFileHandler.openJsonFile", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("resolves with the parsed JSON content of the selected file", async () => {
        let capturedInput: HTMLInputElement | undefined;
        vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
            capturedInput = this;
        });

        const promise = JsonFileHandler.openJsonFile();

        const state: StateSnapshot = {
            nodes: [{ id: "n1", text: "Entity", type: "entity", x: 1, y: 2 }],
            links: [],
        };
        const file = new File([JSON.stringify(state)], "diagram.json", { type: "application/json" });
        Object.defineProperty(capturedInput!, "files", { value: [file] });
        capturedInput!.dispatchEvent(new Event("change"));

        await expect(promise).resolves.toEqual(state);
    });

    it("rejects when no file was selected", async () => {
        let capturedInput: HTMLInputElement | undefined;
        vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
            capturedInput = this;
        });

        const promise = JsonFileHandler.openJsonFile();
        Object.defineProperty(capturedInput!, "files", { value: [] });
        capturedInput!.dispatchEvent(new Event("change"));

        await expect(promise).rejects.toBe("No file selected.");
    });

    it("rejects when the file content is not valid JSON", async () => {
        let capturedInput: HTMLInputElement | undefined;
        vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
            capturedInput = this;
        });

        const promise = JsonFileHandler.openJsonFile();
        const file = new File(["not valid json"], "diagram.json", { type: "application/json" });
        Object.defineProperty(capturedInput!, "files", { value: [file] });
        capturedInput!.dispatchEvent(new Event("change"));

        await expect(promise).rejects.toBe("Error parsing JSON-file.");
    });
});
