import { HistoryManager } from './history_manager';
import * as d3 from 'd3';
import d3SvgToPng from 'd3-svg-to-png';
import { v4 as uuidv4 } from 'uuid';
import example_config from './diagram_exampleconfig.json';
import { JsonFileHandler } from './filehandler';
import { ERNode } from './ernode';
import { Contextmenu } from "./contextmenu";

const icons = import.meta.glob('/icons/*.svg', { eager: true, query: '?url', import: 'default' });

export class ERDiagram {
    constructor(element, width, height) {
        this.width = width;
        this.height = height;
        this.svg = d3.select(element)
            .attr('width', width)
            .attr('height', height);
        this.historyManager = new HistoryManager();
        this.contextmenuhandler = new Contextmenu();
        this.onZoom = null
        this.nodes = [];
        this.links = [];
        this.initializeSVG();
        this.initializeZoom();
        this.initializeSimulation();
        this.loadDefaultConfig();
        this.addContextMenuButtonListener();
    }

    /**
     * Initialize the main SVG groups.
     */
    setDimensions(width, height) {
        this.svg.attr('width', width)
            .attr('height', height);
    }

    /**
     * Initialize the main SVG groups.
     */
    initializeSVG() {
        this.gMain = this.svg.append('g').attr('class', 'gMain');
        this.gLinks = this.gMain.append('g').attr('class', 'gLinks');
        this.gNodes = this.gMain.append('g').attr('class', 'gNodes');
    }

    /**
     * Initialize the zoom behavior.
     */
    initializeZoom() {
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on("start", (event) => {
                if (event.sourceEvent && event.sourceEvent.type === "mousedown") {
                    this.svg.style("cursor", "grabbing");
                }
            })
            .on('zoom', (event) => {
                this.gMain.attr('transform', event.transform);
                if (this.onZoom && typeof this.onZoom === 'function') {
                    this.onZoom(event.transform.k);
                }
            })
            .on("end", () => {
                this.svg.style("cursor", "grab");
            });
        this.svg.call(this.zoom);
    }

    /**
     * Set the zoom percentage (0 - 100)
     */
    setZoom(percentage) {
        const minLog = Math.log10(0.1); // -1
        const maxLog = Math.log10(10);  // 1
        const logValue = minLog + (percentage / 100) * (maxLog - minLog);
        const newScale = Math.pow(10, logValue); // New zoom level

        // Retrieve current transformation
        const currentTransform = d3.zoomTransform(this.svg.node());

        // Determine the size of the viewport (display area of the SVG)
        const bbox = this.svg.node().getBoundingClientRect();
        const viewportCenterX = bbox.width / 2;
        const viewportCenterY = bbox.height / 2;

        // Calculate new translation to keep the current centre
        const newX = (viewportCenterX - currentTransform.x) / currentTransform.k * newScale;
        const newY = (viewportCenterY - currentTransform.y) / currentTransform.k * newScale;

        // Create the new transformation matrix
        const newTransform = d3.zoomIdentity
            .translate(viewportCenterX - newX, viewportCenterY - newY)
            .scale(newScale);

        this.svg.call(this.zoom.transform, newTransform);
    }

    /**
     * Initialize the force simulation.
     */
    initializeSimulation() {
        this.simulation = d3.forceSimulation()
            .force('link', d3.forceLink()
                .id(d => d.id)
                .distance(150)
            )
            .force('charge', d3.forceManyBody().strength(-20))
            .force('collide', d3.forceCollide().radius(50))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .on('tick', () => this.ticked());
    }

    /**
     * Loads a config object and converts nodes into ERNode instances.
     * @param {Object} config - The configuration object containing nodes and links.
     */
    loadConfig(config) {
        this.nodes = config.nodes.map(n => {
            // Each node receives a callback that is called when the text is changed.
            const node = new ERNode(n, this.width, this.height);
            this.addContextMenuListener(node);
            return node;
        });
        // Links remain unchanged so that d3.forceLink can resolve the IDs.
        this.links = config.links.map(l => ({ ...l }));
        this.updateGraph();
    }

    uploadDocument() {
        JsonFileHandler.openJsonFile()
            .then(jsonData => {
                this.loadConfig(jsonData);
            })
            .catch(error => console.error("Error:", error));
    }

    downloadDocument() {
        JsonFileHandler.downloadJson({
            "nodes": this.nodes.map(item => ({
                id: item.id,
                text: item.text,
                type: item.type,
                vx: item.vx,
                vy: item.vy,
                width: item.width,
                x: item.x,
                y: item.y
            })),
            "links": this.links.map(item => ({
                source: item.source.id,
                target: item.target.id,
                cardinality: item.cardinality
            }))
        }, 'er_diagram.json');
    }

