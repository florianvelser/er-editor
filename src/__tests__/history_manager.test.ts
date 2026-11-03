import { describe, it, expect, beforeEach } from "vitest";
import { HistoryManager } from "../history_manager";
import type { StateSnapshot } from "../types";

function state(marker: number): StateSnapshot {
    return { nodes: [{ id: String(marker), text: "Entity", type: "entity", x: 0, y: 0 }], links: [] };
}

describe("HistoryManager", () => {
    let undoButton: HTMLElement;
    let redoButton: HTMLElement;

    beforeEach(() => {
        document.body.innerHTML = '<div id="undo-btn"></div><div id="redo-btn"></div>';
        undoButton = document.getElementById("undo-btn")!;
        redoButton = document.getElementById("redo-btn")!;
    });

    it("disables both buttons initially", () => {
        new HistoryManager();
        expect(undoButton.classList.contains("disabled")).toBe(true);
        expect(redoButton.classList.contains("disabled")).toBe(true);
    });

    it("enables undo after a save and keeps redo disabled", () => {
        const history = new HistoryManager();
        history.save(state(1));
        expect(undoButton.classList.contains("disabled")).toBe(false);
        expect(redoButton.classList.contains("disabled")).toBe(true);
    });

    it("returns the previous state on undo and moves the current one to the redo stack", () => {
        const history = new HistoryManager();
        history.save(state(1));
        const previous = history.undo(state(2));
        expect(previous).toEqual(state(1));
        expect(redoButton.classList.contains("disabled")).toBe(false);

        const redone = history.redo(state(1));
        expect(redone).toEqual(state(2));
    });

    it("returns null when undoing or redoing an empty stack", () => {
        const history = new HistoryManager();
        expect(history.undo(state(1))).toBeNull();
        expect(history.redo(state(1))).toBeNull();
    });

    it("clears the redo stack whenever a new state is saved", () => {
        const history = new HistoryManager();
        history.save(state(1));
        history.undo(state(2));
        expect(redoButton.classList.contains("disabled")).toBe(false);

        history.save(state(3));
        expect(redoButton.classList.contains("disabled")).toBe(true);
        expect(history.redo(state(3))).toBeNull();
    });

    it("clear() empties both stacks and disables both buttons", () => {
        const history = new HistoryManager();
        history.save(state(1));
        history.clear();
        expect(undoButton.classList.contains("disabled")).toBe(true);
        expect(redoButton.classList.contains("disabled")).toBe(true);
    });

    it("deep-copies saved state so later mutation of the original does not affect history", () => {
        const history = new HistoryManager();
        const original = state(1);
        history.save(original);
        original.nodes[0].text = "mutated";

        const previous = history.undo(state(2));
        expect(previous!.nodes[0].text).toBe("Entity");
    });
});
