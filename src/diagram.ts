import { HistoryManager } from "./history_manager";
import * as d3 from "d3";
import { v4 as uuidv4 } from "uuid";
import example_config from "./diagram_exampleconfig.json";
import { JsonFileHandler } from "./filehandler";
import { ERNode } from "./ernode";
import { Contextmenu } from "./contextmenu";
import { ERDiagramImageRenderer, type DiagramLike } from "./renderer";
import { SelectModal } from "./modal";
import type { StateSnapshot, DiagramBBox, Anchor } from "./types";

// Unused, but kept to mirror the original app's icon preloading glob.
import.meta.glob("/icons/*.svg", { eager: true, query: "?url", import: "default" });

export interface ERLink extends d3.SimulationLinkDatum<ERNode> {
    cardinality?: string;
    // Never actually populated anywhere; kept for fidelity with the original code,
    // which checks for these before falling back to computeAnchor().
    sourceAnchor?: Anchor;
    targetAnchor?: Anchor;
    // True when every instance of the source entity must participate in this
    // relationship; rendered as a double line (total participation constraint).
    totalParticipation?: boolean;
    // True for one of the two links of a self-referencing (recursive) relationship.
    recursive?: boolean;
    // Which side of the entity the recursive link's loop bulges towards.
    recursiveSide?: 1 | -1;
}

type LegacyWheelEvent = WheelEvent & { wheelDelta?: number };

/**
 * By the time a link is read here, d3's forceLink has already resolved
 * string/number ids into node object references.
 */
export function asNode(endpoint: string | number | ERNode): ERNode {
    return endpoint as ERNode;
}

export function endpointId(endpoint: string | number | ERNode): string | number {
    return typeof endpoint === "object" ? endpoint.id : endpoint;
}

export class ERDiagram implements DiagramLike {
    width: number;
    height: number;
    svg: d3.Selection<SVGSVGElement, unknown, any, any>;
    historyManager: HistoryManager;
    contextmenuhandler: Contextmenu;
    onZoom: ((zoom: number) => void) | null;
    nodes: ERNode[];
    links: ERLink[];
    name!: string;

    gMain!: d3.Selection<SVGGElement, unknown, any, any>;
    gLinks!: d3.Selection<SVGGElement, unknown, any, any>;
    gNodes!: d3.Selection<SVGGElement, unknown, any, any>;
    zoom!: d3.ZoomBehavior<SVGSVGElement, unknown>;
    simulation!: d3.Simulation<ERNode, ERLink>;
    currentlyDraggedNode?: ERNode | null;

    // Sideways offset (px) between the two parallel strokes of a "double line"
    // used to mark a total participation constraint.
    private static readonly RAIL_GAP = 3;
    // How far a recursive (self-referencing) relationship's loop bulges away
    // from the straight line between the entity and the relationship node.
    private static readonly RECURSIVE_BULGE = 46;

    constructor(element: string, width: number, height: number) {
        this.width = width;
        this.height = height;
        this.svg = d3.select<SVGSVGElement, unknown>(element)
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
        this.setName('untitled');
    }

    setName(name: string): void {
        this.name = name;
        document.getElementById("projectname")!.innerText = name + ".json";
    }

    getName(): string {
        return this.name;
    }

    getRenderPreview(): Promise<string> {
        return new ERDiagramImageRenderer(this, this.name).exportImageUrl();
    }

    /**
     * Initialize the main SVG groups.
     */
    setDimensions(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.svg.attr('width', width)
            .attr('height', height);
        this.simulation.force("center", d3.forceCenter<ERNode>(width / 2, height / 2));
    }

    /**
     * Initialize the main SVG groups.
     */
    initializeSVG(): void {
        this.gMain = this.svg.append('g').attr('class', 'gMain');
        this.gLinks = this.gMain.append('g').attr('class', 'gLinks');
        this.gNodes = this.gMain.append('g').attr('class', 'gNodes');
    }

