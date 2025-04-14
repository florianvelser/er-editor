/**
 * Custom class representing a node in the ER diagram.
 */
export class ERNode {
    constructor(config, diagramWidth, diagramHeight) {
        Object.assign(this, config);
        // Array for registered Right Click Listeners
        this.rightClickListeners = [];
        // Array for registered Change Listeners
        this.changeListeners = [];

        // Set initial positions if not provided.
        if (typeof this.x !== 'number') {
            this.x = Math.random() * diagramWidth;
        }
        if (typeof this.y !== 'number') {
            this.y = Math.random() * diagramHeight;
        }
        // Set default dimensions depending on type.
        switch(this.type) {
            case "entity":
                if (typeof this.width !== 'number') this.width = 120;
                break;
            case "attribute":
                if (typeof this.rx !== 'number') this.rx = 50;
                break;
            case "relationship":
                if (typeof this.width !== 'number') this.width = 100;
                if (typeof this.height !== 'number') this.height = 60;
                break;
            default:
                break;
        }
    }

    addRightClickListener(listener) {
        this.rightClickListeners.push(listener);
    }

    removeRightClickListener(listener) {
        this.rightClickListeners = this.rightClickListeners.filter(l => l !== listener);
    }
    
    /**
     * Registers a listener function to be called when the text changes.
     * The listener is called with two parameters: before and after.
     * @param {Function} listener - The function to call on text change.
     */
    addChangeListener(listener) {
        this.changeListeners.push(listener);
    }
    
    /**
     * Optional: Removes a Change Listener.
     * @param {Function} listener - Listener to be removed.
     */
    removeChangeListener(listener) {
        this.changeListeners = this.changeListeners.filter(l => l !== listener);
    }

    render(selection) {
        // Save group selection for updates
        this.selection = selection;
        // Clear previous contents.
        selection.selectAll('*').remove();

        // Render based on the node type.
        switch (this.type) {
            case 'entity':
                this.renderEntity(selection);
                break;
            case 'relationship':
                this.renderRelationship(selection);
                break;
            case 'attribute':
                this.renderAttribute(selection);
                break;
            default:
                console.warn(`Unknown node type: ${this.type}`);
        }
        // Render the label as a foreignObject with an HTML div.
        this.renderLabel(selection);
        this.adjustSize(selection);
    }

    renderEntity(selection) {
        selection.append('rect')
            .attr('x', -60)
            .attr('y', -30)
            .attr('width', 120)
            .attr('height', 60)
            .attr('rx', 10)
            .attr('ry', 10)
            .attr('fill', '#ffcc00');
    }

    renderRelationship(selection) {
        const defaultW = 80, defaultH = 40;
        const points = `0,${-defaultH / 2} ${defaultW / 2},0 0,${defaultH / 2} ${-defaultW / 2},0`;
        selection.append('polygon')
            .attr('points', points)
            .attr('fill', '#ccffcc');
    }

    renderAttribute(selection) {
        selection.append('ellipse')
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('rx', 50)
            .attr('ry', 25)
            .attr('fill', '#66ccff');
    }

    /**
     * Renders the label as a foreignObject containing an HTML div.
     * The div shows the text and enables editing on double-click.
     */
    renderLabel(selection) {
        let defaultWidth = 120, defaultHeight = 60;
        if (this.type === 'relationship') {
            defaultWidth = 80;
            defaultHeight = 80;
        } else if (this.type === 'attribute') {
            defaultWidth = 100;
            defaultHeight = 50;
        }
        const fo = selection.append('foreignObject')
            .attr('class', 'node-label')
            .attr('x', -defaultWidth / 2)
            .attr('y', -defaultHeight / 2)
            .attr('width', defaultWidth)
            .attr('height', defaultHeight);

        const div = fo.append('xhtml:div')
            .style('width', '100%')
            .style('height', '100%')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'center')
            .style('font-size', '14px')
            .style('text-align', 'center')
            .style('overflow', 'visible')
            .style('user-select', 'none')
            .style('margin', '0')
            .style('padding', '0')
            .style('border', 'none')
            .style('outline', 'none')
            .style('box-sizing', 'border-box')
            .style('white-space', 'nowrap')
            .html(this.text)
            .on('dblclick', (event) => this.enableEditing(event, div))
            .on('contextmenu', (event) => this.contextmenu(event));
        if (this.primary) {
            div.style('text-decoration', 'underline');
        }

