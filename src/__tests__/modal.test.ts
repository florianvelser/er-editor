import { describe, it, expect, beforeEach } from "vitest";
import { ConfirmModal, InputModal, SelectModal, ExportModal } from "../modal";
import { mountAppShell } from "../test/domFixture";

beforeEach(() => {
    mountAppShell();
});

describe("ConfirmModal", () => {
    it("resolves true when the confirm button is clicked", async () => {
        const modal = new ConfirmModal({ title: "Delete?", text: "Are you sure?" });
        const resultPromise = modal.show();

        document.getElementById("modal-confirm")!.dispatchEvent(new MouseEvent("click"));

        await expect(resultPromise).resolves.toBe(true);
        expect((document.getElementById("modal") as HTMLElement).style.display).toBe("none");
    });

    it("resolves false when the cancel button is clicked", async () => {
        const modal = new ConfirmModal({ title: "Delete?", text: "Are you sure?" });
        const resultPromise = modal.show();

        document.getElementById("modal-cancel")!.dispatchEvent(new MouseEvent("click"));

        await expect(resultPromise).resolves.toBe(false);
    });

    it("resolves false when the backdrop is clicked", async () => {
        const modal = new ConfirmModal({ title: "Delete?", text: "Are you sure?" });
        const resultPromise = modal.show();

        document.getElementById("modal-backdrop")!.dispatchEvent(new MouseEvent("click"));

        await expect(resultPromise).resolves.toBe(false);
    });
});

describe("InputModal", () => {
    it("pre-fills the input with the default value and resolves with the edited value", async () => {
        const modal = new InputModal({ title: "Rename", defaultValue: "untitled" });
        const resultPromise = modal.show();

        const input = document.querySelector<HTMLInputElement>(".modal-control input")!;
        expect(input.value).toBe("untitled");

        input.value = "my-diagram";
        document.getElementById("modal-confirm")!.dispatchEvent(new MouseEvent("click"));

        await expect(resultPromise).resolves.toBe("my-diagram");
    });

    it("resolves with null on cancel", async () => {
        const modal = new InputModal({ title: "Rename" });
        const resultPromise = modal.show();

        document.getElementById("modal-cancel")!.dispatchEvent(new MouseEvent("click"));

        await expect(resultPromise).resolves.toBeNull();
    });
});

describe("SelectModal", () => {
    it("defaults to the given option and resolves with the newly selected one", async () => {
        const modal = new SelectModal({ title: "Cardinality", options: ["1", "n", "m"], defaultOption: "n" });
        const resultPromise = modal.show();

        const segments = document.querySelectorAll<HTMLDivElement>(".modal-control .segment");
        expect(segments).toHaveLength(3);
        expect(Array.from(segments).find(s => s.classList.contains("active"))?.dataset.value).toBe("n");

        const mSegment = Array.from(segments).find(s => s.dataset.value === "m")!;
        mSegment.dispatchEvent(new MouseEvent("click"));
        document.getElementById("modal-confirm")!.dispatchEvent(new MouseEvent("click"));

        await expect(resultPromise).resolves.toBe("m");
    });
});

describe("ExportModal", () => {
    it("resolves with the chosen format, scale and transparency flag", async () => {
        const modal = new ExportModal({ imageSrc: "data:image/png;base64,abc" });
        const resultPromise = modal.show();

        (document.getElementById("opt-transparent") as HTMLInputElement).checked = true;
        document.getElementById("opt-transparent")!.dispatchEvent(new Event("change"));

        const scale2 = document.querySelector<HTMLDivElement>('#opt-scale .segment[data-value="2"]')!;
        scale2.dispatchEvent(new MouseEvent("click"));

        document.querySelector<HTMLButtonElement>('.export-actions .btn[data-format="svg"]')!
            .dispatchEvent(new MouseEvent("click"));

        await expect(resultPromise).resolves.toEqual({
            format: "svg",
            scale: 2,
            transparent: true,
        });
    });

    it("resolves with null when the backdrop is clicked", async () => {
        const modal = new ExportModal({});
        const resultPromise = modal.show();

        document.getElementById("export-backdrop")!.dispatchEvent(new MouseEvent("click"));

        await expect(resultPromise).resolves.toBeNull();
    });
});