    /**
     * Load the default configuration from the example JSON.
     */
    loadDefaultConfig() {
        this.loadConfig(example_config);
    }

    /**
     * Update the diagram graph.
     */
    updateGraph() {
        this.simulation.nodes(this.nodes);
        this.simulation.force('link').links(this.links);
        this.simulation.alpha(1).restart();

        this.updateLinks();
        this.updateLinkLabels();
        this.updateNodes();
    }

    updateLinks() {
        // Separate links with cardinality from the rest.
        const nonCardinalityLinks = this.links.filter(l => !l.cardinality);
        const cardinalityLinks = this.links.filter(l => l.cardinality);

        // --- Non-cardinality links: use a single line element ---
        const nonCardLinkSelection = this.gLinks.selectAll('.link.non-cardinality')
            .data(nonCardinalityLinks, d => `${d.source.id || d.source}-${d.target.id || d.target}`);
        nonCardLinkSelection.exit().remove();
        nonCardLinkSelection.enter().append('line')
            .attr('class', 'link non-cardinality')
            .attr('stroke', 'black')
            .attr('stroke-width', 2)
            .merge(nonCardLinkSelection);

        // --- Cardinality links: use a group with two line segments ---
        const cardLinkSelection = this.gLinks.selectAll('.link-cardinality')
            .data(cardinalityLinks, d => `${d.source.id || d.source}-${d.target.id || d.target}`);
        cardLinkSelection.exit().remove();
        const cardLinkEnter = cardLinkSelection.enter().append('g')
            .attr('class', 'link-cardinality');
        // Append two line segments if they don't exist.
        cardLinkEnter.append('line')
            .attr('class', 'link left')
            .attr('stroke', 'black')
            .attr('stroke-width', 2);
        cardLinkEnter.append('line')
            .attr('class', 'link right')
            .attr('stroke', 'black')
            .attr('stroke-width', 2);
        cardLinkSelection.merge(cardLinkEnter);
    }

    updateLinkLabels() {
        const linkLabelData = this.links.filter(l => l.cardinality);
        const linkTextSelection = this.gLinks.selectAll('.linkText')
            .data(linkLabelData, d => `${d.source.id || d.source}-${d.target.id || d.target}`);

        linkTextSelection.exit().remove();

        const linkTextEnter = linkTextSelection.enter().append('text')
            .style('transform', 'translate(2px, 3px)')
            .attr('class', 'linkText')
            .attr('text-anchor', 'middle');

        const linkText = linkTextEnter.merge(linkTextSelection)
            .text(d => d.cardinality)
            .style('transform', 'translate(0px,3px)')
            .attr('x', d => {
                if (d.sourceAnchor && d.targetAnchor) {
                    return (d.sourceAnchor.x + d.targetAnchor.x) / 2;
                }
                const anchorSource = this.computeAnchor(d.source, d.target, 7);
                const anchorTarget = this.computeAnchor(d.target, d.source, 7);
                return (anchorSource.x + anchorTarget.x) / 2;
            })
            .attr('y', d => {
                if (d.sourceAnchor && d.targetAnchor) {
                    return (d.sourceAnchor.y + d.targetAnchor.y) / 2;
                }
                const anchorSource = this.computeAnchor(d.source, d.target, 7);
                const anchorTarget = this.computeAnchor(d.target, d.source, 7);
                return (anchorSource.y + anchorTarget.y) / 2;
            });
    }

    clear() {
        this.loadConfig({
            "nodes": [],
            "links": []
        });
    }

    addEntity() {
        const bbox = this.svg.node().getBoundingClientRect();
        const viewportCenterX = bbox.width / 2;
        const viewportCenterY = bbox.height / 2;
        const node = new ERNode({
            id: uuidv4(),
            type: 'entity',
            text: 'Entity'
        });
        this.addContextMenuListener(node);
        const currentTransform = d3.zoomTransform(this.svg.node());
        const newX = (viewportCenterX - currentTransform.x) / currentTransform.k;
        const newY = (viewportCenterY - currentTransform.y) / currentTransform.k;
        node.x = newX;
        node.y = newY;
        this.nodes.push(node)
        this.updateGraph();
    }

    updateNodes() {
        const nodeSelection = this.gNodes.selectAll('.node')
            .data(this.nodes, d => d.id);

        nodeSelection.exit().remove();

        const nodeEnter = nodeSelection.enter().append('g')
            .attr('class', 'node')
            .call(d3.drag()
                .on('start', (event, d) => this.dragstarted(event, d))
                .on('drag', (event, d) => this.dragged(event, d))
                .on('end', (event, d) => this.dragended(event, d))
            );

        // For every new node, render its shape.
        nodeEnter.each(function (d) {
            d.render(d3.select(this));
        });

        nodeSelection.each(function (d) {
            d.selection = d3.select(this);
        });

        // Merge existing nodes.
        this.gNodes.selectAll('.node').merge(nodeEnter);
    }

    dragstarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        // Store the currently dragged node.
        this.currentlyDraggedNode = d;
        // If a selection already exists, deselect it:
        if (d._currentSelectedNode) {
            d._currentSelectedNode.deselect();
            d._currentSelectedNode = null;
        }
    }

    dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
        this.updateNodeSelection(d);
    }

    /**
     * Updates the selection for the given node 'd'.
     * It checks if 'd' collides with an entity and selects the nearest entity.
     * If no collision exists or the collision changes, the selection is updated.
     *
     * @param {ERNode} d - The currently moved node.
     */
    updateNodeSelection(d) {
        if (d.type != "entity") return;
        // Determine all colliding nodes of type "entity"
        const collidingEntities = d.getCollidingNodes(this.nodes)
            .filter(node => node.type === "entity");

        let closest = null;
        let minDist = Infinity;
        // Find the nearest entity
        collidingEntities.forEach(node => {
            const dist = Math.hypot(d.x - node.x, d.y - node.y);
            if (dist < minDist) {
                minDist = dist;
                closest = node;
            }
        });

        if (closest) {
            // If a different entity was already selected, deselect it.
            if (d._currentSelectedNode && d._currentSelectedNode !== closest) {
                d._currentSelectedNode.deselect();
            }
            // Select the determined entity.
            closest.select();
            d._currentSelectedNode = closest;
        } else {
            // No collision partner: clear existing selection.
            if (d._currentSelectedNode) {
                d._currentSelectedNode.deselect();
                d._currentSelectedNode = null;
            }
        }
    }

    addContextMenuListener(node) {
        node.addRightClickListener((event) => {
            event.preventDefault();

            this.contextmenuhandler.setPosition(event.pageX, event.pageY);
            this.contextmenuhandler.show(node);

            console.log("Rechtsklick auf ERNode ausgelöst!", event);
        });
    }

    addAttributeNode() {
        if(this.contextmenuhandler.getContextNode().type != 'entity' && this.contextmenuhandler.getContextNode().type != 'relationship') {
            return;
        }

        const newId = uuidv4();

        const newAttr = new ERNode({
            id: newId,
            type: 'attribute',
            text: 'Attribute'
        });

        this.nodes.push(newAttr);

        this.links.push({
            source: this.contextmenuhandler.getContextNode().id,
            target: newId
        });

        this.updateGraph();
        newAttr.enableEditing();
    }

    addContextMenuButtonListener() {
        document.getElementById("add-attribute-button").addEventListener('click', () => {
            this.addAttributeNode();
        });
    }

    createRelation(node1, node2) {
        // Create relation between node1 and node2 using a relation node with the default text 'Relation'
        // Use links to connect the nodes
        const relationNode = new ERNode({
            id: uuidv4(),
            type: 'relationship',
            text: 'Relation'
        });
        this.addContextMenuListener(relationNode);
        // Set the relation node's position to the midpoint between node1 and node2
        relationNode.x = (node1.x + node2.x) / 2;
        relationNode.y = (node1.y + node2.y) / 2;
        this.nodes.push(relationNode);
        // Create links connecting node1 -> relationNode and relationNode -> node2
        this.links.push({
            source: node1,
            target: relationNode,
            cardinality: '_'
        });
        this.links.push({
            source: relationNode,
            target: node2,
            cardinality: '_'
        });

        // Calculate push vector between the two entity nodes.
        const dx = node2.x - node1.x;
        const dy = node2.y - node1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const pushStrength = 50; // Change this value to adjust how far the nodes are pushed

        if (distance > 0) {
            // Normalize the direction and apply the push
            const offsetX = (dx / distance) * pushStrength;
            const offsetY = (dy / distance) * pushStrength;

            // Move node1 in the opposite direction of node2
            node1.x -= offsetX;
            node1.y -= offsetY;

            // Move node2 in its own direction away from node1
            node2.x += offsetX;
            node2.y += offsetY;
        }

        // this.simulation.force('charge', d3.forceManyBody().strength(-900));
        this.updateGraph();
        // setTimeout(() => {
        //     this.simulation.force('charge', d3.forceManyBody().strength(-20));
        // }, 100);
    }

    dragended(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
        // Clear the selection when dragging ends.
        if (d._currentSelectedNode) {
            // Create relation between the 2 nodes
            this.createRelation(d, d._currentSelectedNode);
        }
        if (d._currentSelectedNode) {
            d._currentSelectedNode.deselect();
            d._currentSelectedNode = null;
        }
        this.currentlyDraggedNode = null;
    }

    calculateDistanceNodes(node1, node2) {
        let dx = node2.x - node1.x;
        let dy = node2.y - node1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    calculateDistance(node) {
        const anchor = this.computeAnchor(node.source, node.target, 7);
        const anchor2 = this.computeAnchor(node.target, node.source, 7);
        return this.calculateDistanceNodes(node.source, anchor) + this.calculateDistanceNodes(anchor2, node.target) + 100;
    }

    computeAnchor(node, other, gap) {
        const dx = other.x - node.x;
        const dy = other.y - node.y;
        const angle = Math.atan2(dy, dx);
        const unitX = Math.cos(angle);
        const unitY = Math.sin(angle);
        let t = 0;

        switch (node.type) {
            case "entity": {
                // Rectangle (Width set, height assumed 60)
                const halfWidth = node.width / 2;
                const halfHeight = 30;
                t = Math.min(halfWidth / Math.abs(unitX || 1), halfHeight / Math.abs(unitY || 1));
                break;
            }
            case "attribute": {
                // Ellipse (rx given, ry assumed 25)
                const rx = node.rx;
                const ry = 25;
                t = 1 / Math.sqrt((unitX ** 2) / (rx ** 2) + (unitY ** 2) / (ry ** 2));
                break;
            }
            case "relationship": {
                // Diamond (Polygon: width and height set)
                const halfWidth = node.width / 2;
                const halfHeight = node.height / 2;
                t = 1 / ((Math.abs(unitX) / halfWidth) + (Math.abs(unitY) / halfHeight));
                break;
            }
            default:
                // Fallback (e.g., Circle with radius 50)
                t = 50;
        }

        // Compute anchor point
        return {
            x: node.x + (t + gap) * unitX,
            y: node.y + (t + gap) * unitY
        };
    }

    updateDistances() {
        this.simulation.force("link").distance(d => this.calculateDistance(d));
    }

    /**
     * Update positions of nodes and links on each simulation tick.
     */
    ticked() {
        if (this.currentlyDraggedNode) {
            this.updateNodeSelection(this.currentlyDraggedNode);
        }
        // Update non-cardinality links (single line)
        this.gLinks.selectAll('.link.non-cardinality')
            .attr('x1', d => this.computeAnchor(d.source, d.target, 7).x)
            .attr('y1', d => this.computeAnchor(d.source, d.target, 7).y)
            .attr('x2', d => this.computeAnchor(d.target, d.source, 7).x)
            .attr('y2', d => this.computeAnchor(d.target, d.source, 7).y);

        // Update cardinality links (two segments with a gap)
        this.gLinks.selectAll('.link-cardinality').each((d, i, nodes) => {
            const group = d3.select(nodes[i]);
            const sourceAnchor = this.computeAnchor(d.source, d.target, 7);
            const targetAnchor = this.computeAnchor(d.target, d.source, 7);
            const midX = (sourceAnchor.x + targetAnchor.x) / 2;
            const midY = (sourceAnchor.y + targetAnchor.y) / 2;
            const dx = targetAnchor.x - sourceAnchor.x;
            const dy = targetAnchor.y - sourceAnchor.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const ux = dx / dist;
            const uy = dy / dist;
            const offset = 20; // fixed offset in pixels
            const leftX = midX - ux * (offset / 2);
            const leftY = midY - uy * (offset / 2);
            const rightX = midX + ux * (offset / 2);
            const rightY = midY + uy * (offset / 2);

            // Update first segment: from source to left gap
            group.select('line.left')
                .attr('x1', sourceAnchor.x)
                .attr('y1', sourceAnchor.y)
                .attr('x2', leftX)
                .attr('y2', leftY);

            // Update second segment: from right gap to target
            group.select('line.right')
                .attr('x1', rightX)
                .attr('y1', rightY)
                .attr('x2', targetAnchor.x)
                .attr('y2', targetAnchor.y);
        });

        // Update link labels (the cardinality text remains centered between anchors)
        this.gLinks.selectAll('.linkText')
            .attr('x', d => {
                const anchorSource = this.computeAnchor(d.source, d.target, 7);
                const anchorTarget = this.computeAnchor(d.target, d.source, 7);
                return (anchorSource.x + anchorTarget.x) / 2;
            })
            .attr('y', d => {
                const anchorSource = this.computeAnchor(d.source, d.target, 7);
                const anchorTarget = this.computeAnchor(d.target, d.source, 7);
                return (anchorSource.y + anchorTarget.y) / 2;
            });

        // Update node positions
        this.gNodes.selectAll('.node')
            .attr('transform', d => `translate(${d.x},${d.y})`);

        this.updateDistances();
    }
}
