import type { ERNode } from "./ernode";

export class Contextmenu {
    private contextnode: ERNode | null;
    private element: HTMLElement;
    private node: ERNode | null;

    constructor() {
        this.contextnode = null;
        this.element = document.getElementById("contextmenu")!;
        this.element.addEventListener("blur", () => {
            this.hide();
        });
        this.node = null;
    }

    setPosition(x: number, y: number): void {
        this.element.style.left = x + "px";
        this.element.style.top = y + "px";
    }

    show(node: ERNode): void {
        this.hide();
        this.node = node;
        const isAttribute = node.type === "attribute";
        const isEntity = node.type === "entity";
        const primaryBtn = document.getElementById("set-primary-key")!;
        const addBtn = document.getElementById("add-attribute-button")!;
        const recursiveBtn = document.getElementById("add-recursive-relation-button")!;
        primaryBtn.style.display = isAttribute ? "block" : "none";
        addBtn.style.display = isAttribute ? "none" : "block";
        recursiveBtn.style.display = isEntity ? "block" : "none";

        const isRelationship = node.type === "relationship";
        const partialKeyBtn = document.getElementById("toggle-partial-key")!;
        const weakBtn = document.getElementById("toggle-weak-entity")!;
        const identifyingBtn = document.getElementById("toggle-identifying-relation")!;
        partialKeyBtn.style.display = isAttribute ? "block" : "none";
        weakBtn.style.display = isEntity ? "block" : "none";
        identifyingBtn.style.display = isRelationship ? "block" : "none";
        partialKeyBtn.textContent = node.partialKey ? "Remove partial key" : "Set as partial key";
        weakBtn.textContent = node.weak ? "Mark as regular entity" : "Mark as weak entity";
        identifyingBtn.textContent = node.identifying ? "Mark as regular relation" : "Mark as identifying relation";

        this.contextnode = node;
        const menu = this.element;
        menu.style.display = "block";

        const menuLeft = menu.offsetLeft;
        const menuTop = menu.offsetTop;
        const menuWidth = menu.offsetWidth;
        const menuHeight = menu.offsetHeight;

        const right = menuLeft + menuWidth;
        const bottom = menuTop + menuHeight;

        let tx = 0;
        let ty = 0;

        // Shift horizontally (goes off to the right)
        if (right > window.innerWidth) {
            const proposedLeft = menuLeft - menuWidth;
            if (proposedLeft >= 0) {
                // Enough space to the left – shift full width
                tx = -menuWidth;
            } else {
                // Not enough space – shift just enough to leave 20px on the right
                tx = window.innerWidth - right - 20;
            }
        }

        // Shift vertically (goes off to the bottom)
        if (bottom > window.innerHeight) {
            const proposedTop = menuTop - menuHeight;
            if (proposedTop >= 0) {
                // Enough space above – shift full height
                ty = -menuHeight;
            } else {
                // Not enough space – shift just enough to leave 20px at the bottom
                ty = window.innerHeight - bottom - 20;
            }
        }

        menu.style.transform = `translate(${tx}px, ${ty}px)`;
        menu.focus();
    }

    hide(): void {
        this.element.style.display = "none";
        if (this.node) {
            this.node.setScale(1);
        }
        this.node = null;
    }

    getContextNode(): ERNode | null {
        return this.contextnode;
    }
}
