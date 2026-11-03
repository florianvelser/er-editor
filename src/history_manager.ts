import type { StateSnapshot } from "./types";

/***************************************
 * History Manager for Undo/Redo functionality
 ***************************************/
export class HistoryManager {
    private undoStack: StateSnapshot[];
    private redoStack: StateSnapshot[];
    private undoButton: HTMLElement;
    private redoButton: HTMLElement;

    constructor() {
        this.undoStack = [];
        this.redoStack = [];
        // Cache DOM elements
        this.undoButton = document.getElementById("undo-btn")!;
        this.redoButton = document.getElementById("redo-btn")!;
        this.updateButtons();
    }

    clear(): void {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.updateButtons();
    }

    updateButtons(): void {
        // Toggle "disabled" class based on stack lengths
        this.undoButton.classList.toggle("disabled", this.undoStack.length === 0);
        this.redoButton.classList.toggle("disabled", this.redoStack.length === 0);
    }

    // Save a snapshot of the current state. Clear the redo stack on new action.
    save(state: StateSnapshot): void {
        // Deep copy the state
        this.undoStack.push(JSON.parse(JSON.stringify(state)));
        this.redoStack.length = 0;
        this.updateButtons();
    }

    // Undo: push current state to redoStack and return the last state from undoStack
    undo(currentState: StateSnapshot): StateSnapshot | null {
        if (this.undoStack.length === 0) return null;
        // Deep copy current state before pushing to redoStack
        this.redoStack.push(JSON.parse(JSON.stringify(currentState)));
        const lastState = this.undoStack.pop()!;
        this.updateButtons();
        return lastState;
    }

    // Redo: push current state to undoStack and return the last state from redoStack
    redo(currentState: StateSnapshot): StateSnapshot | null {
        if (this.redoStack.length === 0) return null;
        this.undoStack.push(JSON.parse(JSON.stringify(currentState)));
        const nextState = this.redoStack.pop()!;
        this.updateButtons();
        return nextState;
    }
}
