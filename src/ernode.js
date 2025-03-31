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
        // Immediately after rendering, the size is adjusted based on the text content.
        this.adjustSize(selection);
    }

    renderEntity(selection) {
        // Render rectangle
        selection.append('rect')
            .attr('x', -60)
            .attr('y', -30)
            .attr('width', 120)
            .attr('height', 60)
            .attr('rx', 10)
            .attr('ry', 10)
            .attr('fill', '#ffcc00');
        selection.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .text(this.text)
            .style('font-size', '14px');
    }

    renderRelationship(selection) {
        const defaultW = 80, defaultH = 40;
        const points = `0,${-defaultH / 2} ${defaultW / 2},0 0,${defaultH / 2} ${-defaultW / 2},0`;
        selection.append('polygon')
            .attr('points', points)
            .attr('fill', '#ccffcc');
        selection.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .text(this.text)
            .style('font-size', '14px');
    }

    renderAttribute(selection) {
        selection.append('ellipse')
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('rx', 50)
            .attr('ry', 25)
            .attr('fill', '#66ccff');
        selection.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .text(this.text)
            .style('font-size', '14px');
    }

    /**
     * Adjusts the size of the node based on the text content.
     * This method ensures that the text remains legible by adjusting the font size and shape accordingly.
     * @param {d3.Selection} selection - The D3 selection of the node group.
     */
    adjustSize(selection) {
        const textElement = selection.select("text");
        if (textElement.empty()) return;

        // General configuration values
        const PADDING = 20;
        const MAX_WIDTH = 300;
        const DEFAULT_FONT_SIZE = 14;
        const MIN_FONT_SIZE = 10;

        // Determine current font size
        let currentFontSize = parseFloat(textElement.style("font-size")) || DEFAULT_FONT_SIZE;
        let textBBox = textElement.node().getBBox();

        // If the text is too wide, reduce the font size
        if (textBBox.width > MAX_WIDTH - PADDING) {
            let newFontSize = Math.max(MIN_FONT_SIZE, currentFontSize * (MAX_WIDTH - PADDING) / textBBox.width);
            textElement.style("font-size", `${newFontSize}px`);
            textBBox = textElement.node().getBBox(); // Recalculate bounding box after adjustment
        } else {
            // Restore standard font size if sufficient space is available
            textElement.style("font-size", `${DEFAULT_FONT_SIZE}px`);
            textBBox = textElement.node().getBBox();
        }

        // Adjust node shape based on type
        switch (this.type) {
            case "entity":
                this.adjustEntitySize(selection, textBBox, PADDING);
                break;
            case "attribute":
                this.adjustAttributeSize(selection, textBBox, PADDING);
                break;
            case "relationship":
                this.adjustRelationshipSize(selection, textBBox, PADDING);
                break;
        }
    }

    /**
     * Adjusts the size of an entity node.
     */
    adjustEntitySize(selection, textBBox, padding) {
        const newWidth = Math.max(120, textBBox.width + padding);
        selection.select("rect")
            .attr("width", newWidth)
            .attr("x", -newWidth / 2);
        this.width = newWidth;
    }

    /**
     * Adjusts the size of an attribute node (ellipse).
     */
    adjustAttributeSize(selection, textBBox, padding) {
        const newRadiusX = Math.max(50, textBBox.width / 2 + padding / 2);
        selection.select("ellipse")
            .attr("rx", newRadiusX);
        this.rx = newRadiusX;
    }

    /**
     * Adjusts the size of a relationship node (diamond).
     */
    adjustRelationshipSize(selection, textBBox, padding) {
        const newWidth = Math.max(80, textBBox.width + padding) * 1.4;
        const newHeight = 80;
        const points = `0,${-newHeight / 2} ${newWidth / 2},0 0,${newHeight / 2} ${-newWidth / 2},0`;

        selection.select("polygon")
            .attr("points", points);

        this.width = newWidth;
        this.height = newHeight;
    }

    handleClick(event) {
        console.log("Node clicked:", this);
        // Add your custom click handling logic here.
    }

    handleDoubleClick(event) {
        event.stopPropagation();
        console.log("Node double-clicked:", this);
        // Add your custom double-click handling logic here.
    }

    handleRightClick(event) {
        event.preventDefault(); // Prevent the default context menu.
        console.log("Node right-clicked:", this);
        // Add your custom right-click handling logic here.
    }
}