        this.labelDiv = div;
    }

    contextmenu(event) {
        this.rightClickListeners.forEach(listener => listener(event));
    }

    /**
     * Enables editing mode for the label div.
     * @param {Event} event - The double-click event.
     * @param {d3.Selection} div - The D3 selection of the div element.
     */
    enableEditing(event, div) {
        if (event && event.stopPropagation) {
            event.stopPropagation();
        }
        const labelDiv = div || this.labelDiv;
        if (!labelDiv) {
            console.error("No label DOM element found that can be edited.");
            return;
        }
        this._originalText = this.text;
        const node = labelDiv.node();
        node.setAttribute("contenteditable", "true");
        node.focus();
        const range = document.createRange();
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        labelDiv.style('outline', 'none').style('border', 'none');
        labelDiv.on('blur', () => this.disableEditing(labelDiv));
        labelDiv.on('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                node.blur();
            }
        });
    }

    /**
     * Disables editing mode, updates the text and notifies the diagram if needed.
     * @param {d3.Selection} div - The D3 selection of the div element.
     */
    disableEditing(div) {
        const node = div.node();
        node.removeAttribute("contenteditable");
        const newText = div.text();
        if (newText === this._originalText) return;
        const before = this._originalText;
        const after = newText;
        // Call all registered change listeners
        this.changeListeners.forEach(listener => listener(before, after));
        // Update the text
        this.text = newText;
        const parentGroup = d3.select(node.parentNode.parentNode);
        this.adjustSize(parentGroup);
    }

    /**
     * Adjusts the size of the node based on the text content.
     * This method ensures that the text remains legible by adjusting the font size and shape accordingly.
     * @param {d3.Selection} selection - The D3 selection of the node group.
     */
    adjustSize(selection) {
        const div = selection.select("foreignObject > div");
        if (div.empty()) return;
        const PADDING = 20, MAX_WIDTH = 300, DEFAULT_FONT_SIZE = 14, MIN_FONT_SIZE = 10;
        let currentFontSize = parseFloat(div.style("font-size")) || DEFAULT_FONT_SIZE;
        const nodeEl = div.node();
        const originalWidth = nodeEl.style.width;
        nodeEl.style.width = 'fit-content';
        let textWidth = nodeEl.scrollWidth;
        nodeEl.style.width = originalWidth;
        if (textWidth > MAX_WIDTH - PADDING) {
            let newFontSize = Math.max(MIN_FONT_SIZE, currentFontSize * (MAX_WIDTH - PADDING) / textWidth);
            div.style("font-size", `${newFontSize}px`);
            currentFontSize = newFontSize;
            nodeEl.style.width = 'fit-content';
            textWidth = nodeEl.scrollWidth;
            nodeEl.style.width = originalWidth;
        } else {
            div.style("font-size", `${DEFAULT_FONT_SIZE}px`);
            nodeEl.style.width = 'fit-content';
            textWidth = nodeEl.scrollWidth;
            nodeEl.style.width = originalWidth;
        }
        const newWidth = Math.max(100, textWidth + PADDING);
        selection.select("foreignObject")
            .attr("width", newWidth)
            .attr("x", -newWidth / 2);
        switch (this.type) {
            case "entity":
                this.adjustEntitySize(selection, newWidth);
                break;
            case "attribute":
                this.adjustAttributeSize(selection, newWidth);
                break;
            case "relationship":
                this.adjustRelationshipSize(selection, newWidth);
                break;
        }
    }

    adjustEntitySize(selection, newWidth) {
        const minWidth = 120;
        const finalWidth = Math.max(minWidth, newWidth);
        selection.select("rect")
            .attr("width", finalWidth)
            .attr("x", -finalWidth / 2);
        this.width = finalWidth;
    }

    adjustAttributeSize(selection, newWidth) {
        const newRx = Math.max(50, newWidth / 2);
        selection.select("ellipse")
            .attr("rx", newRx);
        this.rx = newRx;
    }

    adjustRelationshipSize(selection, newWidth) {
        const finalWidth = Math.max(80, newWidth) * 1.4;
        const newHeight = 80;
        const points = `0,${-newHeight / 2} ${finalWidth / 2},0 0,${newHeight / 2} ${-finalWidth / 2},0`;
        selection.select("polygon")
            .attr("points", points);
        this.width = finalWidth;
        this.height = newHeight;
    }

    getBoundingBox() {
        switch (this.type) {
            case "entity":
                return {
                    left: this.x - this.width / 2,
                    right: this.x + this.width / 2,
                    top: this.y - 30,
                    bottom: this.y + 30
                };
            case "relationship":
                return {
                    left: this.x - this.width / 2,
                    right: this.x + this.width / 2,
                    top: this.y - 40,
                    bottom: this.y + 40
                };
            case "attribute":
                return {
                    left: this.x - this.rx,
                    right: this.x + this.rx,
                    top: this.y - 25,
                    bottom: this.y + 25
                };
            default:
                return { left: this.x, right: this.x, top: this.y, bottom: this.y };
        }
    }

    collidesWith(other) {
        const a = this.getBoundingBox();
        const b = other.getBoundingBox();
        return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    }

    getCollidingNodes(nodes) {
        return nodes.filter(node => node !== this && this.collidesWith(node));
    }

    /**
     * Marks the node as selected and displays a light grey frame.
     */
    select() {
        if (this.selection.select('.node-selection-border').node()) return;
        if (this.type === "entity") {
            const gap = 4;
            this.selection.insert("rect", ":first-child")
                .attr("class", "node-selection-border")
                .attr("x", -this.width / 2 - gap)
                .attr("y", -30 - gap)
                .attr("rx", 12)
                .attr("width", this.width + gap * 2)
                .attr("height", 60 + gap * 2)
                .attr("stroke", "lightgray")
                .attr("stroke-width", 3)
                .attr("fill", "none");
        }
    }

    deselect() {
        this.selection.select('.node-selection-border').remove();
    }
}
