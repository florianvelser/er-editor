/**
 * Custom class representing a node in the ER diagram.
 */
export class ERNode {
    constructor(config, diagramWidth, diagramHeight) {
        Object.assign(this, config);
        // Set initial positions if not provided.
        if (typeof this.x !== 'number') {
            this.x = Math.random() * diagramWidth;
        }
        if (typeof this.y !== 'number') {
            this.y = Math.random() * diagramHeight;
        }
        // Callback for updating text in the diagram config.
        this.onTextChange = config.onTextChange || null;
    }

    /**
     * Render the node into the given D3 selection.
     * @param {d3.Selection} selection - The D3 selection of the node group element.
     */
    render(selection) {
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
        // Adjust the node size based on text content.
        this.adjustSize(selection);
    }

    renderEntity(selection) {
        // Render rectangle for entity.
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
        // Set default dimensions based on node type.
        let defaultWidth = 120, defaultHeight = 60;
        if (this.type === 'relationship') {
            defaultWidth = 80;
            defaultHeight = 80;
        } else if (this.type === 'attribute') {
            defaultWidth = 100; // Adjust as needed.
            defaultHeight = 50; // Ellipse height: 2 * ry.
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
            .on('dblclick', (event) => this.enableEditing(event, div));
    }

    /**
     * Enables editing mode for the label div.
     * @param {Event} event - The double-click event.
     * @param {d3.Selection} div - The D3 selection of the div element.
     */
    enableEditing(event, div) {
        event.stopPropagation();
        // Store the original text.
        this._originalText = this.text;
        const node = div.node();
        node.setAttribute("contenteditable", "true");
        node.focus();
        // Select the entire text.
        const range = document.createRange();
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        // Disable borders/outlines during editing.
        div.style('outline', 'none')
           .style('border', 'none');
        // End editing on blur or Enter key.
        div.on('blur', () => this.disableEditing(div));
        div.on('keydown', (e) => {
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
        // If text is unchanged, do not trigger a size update.
        if (newText === this._originalText) return;
        this.text = newText;
        // Notify the parent diagram to update the config.
        if (this.onTextChange && typeof this.onTextChange === 'function') {
            this.onTextChange(this);
        }
        // Adjust the node size after text change.
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

        // Configuration values.
        const PADDING = 20;
        const MAX_WIDTH = 300;
        const DEFAULT_FONT_SIZE = 14;
        const MIN_FONT_SIZE = 10;

        // Determine current font size.
        let currentFontSize = parseFloat(div.style("font-size")) || DEFAULT_FONT_SIZE;
        const nodeEl = div.node();
        // Temporarily set width to 'fit-content' to get the natural text width.
        const originalWidth = nodeEl.style.width;
        nodeEl.style.width = 'fit-content';
        let textWidth = nodeEl.scrollWidth;
        // Restore the original width.
        nodeEl.style.width = originalWidth;

        // If the text is too wide, reduce the font size.
        if (textWidth > MAX_WIDTH - PADDING) {
            let newFontSize = Math.max(MIN_FONT_SIZE, currentFontSize * (MAX_WIDTH - PADDING) / textWidth);
            div.style("font-size", `${newFontSize}px`);
            currentFontSize = newFontSize;
            // Re-measure with the adjusted font size.
            nodeEl.style.width = 'fit-content';
            textWidth = nodeEl.scrollWidth;
            nodeEl.style.width = originalWidth;
        } else {
            // Restore the standard font size if sufficient space is available.
            div.style("font-size", `${DEFAULT_FONT_SIZE}px`);
            nodeEl.style.width = 'fit-content';
            textWidth = nodeEl.scrollWidth;
            nodeEl.style.width = originalWidth;
        }

        // Update the foreignObject width based on the natural text width plus padding.
        const newWidth = Math.max(100, textWidth + PADDING);
        selection.select("foreignObject")
            .attr("width", newWidth)
            .attr("x", -newWidth / 2);

        // Adjust the node shape based on type.
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

    /**
     * Adjusts the size of an entity node.
     */
    adjustEntitySize(selection, newWidth) {
        const minWidth = 120;
        const finalWidth = Math.max(minWidth, newWidth);
        selection.select("rect")
            .attr("width", finalWidth)
            .attr("x", -finalWidth / 2);
        this.width = finalWidth;
    }

    /**
     * Adjusts the size of an attribute node (ellipse).
     */
    adjustAttributeSize(selection, newWidth) {
        const newRx = Math.max(50, newWidth / 2);
        selection.select("ellipse")
            .attr("rx", newRx);
        this.rx = newRx;
    }

    /**
     * Adjusts the size of a relationship node (diamond).
     */
    adjustRelationshipSize(selection, newWidth) {
        const finalWidth = Math.max(80, newWidth) * 1.4;
        const newHeight = 80;
        const points = `0,${-newHeight / 2} ${finalWidth / 2},0 0,${newHeight / 2} ${-finalWidth / 2},0`;
        selection.select("polygon")
            .attr("points", points);
        this.width = finalWidth;
        this.height = newHeight;
    }
}
