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
        selection.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .text(this.text);
    }

    renderRelationship(selection) {
        const w = 80, h = 40;
        const points = `0,${-h / 2} ${w / 2},0 0,${h / 2} ${-w / 2},0`;
        selection.append('polygon')
            .attr('points', points)
            .attr('fill', '#ccffcc');
        selection.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .text(this.text);
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
            .text(this.text);
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