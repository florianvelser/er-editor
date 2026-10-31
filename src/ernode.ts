import * as d3 from "d3";
import { easeBackOut } from "d3";
import type { ERNodeConfig, NodeType } from "./types";

const SCALE_ANIMATION_DURATION = 200;

type NodeSelection = d3.Selection<SVGGElement, unknown, null, undefined>;
type GenericSelection<GElement extends Element = Element> = d3.Selection<GElement, unknown, null, undefined>;

/**
 * Custom class representing a node in the ER diagram.
 */
export class ERNode implements d3.SimulationNodeDatum {
    id!: string;
    type!: NodeType;
    text!: string;
    width?: number;
    height?: number;
    rx?: number;
    primary?: boolean;

    index?: number;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;

    selection!: NodeSelection;
    labelDiv?: d3.Selection<HTMLDivElement, unknown, null, undefined>;

    rightClickListeners: Array<(event: Event) => void> = [];
    touchMoveListeners: Array<(event: TouchEvent) => void> = [];
    changeListeners: Array<(before: string, after: string) => void> = [];
    editEndListeners: Array<() => void> = [];

    _originalText?: string;
    _currentSelectedNode?: ERNode | null;

    constructor(config: ERNodeConfig, diagramWidth?: number, diagramHeight?: number) {
        Object.assign(this, config);
        // Set initial positions if not provided.
        if (typeof this.x !== "number") {
            this.x = Math.random() * (diagramWidth as number);
        }
        if (typeof this.y !== "number") {
            this.y = Math.random() * (diagramHeight as number);
        }
        // Set default dimensions depending on type.
        switch (this.type) {
            case "entity":
                if (typeof this.width !== "number") this.width = 120;
                break;
            case "attribute":
                if (typeof this.rx !== "number") this.rx = 50;
                break;
            case "relationship":
                if (typeof this.width !== "number") this.width = 100;
                if (typeof this.height !== "number") this.height = 60;
                break;
            default:
                break;
        }
    }

    addRightClickListener(listener: (event: Event) => void): void {
        this.rightClickListeners.push(listener);
    }

    addTouchMoveListener(listener: (event: TouchEvent) => void): void {
        this.touchMoveListeners.push(listener);
    }

    removeRightClickListener(listener: (event: Event) => void): void {
        this.rightClickListeners = this.rightClickListeners.filter(l => l !== listener);
    }

    removeTouchMoveListener(listener: (event: TouchEvent) => void): void {
        this.touchMoveListeners = this.touchMoveListeners.filter(l => l !== listener);
    }

    /**
     * Registers a listener function to be called when the text changes.
     * The listener is called with two parameters: before and after.
     */
    addChangeListener(listener: (before: string, after: string) => void): void {
        this.changeListeners.push(listener);
    }

    addEditEndListener(listener: () => void): void {
        this.editEndListeners.push(listener);
    }

    /**
     * Optional: Removes a Change Listener.
     */
    removeChangeListener(listener: (before: string, after: string) => void): void {
        this.changeListeners = this.changeListeners.filter(l => l !== listener);
    }

    render(selection: NodeSelection): void {
        // Save group selection for updates
        this.selection = selection;
        // Clear previous contents.
        selection.selectAll("*").remove();

        // Inner group for scaling
        const inner = selection.append("g")
            .attr("class", "node-inner");

        // Render based on the node type.
        switch (this.type) {
            case "entity": this.renderEntity(inner); break;
            case "relationship": this.renderRelationship(inner); break;
            case "attribute": this.renderAttribute(inner); break;
            default: console.warn(`Unknown node type: ${this.type}`);
        }
        this.renderLabel(inner);
        this.adjustSize(inner);
    }

    renderEntity(selection: NodeSelection): void {
        selection.append("rect")
            .attr("x", -60).attr("y", -30)
            .attr("width", 120).attr("height", 60)
            .attr("rx", 10).attr("ry", 10)
            .attr("fill", "#ffcc00");
    }

    renderRelationship(selection: NodeSelection): void {
        const defaultW = 80, defaultH = 40;
        const points = `0,${-defaultH / 2} ${defaultW / 2},0 0,${defaultH / 2} ${-defaultW / 2},0`;
        selection.append("polygon")
            .attr("points", points)
            .attr("fill", "#ccffcc");
    }

    renderAttribute(selection: NodeSelection): void {
        selection.append("ellipse")
            .attr("cx", 0).attr("cy", 0)
            .attr("rx", 50).attr("ry", 25)
            .attr("fill", "#66ccff");
    }

