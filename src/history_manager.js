/***************************************
 * History Manager for Undo/Redo functionality
 ***************************************/
export class HistoryManager {
    constructor() {
        this.undoStack = [];
        this.redoStack = [];
        // Cache DOM elements
        this.undoButton = document.getElementById("undo-btn");
        this.redoButton = document.getElementById("redo-btn");
        this.updateButtons();
    }

    clear() {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.updateButtons();
    }

    updateButtons() {
        // Toggle "disabled" class based on stack lengths
        this.undoButton.classList.toggle("disabled", this.undoStack.length === 0);
        this.redoButton.classList.toggle("disabled", this.redoStack.length === 0);
    }

    // Save a snapshot of the current state. Clear the redo stack on new action.
    save(state) {
        // Deep copy the state
        this.undoStack.push(JSON.parse(JSON.stringify(state)));
        this.redoStack.length = 0;
        this.updateButtons();
    }

    // Undo: push current state to redoStack and return the last state from undoStack
    undo(currentState) {
        if (this.undoStack.length === 0) return null;
        // Deep copy current state before pushing to redoStack
        this.redoStack.push(JSON.parse(JSON.stringify(currentState)));
        const lastState = this.undoStack.pop();
        this.updateButtons();
        return lastState;
    }

    // Redo: push current state to undoStack and return the last state from redoStack
    redo(currentState) {
        if (this.redoStack.length === 0) return null;
        this.undoStack.push(JSON.parse(JSON.stringify(currentState)));
        const nextState = this.redoStack.pop();
        this.updateButtons();
        return nextState;
    }
}