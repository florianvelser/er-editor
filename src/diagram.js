import { HistoryManager } from './history_manager';
import * as d3 from 'd3';
import d3SvgToPng from 'd3-svg-to-png';
import { v4 as uuidv4 } from 'uuid';
import example_config from './diagram_exampleconfig.json';
import { ERNode } from './ernode'

const icons = import.meta.glob('/icons/*.svg', { eager: true, query: '?url', import: 'default' });

export class ERDiagram {
    constructor(element, width, height) {
        this.width = width;
        this.height = height;
        this.svg = d3.select(element)
            .attr('width', width)
            .attr('height', height);
        this.historyManager = new HistoryManager();
        this.nodes = [];
        this.links = [];
        this.initializeSVG();
        this.initializeZoom();
        this.loadDefaultConfig(); // loadDefaultConfig uses the example JSON.
        this.initializeSimulation();
        this.updateGraph();
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
            .on('zoom', (event) => {
                this.gMain.attr('transform', event.transform);
            });
        this.svg.call(this.zoom);
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
            .force('charge', d3.forceManyBody().strength(-200))
            .force('collide', d3.forceCollide().radius(50))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .on('tick', () => this.ticked());
    }

    /**
     * Loads a config object and converts nodes into ERNode instances.
     * @param {Object} config - The configuration object containing nodes and links.
     */
    loadConfig(config) {
        this.config = config;
        this.nodes = this.config.nodes.map(n => new ERNode(n, this.width, this.height));
        // Keep links as they are so that d3.forceLink can resolve node IDs.
        this.links = this.config.links.map(l => ({ ...l }));
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
        const linkData = this.links;
        const linkSelection = this.gLinks.selectAll('.link')
            .data(linkData, d => `${d.source.id || d.source}-${d.target.id || d.target}`);

        linkSelection.exit().remove();

        linkSelection.enter().append('line')
            .attr('class', 'link')
            .attr('stroke', 'black')
            .attr('stroke-width', 2)
            .merge(linkSelection);
    }

    updateLinkLabels() {
        const linkLabelData = this.links.filter(l => l.cardinality);
        const linkTextSelection = this.gLinks.selectAll('.linkText')
            .data(linkLabelData, d => `${d.source.id || d.source}-${d.target.id || d.target}`);

        linkTextSelection.exit().remove();

        linkTextSelection.enter().append('text')
            .attr('class', 'linkText')
            .attr('text-anchor', 'middle')
            .attr('dy', '-0.3em')
            .merge(linkTextSelection)
            .text(d => d.cardinality);
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
            )
            .on('click', (event, d) => d.handleClick && d.handleClick(event))
            .on('dblclick', (event, d) => d.handleDoubleClick && d.handleDoubleClick(event))
            .on('contextmenu', (event, d) => d.handleRightClick && d.handleRightClick(event));

        // For every new node, render its shape.
        nodeEnter.each(function (d) {
            d.render(d3.select(this));
        });

        // Merge existing nodes.
        this.gNodes.selectAll('.node').merge(nodeEnter);
    }

    dragstarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    dragended(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    /**
     * Update positions of nodes and links on each simulation tick.
     */
    ticked() {
        this.gLinks.selectAll('.link')
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        this.gLinks.selectAll('.linkText')
            .attr('x', d => (d.source.x + d.target.x) / 2)
            .attr('y', d => (d.source.y + d.target.y) / 2);

        this.gNodes.selectAll('.node')
            .attr('transform', d => `translate(${d.x},${d.y})`);
    }
}