    /**
     * Renders the label as a foreignObject containing an HTML div.
     * The div shows the text and enables editing on double-click.
     */
    renderLabel(selection: NodeSelection): void {
        let defaultWidth = 120, defaultHeight = 60;
        if (this.type === "relationship") {
            defaultWidth = 80;
            defaultHeight = 80;
        } else if (this.type === "attribute") {
            defaultWidth = 100;
            defaultHeight = 50;
        }

        const fo = selection.append("foreignObject")
            .attr("class", "node-label")
            .attr("x", -defaultWidth / 2)
            .attr("y", -defaultHeight / 2)
            .attr("width", defaultWidth)
            .attr("height", defaultHeight);

        const div = fo.append<HTMLDivElement>("xhtml:div")
            .style("width", "100%")
            .style("height", "100%")
            .style("display", "flex")
            .style("align-items", "center")
            .style("justify-content", "center")
            .style("font-size", "14px")
            .style("text-align", "center")
            .style("overflow", "visible")
            .style("user-select", "none")
            .style("margin", "0")
            .style("padding", "0")
            .style("border", "none")
            .style("outline", "none")
            .style("box-sizing", "border-box")
            .style("white-space", "nowrap")
            .attr("draggable", "false")
            .text(this.text)
            .on("contextmenu", event => {
                event.preventDefault();
                this.contextmenu(event);
            });

        // --- Touch Events ---
        const LONG_PRESS_DURATION = 500;
        const DOUBLE_TAP_MAX_DELAY = 300;
        let touchTimer: ReturnType<typeof setTimeout> | null = null;
        let touchTimer_scale_animation: ReturnType<typeof setTimeout> | null = null;
        let lastTapTime = 0;
        let longPressTriggered = false;

        div.on("touchstart", event => {
            // Prevent only single-touch gestures to allow multi-touch (e.g. pinch-to-zoom)
            if (event.touches && event.touches.length > 1) return;
            event.preventDefault();
            this.highlight();
            longPressTriggered = false;
            touchTimer = setTimeout(() => {
                this.contextmenu(event);
                longPressTriggered = true;
                touchTimer = null;
            }, LONG_PRESS_DURATION);
            touchTimer_scale_animation = setTimeout(() => {
                this.setScale(1.15);
                touchTimer_scale_animation = null;
            }, LONG_PRESS_DURATION - SCALE_ANIMATION_DURATION);
        });

        div.on("touchend", event => {
            // Do not prevent default if it's part of a multi-touch
            if (event.touches && event.touches.length > 0) return;
            event.preventDefault();
            this.removeHighlight();
            const now = Date.now();
            if (touchTimer) {
                clearTimeout(touchTimer);
                if (touchTimer_scale_animation) clearTimeout(touchTimer_scale_animation);
                touchTimer = null;
                touchTimer_scale_animation = null;
            }

            if (!longPressTriggered) {
                this.setScale(1);
            }
            // Double-Tap fürs Editieren
            if (now - lastTapTime < DOUBLE_TAP_MAX_DELAY) {
                this.enableEditing(event, div);
                lastTapTime = 0;
            } else {
                lastTapTime = now;
            }
        });

        div.on("touchmove touchcancel", (event) => {
            this.touchMoveListeners.forEach(listener => listener(event));
            this.removeHighlight();
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
            if (touchTimer_scale_animation) {
                clearTimeout(touchTimer_scale_animation);
                touchTimer_scale_animation = null;
            }
        });

        div.on("dblclick", event => this.enableEditing(event, div));

        if (this.primary) {
            div.style("text-decoration", "underline");
        }

        this.labelDiv = div;
    }

    contextmenu(event: Event): void {
        this.removeHighlight();
        this.rightClickListeners.forEach(listener => listener(event));
    }

    setScale(scale: number): void {
        this.selection.select<SVGGElement>("g.node-inner")
            .transition()
            .duration(SCALE_ANIMATION_DURATION)
            .ease(easeBackOut.overshoot(1.7)) // höherer Wert = mehr "Bounce"
            .attr("transform", `scale(${scale})`);
    }

    highlight(): void {
        this.selection.select("rect").attr("fill", "#e6b800");
        this.selection.select("ellipse").attr("fill", "#5fbbe9");
        this.selection.select("polygon").attr("fill", "#b3e0b3");
    }

    removeHighlight(): void {
        this.selection.select("rect").attr("fill", "#ffcc00");
        this.selection.select("ellipse").attr("fill", "#66ccff");
        this.selection.select("polygon").attr("fill", "#ccffcc");
    }

    enableEditing(event?: Event, div?: d3.Selection<HTMLDivElement, unknown, null, undefined>): void {
        event?.stopPropagation();
        const labelDiv = div || this.labelDiv;
        if (!labelDiv) return;

        this._originalText = this.text;
        const node = labelDiv.node()!;
        node.setAttribute("contenteditable", "true");
        node.focus();

        const range = document.createRange();
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);