    /**
     * Initialize the zoom behavior.
     */
    initializeZoom(): void {
        this.zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 10])
            .on("start", (event) => {
                // Fix for mobile: touching the diagram should blur any active input/contenteditable
                if (document.activeElement && document.activeElement !== document.body) {
                    (document.activeElement as HTMLElement).blur();
                }

                if (event.sourceEvent && event.sourceEvent.type === "mousedown") {
                    this.svg.style("cursor", "grabbing");
                }
            })
            .on('zoom', (event) => {
                this.gMain.attr('transform', event.transform.toString());
                if (this.onZoom && typeof this.onZoom === 'function') {
                    this.contextmenuhandler.hide();
                    this.onZoom(event.transform.k);
                    this.onViewChanged();
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
    setZoom(percentage: number): void {
        const minLog = Math.log10(0.1); // -1
        const maxLog = Math.log10(10);  // 1
        const logValue = minLog + (percentage / 100) * (maxLog - minLog);
        const newScale = Math.pow(10, logValue); // New zoom level

        // Retrieve current transformation
        const currentTransform = d3.zoomTransform(this.svg.node()!);

        // Determine the size of the viewport (display area of the SVG)
        const bbox = this.svg.node()!.getBoundingClientRect();
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

    _zoomBy(factor: number): void {
        const svgEl = this.svg.node()!;
        const extent = this.zoom.scaleExtent();           // [min, max]

        const t0 = d3.zoomTransform(svgEl);         // aktueller Transform
        const currentK = t0.k;
        let targetK = currentK * factor;

        // Begrenzen auf erlaubten Bereich
        targetK = Math.max(extent[0], Math.min(extent[1], targetK));
        if (targetK === currentK) return;

        // Fester Mittelpunkt: das SVG-Zentrum
        const [cx, cy] = this.getViewportCenter();

        // Feste Dauer
        const duration = 300;

        // Unterbricht ggf. laufende Transition
        this.svg.interrupt();

        // Startet neue Zoom-Transition mit fester Dauer
        this.svg.transition()
            .duration(duration)
            .ease(d3.easeCubicOut)                    // sanftes Auslaufen
            .call(this.zoom.scaleTo, targetK, [cx, cy]);
    }

    increaseZoom(factor = 1.25): void {
        this._zoomBy(factor);
    }

    decreaseZoom(factor = 0.8): void {
        this._zoomBy(factor);
    }

    getViewportCenter(): [number, number] {
        // Versuche zuerst ein viewBox, falle sonst auf Bounding-Box zurück
        const svgEl = this.svg.node()!;
        if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width) {
            const vb = svgEl.viewBox.baseVal;
            return [vb.x + vb.width / 2, vb.y + vb.height / 2];
        } else {
            const { width, height } = svgEl.getBoundingClientRect();
            return [width / 2, height / 2];
        }
    }

    /**
     * Initialize the force simulation.
     */
    initializeSimulation(): void {
        this.simulation = d3.forceSimulation<ERNode, ERLink>()
            .force('link', d3.forceLink<ERNode, ERLink>()
                .id(d => d.id)
                .distance(150)
            )
            .force('charge', d3.forceManyBody<ERNode>().strength(-20))
            .force('collide', d3.forceCollide<ERNode>().radius(50))
            .force('center', d3.forceCenter<ERNode>(this.width / 2, this.height / 2))
            .on('tick', () => this.ticked());
    }

    /**
     * Loads a config object and converts nodes into ERNode instances.
     */
    loadConfig(config: StateSnapshot): void {
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

    uploadDocument(): void {
        JsonFileHandler.openJsonFile()
            .then(jsonData => {
                this.loadConfig(jsonData);
            })
            .catch(error => console.error("Error:", error));
    }

    getStateSnapshot(): StateSnapshot {
        return {
            "nodes": this.nodes.map(item => ({
                id: item.id,
                text: item.text,
                type: item.type,
                vx: item.vx,
                vy: item.vy,
                width: item.width,
                x: item.x as number,
                y: item.y as number,
                primary: item.primary
            })),
            "links": this.links.map(item => ({
                source: endpointId(item.source) as string,
                target: endpointId(item.target) as string,
                cardinality: item.cardinality,
                totalParticipation: item.totalParticipation,
                recursive: item.recursive,
                recursiveSide: item.recursiveSide
            }))
        };
    }

    downloadDocument(): void {
        JsonFileHandler.downloadJson(this.getStateSnapshot(), this.name + '.json');
    }

    renderImage(format: string, quality: number, scale: number, transparent: boolean): void {
        // Create an instance of the image renderer.
        const imageRenderer = new ERDiagramImageRenderer(this, this.name);
        // Delegate the export to the image renderer instance.
        imageRenderer.exportImage(format, quality, scale, transparent);
    }

    renderSVG(): void {
        const imageRenderer = new ERDiagramImageRenderer(this, this.name);
        // Delegate the export to the image renderer instance.
        imageRenderer.downloadStandaloneSVG()
    }

    /**
     * Load the default configuration from the example JSON.
     */
    loadDefaultConfig(): void {
        this.loadConfig(example_config as StateSnapshot);
    }

    /**
     * Update the diagram graph.
     */
    updateGraph(): void {
        this.simulation.nodes(this.nodes);
        this.simulation.force<d3.ForceLink<ERNode, ERLink>>('link')!.links(this.links);
        this.simulation.alpha(1).restart();

        this.updateLinks();
        this.updateLinkLabels();
        this.updateNodes();
    }

    /**
     * Unique data-join key for a link. Recursive relationships push two links
     * that share the same source/target pair (both roles attach to the same
     * entity), so the recursive side is folded into the key to keep them distinct.
     */
    linkKey(d: ERLink): string {
        const base = `${endpointId(d.source)}-${endpointId(d.target)}`;
        return d.recursive ? `${base}-${d.recursiveSide}` : base;
    }

    /**
     * Ensures a link "segment" group contains the right DOM shape: one or two
     * parallel visible strokes (single line, or a double line for a total
     * participation constraint), plus an invisible wide stroke used as a
     * generous click target for toggling that constraint.
     */
    private ensureLinkVisual(group: d3.Selection<any, any, any, any>, doubled: boolean, tag: "line" | "path"): void {
        // Presentation attributes are set explicitly (not just via CSS classes)
        // because both the raster and the standalone-SVG export serialize the
        // cloned markup without the page's stylesheet, so anything relying
        // purely on an external CSS rule would render invisible/wrong there.
        let hitarea = group.select<SVGGraphicsElement>(`${tag}.link-hitarea`);
        if (hitarea.empty()) {
            // Geometry-only click target: unpainted (stroke "none"), but still
            // hit-testable via pointer-events:stroke, which uses stroke-width
            // for its hit region regardless of paint.
            hitarea = group.append(tag as any)
                .attr('class', 'link-hitarea')
                .attr('fill', 'none')
                .attr('stroke', 'none')
                .attr('stroke-width', 14)
                .style('pointer-events', 'stroke')
                .style('cursor', 'pointer');
        }

        // One rail for a single line, two (offset left/right) for a double line.
        const offsets = doubled ? [-1, 1] : [0];
        const rails = group.selectAll<SVGGraphicsElement, number>(`${tag}.link-rail`)
            .data(offsets);
        rails.exit().remove();
        rails.enter().append(tag as any)
            .attr('class', 'link link-rail')
            .attr('fill', 'none')
            .attr('stroke', '#999')
            .attr('stroke-width', 2)
            .attr('stroke-linecap', 'round');

        // Keep the (unpainted) click target on top so it always catches the pointer.
        hitarea.raise();
    }

    updateLinks(): void {
        // Recursive links (self-referencing relationships) need a curved shape so
        // both roles stay visible; everything else keeps the existing straight lines.
        const recursiveLinks = this.links.filter(l => l.recursive);
        const nonCardinalityLinks = this.links.filter(l => !l.cardinality && !l.recursive);
        const cardinalityLinks = this.links.filter(l => l.cardinality && !l.recursive);

        const self = this;
        const toggleOnClick = function (event: Event, d: ERLink): void {
            event.stopPropagation();
            self.toggleTotalParticipation(d);
        };

        // --- Non-cardinality links (e.g. entity/relationship -> attribute) ---
        const nonCardLinkSelection = this.gLinks.selectAll<SVGGElement, ERLink>('.link-group.non-cardinality')
            .data(nonCardinalityLinks, d => this.linkKey(d));
        nonCardLinkSelection.exit().remove();
        const nonCardLinkGroups = nonCardLinkSelection.enter().append('g')
            .attr('class', 'link-group non-cardinality')
            .merge(nonCardLinkSelection);
        nonCardLinkGroups.each(function (d) {
            self.ensureLinkVisual(d3.select(this), !!d.totalParticipation, 'line');
        });
        nonCardLinkGroups.on('click', toggleOnClick);

        // --- Cardinality links: a group with two line segments (gap for the label) ---
        const cardLinkSelection = this.gLinks.selectAll<SVGGElement, ERLink>('.link-cardinality')
            .data(cardinalityLinks, d => this.linkKey(d));
        cardLinkSelection.exit().remove();
        const cardLinkEnter = cardLinkSelection.enter().append('g')
            .attr('class', 'link-cardinality');
        cardLinkEnter.append('g').attr('class', 'segment left');
        cardLinkEnter.append('g').attr('class', 'segment right');
        const cardLinkGroups = cardLinkEnter.merge(cardLinkSelection);
        cardLinkGroups.each(function (d) {
            const group = d3.select<SVGGElement, ERLink>(this);
            self.ensureLinkVisual(group.select('g.segment.left'), !!d.totalParticipation, 'line');
            self.ensureLinkVisual(group.select('g.segment.right'), !!d.totalParticipation, 'line');
        });
        cardLinkGroups.on('click', toggleOnClick);

        // --- Recursive links: a curved path looping back to the same entity ---
        const recursiveLinkSelection = this.gLinks.selectAll<SVGGElement, ERLink>('.link-recursive')
            .data(recursiveLinks, d => this.linkKey(d));
        recursiveLinkSelection.exit().remove();
        const recursiveLinkGroups = recursiveLinkSelection.enter().append('g')
            .attr('class', 'link-recursive')
            .merge(recursiveLinkSelection);
        recursiveLinkGroups.each(function (d) {
            self.ensureLinkVisual(d3.select(this), !!d.totalParticipation, 'path');
        });
        recursiveLinkGroups.on('click', toggleOnClick);
    }

    /**
     * Toggles the total participation constraint (rendered as a double line)
     * for the given link and repositions the diagram immediately.
     */
    toggleTotalParticipation(link: ERLink): void {
        this.historyManager.save(this.getStateSnapshot());
        link.totalParticipation = !link.totalParticipation;
        this.updateLinks();
        this.ticked();
    }

    /**
     * Where the cardinality label of a link should sit. For straight links this
     * is simply the midpoint between the two anchors; for recursive (looping)
     * links it follows the curve out to its bulge so it doesn't sit on the line.
     */
    computeLinkLabelPosition(d: ERLink): Anchor {
        if (d.sourceAnchor && d.targetAnchor) {
            return {
                x: (d.sourceAnchor.x + d.targetAnchor.x) / 2,
                y: (d.sourceAnchor.y + d.targetAnchor.y) / 2
            };
        }
        const anchorSource = this.computeAnchor(asNode(d.source), asNode(d.target), 7);
        const anchorTarget = this.computeAnchor(asNode(d.target), asNode(d.source), 7);
        if (d.recursive) {
            return this.computeRecursiveLabelPosition(anchorSource, anchorTarget, d.recursiveSide ?? 1);
        }
        return {
            x: (anchorSource.x + anchorTarget.x) / 2,
            y: (anchorSource.y + anchorTarget.y) / 2
        };
    }

    updateLinkLabels(): void {
        const linkLabelData = this.links.filter(l => l.cardinality);
        const linkTextSelection = this.gLinks.selectAll<SVGTextElement, ERLink>('.linkText')
            .data(linkLabelData, d => this.linkKey(d));

        linkTextSelection.exit().remove();

        const linkTextEnter = linkTextSelection.enter().append('text')
            .style('transform', 'translate(2px, 3px)')
            .attr('class', 'linkText')
            .attr('text-anchor', 'middle');

        const self = this;
        const linkText = linkTextEnter.merge(linkTextSelection)
            .text(d => d.cardinality ?? '')
            .style('transform', 'translate(0px,3px)')
            .attr('x', d => self.computeLinkLabelPosition(d).x)
            .attr('y', d => self.computeLinkLabelPosition(d).y);

        // Possible cardinalites
        const cardinalities = ['1', 'n', 'm'];

        linkText.on('wheel', function (event, d) {
            event.stopPropagation();
            let currentIndex = cardinalities.indexOf(this.textContent ?? '');
            if (currentIndex === -1) currentIndex = 0;

            const delta = (event as LegacyWheelEvent).wheelDelta || -event.detail;
            if (delta > 0) {
                currentIndex = (currentIndex - 1 + cardinalities.length) % cardinalities.length;
            } else {
                currentIndex = (currentIndex + 1) % cardinalities.length;
            }

            self.historyManager.save(self.getStateSnapshot());
            this.textContent = cardinalities[currentIndex];
            d.cardinality = cardinalities[currentIndex];
        });

        linkText.on('click', function (event, d) {
            event.stopPropagation();
            const dlg = new SelectModal({
                title: 'Change Cardinality',
                text: 'Select the new cardinality for the relation and hit confirm.',
                options: ['1', 'n', 'm'],
                defaultOption: d.cardinality
            });

            dlg.show().then(result => {
                if (result) {
                    self.historyManager.save(self.getStateSnapshot());
                    d.cardinality = result;
                    this.textContent = result;
                }
            });
        });


    }

    clear(): void {
        this.historyManager.clear();
        this.loadConfig({
            "nodes": [],
            "links": []
        });
    }

    addEntity(): void {
        const bbox = this.svg.node()!.getBoundingClientRect();
        const viewportCenterX = bbox.width / 2;
        const viewportCenterY = bbox.height / 2;
        const node = new ERNode({
            id: uuidv4(),
            type: 'entity',
            text: 'Entity'
        });
        this.addContextMenuListener(node);
        const currentTransform = d3.zoomTransform(this.svg.node()!);
        const newX = (viewportCenterX - currentTransform.x) / currentTransform.k;
        const newY = (viewportCenterY - currentTransform.y) / currentTransform.k;
        node.x = newX;
        node.y = newY;
        this.historyManager.save(this.getStateSnapshot());
        this.nodes.push(node);
        this.updateGraph();
    }

    updateNodes(): void {
        const nodeSelection = this.gNodes.selectAll<SVGGElement, ERNode>('.node')
            .data(this.nodes, d => d.id);

        nodeSelection.exit().remove();

        const nodeEnter = nodeSelection.enter().append('g')
            .attr('class', 'node')
            .call(d3.drag<SVGGElement, ERNode>()
                .filter(event => {
                    if (event.ctrlKey || event.button) return false;
                    // Don't intercept multi-touch gestures (e.g. pinch to zoom)
                    if (event.type === 'touchstart' && event.touches && event.touches.length > 1) return false;
                    const target = event.target;
                    const el = target?.nodeType === 3 ? target.parentNode : target;
                    if (el?.closest && el.closest('[contenteditable="true"]')) return false;
                    return true;
                })
                .on('start', (event, d) => this.dragstarted(event, d))
                .on('drag', (event, d) => this.dragged(event, d))
                .on('end', (event, d) => this.dragended(event, d))
            );

        // For every new node, render its shape.
        nodeEnter.each(function (d) {
            d.render(d3.select<SVGGElement, unknown>(this));
        });

        nodeSelection.each(function (d) {
            d.selection = d3.select<SVGGElement, unknown>(this);
        });

        // Merge existing nodes.
        this.gNodes.selectAll<SVGGElement, ERNode>('.node').merge(nodeEnter);

        this.nodes.forEach(n => {
            n.render(n.selection);
        });
    }

    dragstarted(event: d3.D3DragEvent<SVGGElement, ERNode, ERNode | d3.SubjectPosition>, d: ERNode): void {
        if (document.activeElement && document.activeElement !== document.body) {
            (document.activeElement as HTMLElement).blur();
        }

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

    dragged(event: d3.D3DragEvent<SVGGElement, ERNode, ERNode | d3.SubjectPosition>, d: ERNode): void {
        d.fx = event.x;
        d.fy = event.y;
        this.updateNodeSelection(d);
    }

    /**
     * Updates the selection for the given node 'd'.
     * It checks if 'd' collides with an entity and selects the nearest entity.
     * If no collision exists or the collision changes, the selection is updated.
     */
    updateNodeSelection(d: ERNode): void {
        if (d.type != "entity") return;
        // Determine all colliding nodes of type "entity"
        const collidingEntities = d.getCollidingNodes(this.nodes)
            .filter(node => node.type === "entity");

        let closest: ERNode | null = null;
        let minDist = Infinity;
        // Find the nearest entity
        collidingEntities.forEach(node => {
            const dist = Math.hypot((d.x as number) - (node.x as number), (d.y as number) - (node.y as number));
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
            (closest as ERNode).select();
            d._currentSelectedNode = closest;
        } else {
            // No collision partner: clear existing selection.
            if (d._currentSelectedNode) {
                d._currentSelectedNode.deselect();
                d._currentSelectedNode = null;
            }
        }
    }

    addContextMenuListener(node: ERNode): void {
        node.addRightClickListener((event) => {
            event.preventDefault();

            this.contextmenuhandler.setPosition((event as MouseEvent).pageX, (event as MouseEvent).pageY);
            this.contextmenuhandler.show(node);
        });
        node.addTouchMoveListener(() => {
            this.contextmenuhandler.hide();
        });
        node.addEditEndListener(() => {
            this.simulation.alphaTarget(0.3).restart();
        });
        node.addChangeListener(() => {
            this.historyManager.save(this.getStateSnapshot());
        });
    }

    resetView(): void {
        this.svg.transition().duration(750).call(this.zoom.transform, d3.zoomIdentity);
    }

    getDiagramBBox(): DiagramBBox {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.nodes.forEach(n => {
            let halfWidth = 0, halfHeight = 0;
            if (n.type === "entity") {
                halfWidth = (n.width || 120) / 2;
                halfHeight = 30;
            } else if (n.type === "attribute") {
                halfWidth = (n.rx || 50);
                halfHeight = 25;
            } else if (n.type === "relationship") {
                halfWidth = (n.width || 80) / 2;
                halfHeight = (n.height || 40) / 2;
            }
            minX = Math.min(minX, (n.x as number) - halfWidth);
            minY = Math.min(minY, (n.y as number) - halfHeight);
            maxX = Math.max(maxX, (n.x as number) + halfWidth);
            maxY = Math.max(maxY, (n.y as number) + halfHeight);
        });
        const padding = 20;
        return {
            minX: minX - padding,
            minY: minY - padding,
            width: (maxX - minX) + 2 * padding,
            height: (maxY - minY) + 2 * padding
        };
    }

    fitToContent(): void {
        if (this.nodes.length === 0) return;
        const bbox = this.getDiagramBBox();
        const svgRect = this.svg.node()!.getBoundingClientRect();

        const scaleX = svgRect.width / bbox.width;
        const scaleY = svgRect.height / bbox.height;
        const scale = Math.max(0.1, Math.min(scaleX, scaleY, 1)); // Maximum 1x scaling

        const translateX = (svgRect.width - bbox.width * scale) / 2 - bbox.minX * scale;
        const translateY = (svgRect.height - bbox.height * scale) / 2 - bbox.minY * scale;

        const transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);

        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, transform);
    }

    isContentVisible(): boolean {
        if (this.nodes.length === 0) return false;
        const bbox = this.getDiagramBBox();
        const transform = d3.zoomTransform(this.svg.node()!);

        // Transform the bounding box coordinates
        const x1 = transform.applyX(bbox.minX) + 20;
        const y1 = transform.applyY(bbox.minY) + 20;
        const x2 = transform.applyX(bbox.minX + bbox.width) - 20;
        const y2 = transform.applyY(bbox.minY + bbox.height) - 20;

        // Get SVG dimensions
        const svgWidth = +(this.svg.attr("width") ?? 0);
        const svgHeight = +(this.svg.attr("height") ?? 0);

        // Return true if any part of the box is within the viewable area
        return !(x2 < 0 || x1 > svgWidth || y2 < 0 || y1 > svgHeight);
    }


    /**
     * Finds a direction (unit vector) from `origin` that points into the most
     * open space among the other nodes, by scanning candidate directions on a
     * circle and picking the widest clear "cone". Used to place a new node
     * (attribute or recursive relationship) without immediately overlapping
     * its siblings.
     */
    findFreeDirectionFrom(origin: ERNode): { dirX: number; dirY: number } {
        // ── Constants ───────────────────────────────────────────────
        const ANGLE_STEP = 5 * (Math.PI / 180);     // 5°
        const WINDOW_RADIUS = 6;                      // ±6 steps
        const TOTAL_STEPS = Math.round(2 * Math.PI / ANGLE_STEP);
        const MIN_CLEAR = 5;                      // extra clearance per node
        const INF = Number.POSITIVE_INFINITY;
        const CLIP = TOTAL_STEPS * 1e3;      // finite “infinite” for sums

        // ── 1) Precompute unit‐vectors (ux, uy) ───────────────────
        const ux = new Float64Array(TOTAL_STEPS);
        const uy = new Float64Array(TOTAL_STEPS);
        for (let i = 0; i < TOTAL_STEPS; i++) {
            const θ = i * ANGLE_STEP;
            ux[i] = Math.cos(θ);
            uy[i] = Math.sin(θ);
        }

        // ── 2) Gather “others” with relative vectors & radii ───────
        const others = this.nodes
            .filter(n => n.id !== origin.id)
            .map(n => {
                let r: number;
                switch (n.type) {
                    case 'entity': r = Math.hypot((n.width as number) / 2, 30); break;
                    case 'attribute': r = Math.max(n.rx as number, 25); break;
                    case 'relationship': r = Math.hypot((n.width as number) / 2, (n.height as number) / 2); break;
                    default: r = 50;
                }
                return {
                    dx: (n.x as number) - (origin.x as number),
                    dy: (n.y as number) - (origin.y as number),
                    clearance: r + MIN_CLEAR
                };
            });

        // ── 3) Compute freeDist[i] for each direction ───────────────
        const freeDist = new Float64Array(TOTAL_STEPS);
        for (let i = 0; i < TOTAL_STEPS; i++) {
            let minBlock = INF;
            const cx = ux[i], cy = uy[i];

            for (const { dx, dy, clearance } of others) {
                const proj = dx * cx + dy * cy;
                if (proj <= 0) continue;                        // behind us

                const perp = Math.abs(-cy * dx + cx * dy);
                if (perp < clearance) {
                    const entry = proj - clearance;
                    if (entry < minBlock) minBlock = entry;
                }
            }
            freeDist[i] = minBlock;
        }

        // ── 4) Find best “cone” via prefix‐sum sliding window ────────
        // Clip infinities to a big finite value for numeric sums
        const clipped = freeDist.map(d => d === INF ? CLIP : d);
        const ps = new Float64Array(2 * TOTAL_STEPS + 1);
        for (let i = 0; i < 2 * TOTAL_STEPS; i++) {
            ps[i + 1] = ps[i] + clipped[i % TOTAL_STEPS];
        }

        let bestSum = -INF, bestCenter = 0;
        const W = WINDOW_RADIUS;
        for (let center = 0; center < TOTAL_STEPS; center++) {
            const start = center - W + TOTAL_STEPS;
            const end = center + W + TOTAL_STEPS;
            const sum = ps[end + 1] - ps[start];
            if (sum > bestSum) {
                bestSum = sum;
                bestCenter = center;
            }
        }

        const θbest = bestCenter * ANGLE_STEP;
        return { dirX: Math.cos(θbest), dirY: Math.sin(θbest) };
    }

    addAttributeNode(): void {
        this.historyManager.save(this.getStateSnapshot());

        const parent = this.contextmenuhandler.getContextNode();
        if (!parent || !['entity', 'relationship'].includes(parent.type)) return;

        const { dirX, dirY } = this.findFreeDirectionFrom(parent);

        const newId = uuidv4();
        const newAttr = new ERNode({ id: newId, type: 'attribute', text: 'Attribute' });

        // initial tiny nudge
        newAttr.x = (parent.x as number) + dirX * 1;
        newAttr.y = (parent.y as number) + dirY * 1;

        // get true link‐length
        const tempLink: ERLink = { source: parent, target: newAttr };
        const offset = this.calculateDistance(tempLink);

        // final placement
        newAttr.x = (parent.x as number) + dirX * offset;
        newAttr.y = (parent.y as number) + dirY * offset;

        // ── Insert and update ─────────────────────────────────────
        this.nodes.push(newAttr);
        this.addContextMenuListener(newAttr);
        this.links.push({ source: parent.id, target: newId });
        this.updateGraph();
        newAttr.enableEditing();
    }

    /**
     * Adds a recursive (self-referencing) relationship: a relationship node
     * connected to the same entity twice, once per role (e.g. "manages" /
     * "is managed by"). The two links are rendered as curved loops bulging to
     * opposite sides so both stay visible even though they share both endpoints.
     */
    createRecursiveRelation(): void {
        const entity = this.contextmenuhandler.getContextNode();
        if (!entity || entity.type !== 'entity') return;

        this.historyManager.save(this.getStateSnapshot());

        const { dirX, dirY } = this.findFreeDirectionFrom(entity);
        const placementDistance = 140;

        const relationNode = new ERNode({
            id: uuidv4(),
            type: 'relationship',
            text: 'Relation'
        });
        this.addContextMenuListener(relationNode);
        relationNode.x = (entity.x as number) + dirX * placementDistance;
        relationNode.y = (entity.y as number) + dirY * placementDistance;

        this.nodes.push(relationNode);
        this.links.push({ source: entity, target: relationNode, cardinality: '1', recursive: true, recursiveSide: 1 });
        this.links.push({ source: entity, target: relationNode, cardinality: 'n', recursive: true, recursiveSide: -1 });

        this.updateGraph();
    }

    undo(): void {
        const prevState = this.historyManager.undo(this.getStateSnapshot());
        if (prevState) {
            this.loadConfig(prevState);
        }
    }

    redo(): void {
        const nextState = this.historyManager.redo(this.getStateSnapshot());
        if (nextState) {
            this.loadConfig(nextState);
        }
    }

    deleteNode(): void {
        this.historyManager.save(this.getStateSnapshot());
        const contextNode = this.contextmenuhandler.getContextNode();
        if (!contextNode) return;
        if (contextNode.type === "entity") {
            let removeSet = new Set<string | number>([contextNode.id]);

            // Recursively find dependent elements
            const findDependencies = (id: string | number): void => {
                this.links.forEach(l => {
                    const src = endpointId(l.source);
                    const tgt = endpointId(l.target);
                    if (src === id) {
                        const node = this.nodes.find(n => n.id === tgt);
                        if (node && (node.type === "attribute" || node.type === "relationship")) {
                            if (!removeSet.has(tgt)) {
                                removeSet.add(tgt);
                                if (node.type === "relationship") findDependencies(tgt);
                            }
                        }
                    }
                });
            };

            findDependencies(contextNode.id);
            removeSet.add(contextNode.id);
            this.links.forEach(l => {
                let src = endpointId(l.source);
                let tgt = endpointId(l.target);
                if (src === contextNode.id) {
                    let targetNode = this.nodes.find(n => n.id === tgt);
                    if (targetNode && (targetNode.type === "attribute" || targetNode.type === "relationship")) {
                        removeSet.add(tgt);
                    }
                }
                if (tgt === contextNode.id) {
                    let sourceNode = this.nodes.find(n => n.id === src);
                    if (sourceNode && sourceNode.type === "relationship") {
                        removeSet.add(src);
                    }
                }
            });
            this.nodes = this.nodes.filter(n => !removeSet.has(n.id));
            this.links = this.links.filter(l => {
                let src = endpointId(l.source);
                let tgt = endpointId(l.target);
                return !removeSet.has(src) && !removeSet.has(tgt);
            });
        } else {
            // For attributes or relationships: simple deletion
            this.nodes = this.nodes.filter(n => n.id !== contextNode.id);
            this.links = this.links.filter(l => {
                let src = endpointId(l.source);
                let tgt = endpointId(l.target);
                return src !== contextNode.id && tgt !== contextNode.id;
            });
        }
        this.updateGraph();
    }

    setPrimaryKey(): void {
        this.historyManager.save(this.getStateSnapshot());
        const attributeNode = this.contextmenuhandler.getContextNode();
        if (!attributeNode) return;
        // Find the parent entity
        const parentEntity = this.nodes.find(n =>
            this.links.some(l =>
                endpointId(l.source) === n.id &&
                endpointId(l.target) === attributeNode.id
            )
        );
        if (parentEntity) {
            // Reset primary key status for all attributes of the entity
            this.nodes.forEach(n => {
                if (n.type === "attribute" &&
                    this.links.some(l => endpointId(l.source) === parentEntity.id && endpointId(l.target) === n.id)) {
                    n.primary = n.id === attributeNode.id;
                }
            });
            this.nodes.forEach(n => {
                n.render(n.selection);
            });
        }
    }

    addContextMenuButtonListener(): void {
        document.getElementById("add-attribute-button")!.addEventListener('click', () => {
            this.contextmenuhandler.hide();
            this.addAttributeNode();
        });

        document.getElementById("add-recursive-relation-button")!.addEventListener('click', () => {
            this.contextmenuhandler.hide();
            this.createRecursiveRelation();
        });

        document.getElementById("delete-button")!.addEventListener('click', () => {
            this.contextmenuhandler.hide();
            this.deleteNode();
        });

        document.getElementById("set-primary-key")!.addEventListener('click', () => {
            this.contextmenuhandler.hide();
            this.setPrimaryKey();
        });
    }

    createRelation(node1: ERNode, node2: ERNode): void {
        this.historyManager.save(this.getStateSnapshot());
        // Create relation between node1 and node2 using a relation node with the default text 'Relation'
        // Use links to connect the nodes
        const relationNode = new ERNode({
            id: uuidv4(),
            type: 'relationship',
            text: 'Relation'
        });
        this.addContextMenuListener(relationNode);
        // Set the relation node's position to the midpoint between node1 and node2
        relationNode.x = ((node1.x as number) + (node2.x as number)) / 2;
        relationNode.y = ((node1.y as number) + (node2.y as number)) / 2;
        this.nodes.push(relationNode);
        // Create links connecting node1 -> relationNode and relationNode -> node2
        this.links.push({
            source: node1,
            target: relationNode,
            cardinality: '1'
        });
        this.links.push({
            source: relationNode,
            target: node2,
            cardinality: '1'
        });

        // Calculate push vector between the two entity nodes.
        const dx = (node2.x as number) - (node1.x as number);
        const dy = (node2.y as number) - (node1.y as number);
        const distance = Math.sqrt(dx * dx + dy * dy);
        const pushStrength = 50; // Change this value to adjust how far the nodes are pushed

        if (distance > 0) {
            // Normalize the direction and apply the push
            const offsetX = (dx / distance) * pushStrength;
            const offsetY = (dy / distance) * pushStrength;

            // Move node1 in the opposite direction of node2
            node1.x = (node1.x as number) - offsetX;
            node1.y = (node1.y as number) - offsetY;

            // Move node2 in its own direction away from node1
            node2.x = (node2.x as number) + offsetX;
            node2.y = (node2.y as number) + offsetY;
        }

        // this.simulation.force('charge', d3.forceManyBody().strength(-900));
        this.updateGraph();
        // setTimeout(() => {
        //     this.simulation.force('charge', d3.forceManyBody().strength(-20));
        // }, 100);
    }

    dragended(event: d3.D3DragEvent<SVGGElement, ERNode, ERNode | d3.SubjectPosition>, d: ERNode): void {
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

    calculateDistanceNodes(node1: { x?: number; y?: number }, node2: { x?: number; y?: number }): number {
        let dx = (node2.x as number) - (node1.x as number);
        let dy = (node2.y as number) - (node1.y as number);
        return Math.sqrt(dx * dx + dy * dy);
    }

    calculateDistance(link: ERLink): number {
        const anchor = this.computeAnchor(asNode(link.source), asNode(link.target), 7);
        const anchor2 = this.computeAnchor(asNode(link.target), asNode(link.source), 7);
        return this.calculateDistanceNodes(asNode(link.source), anchor) + this.calculateDistanceNodes(anchor2, asNode(link.target)) + 100;
    }

    computeAnchor(node: ERNode, other: ERNode, gap: number): Anchor {
        const dx = (other.x as number) - (node.x as number);
        const dy = (other.y as number) - (node.y as number);
        const angle = Math.atan2(dy, dx);
        const unitX = Math.cos(angle);
        const unitY = Math.sin(angle);
        let t = 0;

        switch (node.type) {
            case "entity": {
                // Rectangle (Width set, height assumed 60)
                const halfWidth = (node.width as number) / 2;
                const halfHeight = 30;
                t = Math.min(halfWidth / Math.abs(unitX || 1), halfHeight / Math.abs(unitY || 1));
                break;
            }
            case "attribute": {
                // Ellipse (rx given, ry assumed 25)
                const rx = node.rx as number;
                const ry = 25;
                t = 1 / Math.sqrt((unitX ** 2) / (rx ** 2) + (unitY ** 2) / (ry ** 2));
                break;
            }
            case "relationship": {
                // Diamond (Polygon: width and height set)
                const halfWidth = (node.width as number) / 2;
                const halfHeight = (node.height as number) / 2;
                t = 1 / ((Math.abs(unitX) / halfWidth) + (Math.abs(unitY) / halfHeight));
                break;
            }
            default:
                // Fallback (e.g., Circle with radius 50)
                t = 50;
        }

        // Compute anchor point
        return {
            x: (node.x as number) + (t + gap) * unitX,
            y: (node.y as number) + (t + gap) * unitY
        };
    }

    /**
     * Positions the (1 or 2) straight "rail" line(s) and the hit-area line of a
     * link segment between two points, offsetting doubled rails sideways.
     */
    positionLinkSegment(group: d3.Selection<any, any, any, any>, p1: Anchor, p2: Anchor): void {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;

        group.selectAll<SVGLineElement, number>('line.link-rail')
            .attr('x1', off => p1.x + nx * off * ERDiagram.RAIL_GAP)
            .attr('y1', off => p1.y + ny * off * ERDiagram.RAIL_GAP)
            .attr('x2', off => p2.x + nx * off * ERDiagram.RAIL_GAP)
            .attr('y2', off => p2.y + ny * off * ERDiagram.RAIL_GAP);

        group.select<SVGLineElement>('line.link-hitarea')
            .attr('x1', p1.x).attr('y1', p1.y)
            .attr('x2', p2.x).attr('y2', p2.y);
    }

    /**
     * Places a recursive link's cardinality label just outside the apex of its
     * loop (the quadratic-bezier midpoint, pushed further out along the same
     * perpendicular), so the label doesn't sit directly on the stroked curve
     * and block clicks meant for toggling total participation.
     */
    private computeRecursiveLabelPosition(p1: Anchor, p2: Anchor, side: 1 | -1): Anchor {
        const control = this.recursiveControlPoint(p1, p2, side, 0);
        const apex = {
            x: 0.25 * p1.x + 0.5 * control.x + 0.25 * p2.x,
            y: 0.25 * p1.y + 0.5 * control.y + 0.25 * p2.y
        };

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const LABEL_CLEARANCE = 12;

        return {
            x: apex.x + nx * side * LABEL_CLEARANCE,
            y: apex.y + ny * side * LABEL_CLEARANCE
        };
    }

    private recursiveControlPoint(p1: Anchor, p2: Anchor, side: 1 | -1, railOffset: number): Anchor {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        return {
            x: midX + nx * (side * ERDiagram.RECURSIVE_BULGE + railOffset),
            y: midY + ny * (side * ERDiagram.RECURSIVE_BULGE + railOffset)
        };
    }

    /**
     * Positions the (1 or 2) curved "rail" path(s) and the hit-area path of a
     * recursive link, looping from and back to the same entity.
     */
    positionRecursiveSegment(group: d3.Selection<any, any, any, any>, p1: Anchor, p2: Anchor, side: 1 | -1): void {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;

        const pathFor = (railOffset: number): string => {
            const sx = p1.x + nx * railOffset, sy = p1.y + ny * railOffset;
            const ex = p2.x + nx * railOffset, ey = p2.y + ny * railOffset;
            const control = this.recursiveControlPoint(p1, p2, side, railOffset);
            return `M ${sx} ${sy} Q ${control.x} ${control.y} ${ex} ${ey}`;
        };

        group.selectAll<SVGPathElement, number>('path.link-rail')
            .attr('d', off => pathFor(off * ERDiagram.RAIL_GAP));

        group.select<SVGPathElement>('path.link-hitarea')
            .attr('d', pathFor(0));
    }

    updateDistances(): void {
        this.simulation.force<d3.ForceLink<ERNode, ERLink>>("link")!.distance(link => this.calculateDistance(link));
    }

    onViewChanged(): void {
        const backToContentButton = document.getElementById("back-to-content")!;
        if (this.isContentVisible() || this.nodes.length === 0) {
            backToContentButton.style.display = 'none';
        } else {
            backToContentButton.style.display = 'block';
        }
    }

    /**
     * Update positions of nodes and links on each simulation tick.
     */
    ticked(): void {
        this.onViewChanged();
        if (this.currentlyDraggedNode) {
            this.updateNodeSelection(this.currentlyDraggedNode);
        }
        // Update non-cardinality links (e.g. entity/relationship -> attribute)
        this.gLinks.selectAll<SVGGElement, ERLink>('.link-group.non-cardinality').each((d, i, nodes) => {
            const group = d3.select<SVGGElement, ERLink>(nodes[i]);
            const sourceAnchor = this.computeAnchor(asNode(d.source), asNode(d.target), 7);
            const targetAnchor = this.computeAnchor(asNode(d.target), asNode(d.source), 7);
            this.positionLinkSegment(group, sourceAnchor, targetAnchor);
        });

        // Update cardinality links (two segments with a gap for the label)
        this.gLinks.selectAll<SVGGElement, ERLink>('.link-cardinality').each((d, i, nodes) => {
            const group = d3.select<SVGGElement, ERLink>(nodes[i]);
            const sourceAnchor = this.computeAnchor(asNode(d.source), asNode(d.target), 7);
            const targetAnchor = this.computeAnchor(asNode(d.target), asNode(d.source), 7);
            const midX = (sourceAnchor.x + targetAnchor.x) / 2;
            const midY = (sourceAnchor.y + targetAnchor.y) / 2;
            const dx = targetAnchor.x - sourceAnchor.x;
            const dy = targetAnchor.y - sourceAnchor.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / dist;
            const uy = dy / dist;
            const offset = 20; // fixed offset in pixels
            const leftX = midX - ux * (offset / 2);
            const leftY = midY - uy * (offset / 2);
            const rightX = midX + ux * (offset / 2);
            const rightY = midY + uy * (offset / 2);

            this.positionLinkSegment(group.select('g.segment.left'), sourceAnchor, { x: leftX, y: leftY });
            this.positionLinkSegment(group.select('g.segment.right'), { x: rightX, y: rightY }, targetAnchor);
        });

        // Update recursive links: two curved loops back to the same entity
        this.gLinks.selectAll<SVGGElement, ERLink>('.link-recursive').each((d, i, nodes) => {
            const group = d3.select<SVGGElement, ERLink>(nodes[i]);
            const sourceAnchor = this.computeAnchor(asNode(d.source), asNode(d.target), 7);
            const targetAnchor = this.computeAnchor(asNode(d.target), asNode(d.source), 7);
            this.positionRecursiveSegment(group, sourceAnchor, targetAnchor, d.recursiveSide ?? 1);
        });

        // Update link labels (the cardinality text remains centered on its link)
        this.gLinks.selectAll<SVGTextElement, ERLink>('.linkText')
            .attr('x', d => this.computeLinkLabelPosition(d).x)
            .attr('y', d => this.computeLinkLabelPosition(d).y);

        // Update node positions
        this.gNodes.selectAll<SVGGElement, ERNode>('.node')
            .attr('transform', d => `translate(${d.x},${d.y})`);

        this.updateDistances();
    }
}