        labelDiv.style("outline", "none").style("border", "none");
        labelDiv.on("blur", () => this.disableEditing(labelDiv));
        labelDiv.on("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault();
                node.blur();
            }
        });
        labelDiv.on("input", () => {
            const parentGroup = d3.select(node.parentNode!.parentNode as Element);
            this.adjustSize(parentGroup);
        });
    }

    disableEditing(div: d3.Selection<HTMLDivElement, unknown, null, undefined>): void {
        const node = div.node()!;
        node.removeAttribute("contenteditable");
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();

        // Ensure the node is unfixed after editing, especially important on mobile devices
        this.fx = null;
        this.fy = null;

        this.editEndListeners.forEach(listener => listener());

        const newText = div.text();
        if (newText === this._originalText) return;
        const before = this._originalText as string;
        const after = newText;
        this.changeListeners.forEach(listener => listener(before, after));
        this.text = newText;
        const parentGroup = d3.select(node.parentNode!.parentNode as Element);
        this.adjustSize(parentGroup);
    }

    /**
     * Adjusts the size of the node based on the text content.
     * This method ensures that the text remains legible by adjusting the font size and shape accordingly.
     */
    adjustSize<GElement extends Element>(selection: GenericSelection<GElement>): void {
        const div = selection.select<HTMLDivElement>("foreignObject > div");
        if (div.empty()) return;

        const PADDING = 20, MAX_WIDTH = 300, DEFAULT_FONT_SIZE = 14, MIN_FONT_SIZE = 10;
        let currentFontSize = parseFloat(div.style("font-size")) || DEFAULT_FONT_SIZE;
        const nodeEl = div.node()!;
        const originalWidth = nodeEl.style.width;
        nodeEl.style.width = "fit-content";
        let textWidth = nodeEl.scrollWidth;
        nodeEl.style.width = originalWidth;

        if (textWidth > MAX_WIDTH - PADDING) {
            let newFontSize = Math.max(MIN_FONT_SIZE, currentFontSize * (MAX_WIDTH - PADDING) / textWidth);
            div.style("font-size", `${newFontSize}px`);
        } else {
            div.style("font-size", `${DEFAULT_FONT_SIZE}px`);
        }

        nodeEl.style.width = "fit-content";
        textWidth = nodeEl.scrollWidth;
        nodeEl.style.width = originalWidth;

        const newWidth = Math.max(100, textWidth + PADDING);
        selection.select("foreignObject")
            .attr("width", newWidth)
            .attr("x", -newWidth / 2);

        switch (this.type) {
            case "entity": this.adjustEntitySize(selection, newWidth); break;
            case "attribute": this.adjustAttributeSize(selection, newWidth); break;
            case "relationship": this.adjustRelationshipSize(selection, newWidth); break;
        }
    }

    adjustEntitySize<GElement extends Element>(selection: GenericSelection<GElement>, newWidth: number): void {
        const finalWidth = Math.max(120, newWidth);
        selection.select("rect")
            .attr("width", finalWidth)
            .attr("x", -finalWidth / 2);
        this.width = finalWidth;
    }

    adjustAttributeSize<GElement extends Element>(selection: GenericSelection<GElement>, newWidth: number): void {
        const newRx = Math.max(50, newWidth / 2);
        selection.select("ellipse")
            .attr("rx", newRx);
        this.rx = newRx;
    }

    adjustRelationshipSize<GElement extends Element>(selection: GenericSelection<GElement>, newWidth: number): void {
        const finalWidth = Math.max(80, newWidth) * 1.4;
        const newHeight = 80;
        const points = `0,${-newHeight / 2} ${finalWidth / 2},0 0,${newHeight / 2} ${-finalWidth / 2},0`;
        selection.select("polygon")
            .attr("points", points);
        this.width = finalWidth;
        this.height = newHeight;
    }

    getBoundingBox(): { left: number; right: number; top: number; bottom: number } {
        switch (this.type) {
            case "entity": return {
                left: (this.x as number) - (this.width as number) / 2,
                right: (this.x as number) + (this.width as number) / 2,
                top: (this.y as number) - 30,
                bottom: (this.y as number) + 30
            };
            case "relationship": return {
                left: (this.x as number) - (this.width as number) / 2,
                right: (this.x as number) + (this.width as number) / 2,
                top: (this.y as number) - 40,
                bottom: (this.y as number) + 40
            };
            case "attribute": return {
                left: (this.x as number) - (this.rx as number),
                right: (this.x as number) + (this.rx as number),
                top: (this.y as number) - 25,
                bottom: (this.y as number) + 25
            };
            default: return { left: this.x as number, right: this.x as number, top: this.y as number, bottom: this.y as number };
        }
    }

    collidesWith(other: ERNode): boolean {
        const a = this.getBoundingBox();
        const b = other.getBoundingBox();
        return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    }

    getCollidingNodes(nodes: ERNode[]): ERNode[] {
        return nodes.filter(node => node !== this && this.collidesWith(node));
    }

    /**
     * Marks the node as selected and displays a light grey frame.
     */
    select(): void {
        if (this.selection.select(".node-selection-border").node()) return;
        if (this.type === "entity") {
            const gap = 4;
            this.selection.insert("rect", ":first-child")
                .attr("class", "node-selection-border")
                .attr("x", -(this.width as number) / 2 - gap)
                .attr("y", -30 - gap)
                .attr("rx", 12)
                .attr("width", (this.width as number) + gap * 2)
                .attr("height", 60 + gap * 2)
                .attr("stroke", "#a1a1a1")
                .attr("stroke-width", 3)
                .attr("fill", "none");
        }
    }

    deselect(): void {
        this.selection.select(".node-selection-border").remove();
    }
}
