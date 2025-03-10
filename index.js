import d3SvgToPng from 'd3-svg-to-png';
const icons = import.meta.glob('/icons/*.svg', { eager: true, query: '?url', import: 'default' });
/***************************************
 * History Manager for Undo/Redo functionality
 ***************************************/
class HistoryManager {
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

// Create a global history manager instance
const historyManager = new HistoryManager();

// Helper function to capture the current state (nodes and links)
function getStateSnapshot() {
    config.nodes = nodes.map(n => ({
        id: n.id,
        type: n.type,
        text: n.text,
        primary: n.primary,
        x: n.x,
        y: n.y
    }));
    config.links = links.map(l => ({
        source: typeof l.source === "object" ? l.source.id : l.source,
        target: typeof l.target === "object" ? l.target.id : l.target,
        cardinality: l.cardinality
    }));
    return config;
}

/***************************************
 * Dynamic SVG size (full window width & height minus button area)
 ***************************************/
const STROKE_WIDTH = 0;
const menu = d3.select("#context-menu");
var projectname = "er_diagram";
document.getElementById("projectname").innerHTML = projectname + ".json";
document.getElementById("zoom-level").value = 50;

function setProjectname(name) {
    projectname = name;
    document.getElementById("projectname").innerText = projectname + ".json";
}

const topOffset = 36;
const bottomOffset = 36;
let svg = d3.select("svg")
    .attr("width", window.innerWidth)
    .attr("height", document.documentElement.clientHeight - topOffset - bottomOffset);

// Create a main group for pan and zoom
const gMain = svg.append("g").attr("class", "gMain");
// Separate groups for links (background) and nodes
const gLinks = gMain.append("g").attr("class", "gLinks");
const gNodes = gMain.append("g").attr("class", "gNodes");

let width = +svg.attr("width"),
    height = +svg.attr("height");

window.addEventListener("resize", function () {
    svg.attr("width", window.innerWidth)
        .attr("height", document.documentElement.clientHeight - topOffset - bottomOffset);
    width = window.innerWidth;
    height = document.documentElement.clientHeight - topOffset - bottomOffset;
    simulation.force("center", d3.forceCenter(width / 2, height / 2));
    updateGraph();
});

/***************************************
 * Zoom and Pan functionality
 ***************************************/
function isContentFullyOutside() {
    if (config.nodes.length === 0) return false;
    const bbox = getDiagramBBox();
    const transform = d3.zoomTransform(svg.node());

    // Transform the bounding box coordinates
    const x1 = transform.applyX(bbox.minX) + 20;
    const y1 = transform.applyY(bbox.minY) + 20;
    const x2 = transform.applyX(bbox.minX + bbox.width) - 20;
    const y2 = transform.applyY(bbox.minY + bbox.height) - 20;

    // Get SVG dimensions
    const svgWidth = +svg.attr("width");
    const svgHeight = +svg.attr("height");

    // Check if the entire box is outside the SVG
    // - to the right of the viewing area: x1 > svgWidth
    // - left: x2 < 0
    // - bottom: y1 > svgHeight
    // - top: y2 < 0
    if (x2 < 0 || x1 > svgWidth || y2 < 0 || y1 > svgHeight) {
        return true;
    } else {
        return false;
    }
}

d3.select("#zoom-level").on("input", function () {
    const minLog = Math.log10(0.1); // -1
    const maxLog = Math.log10(10);  // 1
    const logValue = minLog + (this.value / 100) * (maxLog - minLog);
    const newScale = Math.pow(10, logValue); // Neue Zoomstufe

    // Retrieve current transformation
    const currentTransform = d3.zoomTransform(svg.node());

    // Determine the size of the viewport (display area of the SVG)
    const bbox = svg.node().getBoundingClientRect();
    const viewportCenterX = bbox.width / 2;
    const viewportCenterY = bbox.height / 2;

    // Calculate new translation to keep the current centre
    const newX = (viewportCenterX - currentTransform.x) / currentTransform.k * newScale;
    const newY = (viewportCenterY - currentTransform.y) / currentTransform.k * newScale;

    // Create the new transformation matrix
    const newTransform = d3.zoomIdentity
        .translate(viewportCenterX - newX, viewportCenterY - newY)
        .scale(newScale);

    svg.call(zoom.transform, newTransform);
});

function updateButtonFitToContent() {
    if (isContentFullyOutside()) {
        document.getElementById('back-to-content').style.display = 'block';
    } else {
        document.getElementById('back-to-content').style.display = 'none';
    }
}

const zoom = d3.zoom()
    .scaleExtent([0.1, 10])
    .on("start", (event) => {
        if (event.sourceEvent && event.sourceEvent.type === "mousedown") {
            svg.style("cursor", "grabbing");
        }
    })
    .on("zoom", (event) => {
        const minLog = Math.log10(0.1);
        const maxLog = Math.log10(10);
        document.getElementById('zoom-level').value = ((Math.log10(event.transform.k) - minLog) / (maxLog - minLog)) * 100;
        document.getElementById('zoom-text').innerText = Math.round(event.transform.k * 100) + "%";
        menu.style("display", "none");
        gMain.attr("transform", event.transform);
        updateButtonFitToContent();
    })
    .on("end", () => {
        svg.style("cursor", "grab");
    });

svg.call(zoom);



/***************************************
 * Initial configuration (JSON)
 ***************************************/
let config = {
    "nodes": [
        { "id": "Entity_1741374044081", "type": "entity", "text": "Entity" },
        { "id": "Entity_1741374049158", "type": "entity", "text": "Entity" },
        { "id": "Relation_1741374062200", "type": "relationship", "text": "Relation" },
        { "id": "Attribut_1741374067971", "type": "attribute", "text": "Attribute" },
        { "id": "Attribut_1741374073140", "type": "attribute", "text": "Attribute" },
        { "id": "Attribute_1741374083026", "type": "attribute", "text": "Attribute" },
        { "id": "Attribute_1741374090093", "type": "attribute", "text": "Attribute" }
    ],
    "links": [
        { "source": "Entity_1741374049158", "target": "Relation_1741374062200", "cardinality": "1" },
        { "source": "Relation_1741374062200", "target": "Entity_1741374044081", "cardinality": "n" },
        { "source": "Entity_1741374049158", "target": "Attribut_1741374067971" },
        { "source": "Entity_1741374049158", "target": "Attribut_1741374073140" },
        { "source": "Entity_1741374044081", "target": "Attribute_1741374083026" },
        { "source": "Entity_1741374044081", "target": "Attribute_1741374090093" }
    ]
};

let nodes = config.nodes.slice();
let links = config.links.slice();
let currentContextNode = null; // Node for context menu

/***************************************
 * Modal functionality
 ***************************************/
function truncateString(str) {
    if (str.length <= 10) {
        return str;
    } else {
        return str.substring(0, 10) + '...';
    }
}

function showModal(options, callback) {
    // Options: type ('text', 'select', or 'confirm'), title, defaultValue, options (for select: Array of {value, text}),
    // nodeType ('attribute', 'relationship', 'entity'), message (for confirm)

    // Select modal elements and clear previous content
    const modal = d3.select("#modal");
    const modalTitle = d3.select("#modal-title")
        .text(options.title || "")
        .style("margin-bottom", "16px");
    const content = d3.select("#modal-content");
    content.html("");

    let inputField; // Reference to the input element

    if (options.type === "text") {
        if (options.nodeType) {
            // Remove bottom margin of title when an SVG is displayed
            modalTitle.style("margin-bottom", "0");

            // Create an SVG container with fixed dimensions
            const svg = content.append("svg")
                .attr("width", 260)
                .attr("height", 130)
                .style("border", "none");

            let defaultLabel = "";
            // Draw a shape and set a default label based on nodeType
            switch (options.nodeType) {
                case "attribute":
                    svg.append("ellipse")
                        .attr("cx", 130)
                        .attr("cy", 65)
                        .attr("rx", 50)
                        .attr("ry", 25)
                        .attr("fill", "#66ccff")
                        .attr("stroke", "#333")
                        .attr("stroke-width", "0");
                    defaultLabel = "Attribute";
                    break;
                case "relationship":
                    svg.append("polygon")
                        .attr("points", "0,-40 56,0 0,40 -56,0")
                        .attr("fill", "#ccffcc")
                        .attr("stroke", "#333")
                        .attr("stroke-width", "0")
                        .attr("transform", "translate(130, 65)");
                    defaultLabel = "Relation";
                    break;
                case "entity":
                    svg.append("rect")
                        .attr("x", 70)
                        .attr("y", 35)
                        .attr("width", 120)
                        .attr("height", 60)
                        .attr("rx", 10)
                        .attr("ry", 10)
                        .attr("fill", "#ffcc00")
                        .attr("stroke", "#333")
                        .attr("stroke-width", "0");
                    defaultLabel = "Entity";
                    break;
                default:
                    break;
            }

            // Append text to the SVG; uses truncateString() if available
            const svgText = svg.append("text")
                .attr("x", 130)
                .attr("y", 65)
                .attr("text-anchor", "middle")
                .attr("dy", "0.35em")
                .style("font-size", "14px")
                .text(truncateString(options.defaultValue) || defaultLabel);

            // Create input field with a placeholder based on the nodeType
            inputField = content.append("input")
                .attr("type", "text")
                .attr("id", "modal-input")
                .attr("value", options.defaultValue || "")
                .attr("placeholder", defaultLabel);

            // Update the SVG text as the user types
            inputField.on("input", function () {
                const inputValue = this.value;
                svgText.text(truncateString(inputValue) || defaultLabel);
            });
        } else {
            // Create a simple input field if no nodeType is specified
            inputField = content.append("input")
                .attr("type", "text")
                .attr("id", "modal-input")
                .attr("value", options.defaultValue || "");
        }
    } else if (options.type === "select") {
        // Create a select element with options
        const sel = content.append("select")
            .attr("id", "modal-select");
        sel.selectAll("option")
            .data(options.options)
            .enter()
            .append("option")
            .attr("value", d => d.value)
            .text(d => d.text)
            .property("selected", d => d.value === options.defaultValue);
    } else if (options.type === "confirm") {
        // Create a confirmation prompt with the provided message
        content.append("p")
            .text(options.message || "Are you sure?");
    }

    // Display the modal
    modal.style("display", "block");

    if (inputField) {
        inputField.node().focus();
        inputField.node().setSelectionRange(-1, -1);
    }

    // OK button click handler: retrieve the input/selected value or return confirmation result
    d3.select("#modal-ok").on("click", function () {
        let value;
        if (options.type === "confirm") {
            value = true;
        } else if (options.type === "text") {
            value = d3.select("#modal-input").property("value");
        } else if (options.type === "select") {
            value = d3.select("#modal-select").property("value");
        }
        modal.style("display", "none");
        callback(value);
    });

    // Cancel button click handler: close the modal and return appropriate value
    d3.select("#modal-cancel").on("click", function () {
        let value;
        if (options.type === "confirm") {
            value = false;
        } else {
            value = null;
        }
        modal.style("display", "none");
        callback(value);
    });
}


/***************************************
 * Force simulation and rendering
 ***************************************/
const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links)
        .id(d => d.id)
        .distance(d => {
            // Increase distance if a relationship node is involved
            if (d.source.type === "relationship" || d.target.type === "relationship") return 180;
            return 150;
        })
    )
    .force("charge", d3.forceManyBody().strength(-400))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(d => {
        if (d.type === "entity") return 70;
        if (d.type === "attribute") return 50;
        if (d.type === "relationship") return 50;
        return 50;
    }))
    .on("tick", ticked);

let link, linkText, node;

function updateGraph() {
    // Assign default positions to new nodes if not set
    nodes.forEach(n => {
        if (typeof n.x !== "number" || typeof n.y !== "number") {
            n.x = width / 2;
            n.y = height / 2;
        }
    });
    // Render links as paths – with a gap in the center if cardinality is present
    link = gLinks.selectAll(".link")
        .data(links, d => d.source.id + "-" + d.target.id);
    link.exit().remove();
    link = link.enter().append("path")
        .attr("class", "link")
        .merge(link);

    // Cardinality labels
    linkText = gLinks.selectAll(".linkText")
        .data(links.filter(l => l.cardinality), d => d.source.id + "-" + d.target.id);
    linkText.exit().remove();
    linkText = linkText.enter().append("text")
        .attr("class", "linkText")
        .merge(linkText)
        .on("click", editCardinality)
        .text(d => d.cardinality);

    // Nodes
    node = gNodes.selectAll(".node")
        .data(nodes, d => d.id);
    node.exit().remove();
    const nodeEnter = node.enter().append("g")
        .attr("class", "node")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended))
        .on("click", editText)
        .on("contextmenu", showContextMenu);

    nodeEnter.each(function (d) {
        const g = d3.select(this);
        g.selectAll("*").remove();
        if (d.type === "entity") {
            g.append("rect")
                .attr("x", -60)
                .attr("y", -30)
                .attr("width", 120)
                .attr("height", 60)
                .attr("rx", 10)
                .attr("ry", 10)
                .attr("fill", "#ffcc00")
                .attr("stroke", "#333")
                .attr("stroke-width", STROKE_WIDTH);
            g.append("text")
                .attr("text-anchor", "middle")
                .attr("dy", "0.35em")
                .text(d.text);
        } else if (d.type === "attribute") {
            g.append("ellipse")
                .attr("cx", 0)
                .attr("cy", 0)
                .attr("rx", 50)
                .attr("ry", 25)
                .attr("fill", "#66ccff")
                .attr("stroke", "#333")
                .attr("stroke-width", STROKE_WIDTH);
            let textEl = g.append("text")
                .attr("text-anchor", "middle")
                .attr("dy", "0.35em")
                .text(d.text);
            if (d.primary) { textEl.style("text-decoration", "underline"); }
        } else if (d.type === "relationship") {
            const defaultW = 80, defaultH = 40;
            const points = `0,${-defaultH / 2} ${defaultW / 2},0 0,${defaultH / 2} ${-defaultW / 2},0`;
            g.append("polygon")
                .attr("points", points)
                .attr("fill", "#ccffcc")
                .attr("stroke", "#333")
                .attr("stroke-width", STROKE_WIDTH);
            g.append("text")
                .attr("text-anchor", "middle")
                .attr("dy", "0.35em")
                .text(d.text);
        }
        adjustNodeSize(g, d);
    });
    node = nodeEnter.merge(node);

    node.filter(d => d.type === "attribute")
        .select("text")
        .style("text-decoration", d => d.primary ? "underline" : "none");

    simulation.nodes(nodes);
    simulation.force("link").links(links);
    simulation.alpha(1).restart();
    updateButtonFitToContent();
}

// Calculates the anchor point of a node in the direction of another node
function computeAnchor(node, other, gap) {
    let dx = other.x - node.x;
    let dy = other.y - node.y;
    let angle = Math.atan2(dy, dx);
    let unitX = Math.cos(angle);
    let unitY = Math.sin(angle);
    let t = 0;

    if (node.type === "entity") {
        // Rectangle: Assumption: d.width was set, height is constant 60
        let halfWidth = node.width / 2;
        let halfHeight = 30;
        if (Math.abs(unitX) > 1e-6 && Math.abs(unitY) > 1e-6) {
            t = Math.min(halfWidth / Math.abs(unitX), halfHeight / Math.abs(unitY));
        } else if (Math.abs(unitX) > 1e-6) {
            t = halfWidth / Math.abs(unitX);
        } else {
            t = halfHeight / Math.abs(unitY);
        }
    } else if (node.type === "attribute") {
        // Ellipse: d.rx has been adjusted, ry remains 25
        let rx = node.rx;
        let ry = 25;
        // Formula for ellipse intersection
        t = 1 / Math.sqrt((unitX * unitX) / (rx * rx) + (unitY * unitY) / (ry * ry));
    } else if (node.type === "relationship") {
        // Polygon (diamond): The shape is drawn as a polygon
        // Assumption: d.width and d.height have been set; the centre point is in (0,0)
        let halfWidth = node.width / 2;
        let halfHeight = node.height / 2;
        // Edge of the diamond fulfils |x|/(w/2) + |y|/(h/2) = 1
        t = 1 / ((Math.abs(unitX) / halfWidth) + (Math.abs(unitY) / halfHeight));
    } else {
        // Fallback - e.g. circle with radius 50
        t = 50;
    }

    // The anchor point is t+gap away from the centre point in the direction of the other node
    return { x: node.x + (t + gap) * unitX, y: node.y + (t + gap) * unitY };
}

function ticked() {
    // Calculate the anchor points for each link and save them
    links.forEach(function (d) {
        d.sourceAnchor = computeAnchor(d.source, d.target, 10);
        d.targetAnchor = computeAnchor(d.target, d.source, 10);
    });

    // Aktualisiere den Pfad (Link) anhand der berechneten Ankerpunkte
    link.attr("d", function (d) {
        if (d.cardinality) {
            // Calculate the centre point between the anchor points
            let mx = (d.sourceAnchor.x + d.targetAnchor.x) / 2;
            let my = (d.sourceAnchor.y + d.targetAnchor.y) / 2;
            // For the small gap at the centre line
            let dx = d.targetAnchor.x - d.sourceAnchor.x;
            let dy = d.targetAnchor.y - d.sourceAnchor.y;
            let angle = Math.atan2(dy, dx);
            let gap = 20, gapHalf = gap / 2;
            let gx1 = mx - gapHalf * Math.cos(angle);
            let gy1 = my - gapHalf * Math.sin(angle);
            let gx2 = mx + gapHalf * Math.cos(angle);
            let gy2 = my + gapHalf * Math.sin(angle);
            return "M" + d.sourceAnchor.x + "," + d.sourceAnchor.y +
                " L" + gx1 + "," + gy1 +
                " M" + gx2 + "," + gy2 +
                " L" + d.targetAnchor.x + "," + d.targetAnchor.y;
        } else {
            return "M" + d.sourceAnchor.x + "," + d.sourceAnchor.y +
                " L" + d.targetAnchor.x + "," + d.targetAnchor.y;
        }
    });

    // Update the position of the nodes
    node.attr("transform", d => `translate(${d.x},${d.y})`);

    // Position the cardinality texts in the centre of the calculated anchor points
    linkText
        .attr("x", d => (d.sourceAnchor.x + d.targetAnchor.x) / 2)
        .attr("y", d => (d.sourceAnchor.y + d.targetAnchor.y) / 2);
}



/***************************************
 * Node size and font customization
 ***************************************/
function adjustNodeSize(g, d) {
    const textEl = g.select("text");
    if (textEl.empty()) return;
    let bbox = textEl.node().getBBox();
    const padding = 20;
    const maxWidth = 300;
    let defaultFont = 14;
    const minFont = 10;
    let currentFont = parseFloat(textEl.style("font-size")) || defaultFont;
    if (bbox.width > maxWidth - padding) {
        let newFont = Math.max(minFont, currentFont * (maxWidth - padding) / bbox.width);
        textEl.style("font-size", newFont + "px");
        bbox = textEl.node().getBBox();
    } else {
        textEl.style("font-size", defaultFont + "px");
        bbox = textEl.node().getBBox();
    }
    if (d.type === "entity") {
        let newWidth = Math.max(120, bbox.width + padding);
        g.select("rect").attr("width", newWidth)
            .attr("x", -newWidth / 2);
        d.width = newWidth;
    } else if (d.type === "attribute") {
        let newRx = Math.max(50, bbox.width / 2 + padding / 2);
        g.select("ellipse").attr("rx", newRx);
        d.rx = newRx;
    } else if (d.type === "relationship") {
        let newWidth = Math.max(80, bbox.width + padding) * 1.4;
        let newHeight = 80;
        const points = `0,${-newHeight / 2} ${newWidth / 2},0 0,${newHeight / 2} ${-newWidth / 2},0`;
        g.select("polygon").attr("points", points);
        d.width = newWidth;
        d.height = newHeight;
    }
}

/***************************************
 * Interactive functions (drag, edit)
 ***************************************/
var drag_start = -1;
var timeout = null;
function dragstarted(event, d) {
    drag_start = Date.now();
    timeout = setTimeout(() => {
        if (event.sourceEvent.touches) {
            showContextMenu(event.sourceEvent, d);
        }
    }, 300);
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}
function dragged(event, d) {
    menu.style("display", "none");
    clearTimeout(timeout);
    d.fx = event.x;
    d.fy = event.y;
}
function dragended(event, d) {
    if (Date.now() - drag_start < 500) {
        clearTimeout(timeout);
    }
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}
// Edit node text via modal
function editText(event, d) {
    event.stopPropagation();
    const currentG = d3.select(this);
    showModal({ type: "text", title: "Edit text", defaultValue: d.text, nodeType: d.type }, function (newText) {
        if (newText !== null && newText.trim() !== "") {
            historyManager.save(getStateSnapshot());
            d.text = newText;
            currentG.select("text").text(newText);
            adjustNodeSize(currentG, d);
            const nodeConfig = config.nodes.find(n => n.id === d.id);
            if (nodeConfig) { nodeConfig.text = d.text; }
            updateGraph();
        }
    });
}
// Edit cardinality via modal – allowed values: 1, n, m
function editCardinality(event, d) {
    event.stopPropagation();
    showModal({ type: "select", title: "Edit cardinality", options: [{ value: '1', text: '1' }, { value: 'n', text: 'n' }, { value: 'm', text: 'm' }], defaultValue: d.cardinality }, function (newCard) {
        if (newCard !== null && newCard.trim() !== "") {
            historyManager.save(getStateSnapshot());
            newCard = newCard.trim();
            if (newCard !== "1" && newCard.toLowerCase() !== "n" && newCard.toLowerCase() !== "m") {
                alert("Invalid value! Please enter only 1, n or m.");
                return;
            }
            d.cardinality = (newCard === "1") ? "1" : newCard.toLowerCase();
            const linkConfig = config.links.find(l => {
                const src = (l.source.id ? l.source.id : l.source);
                const tgt = (l.target.id ? l.target.id : l.target);
                return src === d.source.id && tgt === d.target.id;
            });
            if (linkConfig) { linkConfig.cardinality = d.cardinality; }
            updateGraph();
        }
    });
}

/***************************************
 * Context menu (right-click) – dynamic based on element type
 ***************************************/
function showContextMenu(event, d) {
    event.preventDefault();
    currentContextNode = d;
    menu.html("");
    let menuHTML = '<ul>';
    menuHTML += `<li id="cm-delete" style="background-image: url(&quot;${icons['/icons/trash.svg']}&quot;);">Delete Element</li>`;
    if (d.type === "entity") {
        menuHTML += `<li id="cm-add-attribute" style="background-image: url(&quot;${icons['/icons/plus.svg']}&quot;);">Add new attribute</li>`;
        menuHTML += `<li id="cm-add-relationship" style="background-image: url(&quot;${icons['/icons/link.svg']}&quot;);">Create new relationship</li>`;
    } else if (d.type === "attribute") {
        menuHTML += `<li id="cm-set-primary" style="background-image: url(&quot;${icons['/icons/key.svg']}&quot;);">Set as primary key</li>`;
    } else if (d.type === "relationship") {
        menuHTML += `<li id="cm-add-attribute-rel" style="background-image: url(&quot;${icons['/icons/plus.svg']}&quot;);">Add new attribute</li>`;
    }
    menuHTML += '</ul>';
    var left = event.pageX;
    if (event.pageX + parseInt(menu.style("width")) > window.innerWidth) {
        left = event.pageX - parseInt(menu.style("width"));
    }
    menu.html(menuHTML);
    menu.style("left", left + "px")
        .style("top", event.pageY + "px")
        .style("display", "block");

    // Delete element (and for entities, also remove related attributes and relationships)
    d3.select("#cm-delete").on("click", function () {
        historyManager.save(getStateSnapshot());
        if (currentContextNode.type === "entity") {
            let removeSet = new Set([currentContextNode.id]);

            // Recursively find dependent elements
            const findDependencies = (id) => {
                links.forEach(l => {
                    const src = l.source.id || l.source;
                    const tgt = l.target.id || l.target;
                    if (src === id) {
                        const node = nodes.find(n => n.id === tgt);
                        if (node && (node.type === "attribute" || node.type === "relationship")) {
                            if (!removeSet.has(tgt)) {
                                removeSet.add(tgt);
                                if (node.type === "relationship") findDependencies(tgt);
                            }
                        }
                    }
                });
            };

            findDependencies(currentContextNode.id);
            removeSet.add(currentContextNode.id);
            links.forEach(l => {
                let src = (typeof l.source === "object" ? l.source.id : l.source);
                let tgt = (typeof l.target === "object" ? l.target.id : l.target);
                if (src === currentContextNode.id) {
                    let targetNode = nodes.find(n => n.id === tgt);
                    if (targetNode && (targetNode.type === "attribute" || targetNode.type === "relationship")) {
                        removeSet.add(tgt);
                    }
                }
                if (tgt === currentContextNode.id) {
                    let sourceNode = nodes.find(n => n.id === src);
                    if (sourceNode && sourceNode.type === "relationship") {
                        removeSet.add(src);
                    }
                }
            });
            nodes = nodes.filter(n => !removeSet.has(n.id));
            config.nodes = config.nodes.filter(n => !removeSet.has(n.id));
            links = links.filter(l => {
                let src = (typeof l.source === "object" ? l.source.id : l.source);
                let tgt = (typeof l.target === "object" ? l.target.id : l.target);
                return !removeSet.has(src) && !removeSet.has(tgt);
            });
            config.links = config.links.filter(l => !removeSet.has(l.source) && !removeSet.has(l.target));
        } else {
            // For attributes or relationships: simple deletion
            nodes = nodes.filter(n => n.id !== currentContextNode.id);
            config.nodes = config.nodes.filter(n => n.id !== currentContextNode.id);
            links = links.filter(l => {
                let src = (typeof l.source === "object" ? l.source.id : l.source);
                let tgt = (typeof l.target === "object" ? l.target.id : l.target);
                return src !== currentContextNode.id && tgt !== currentContextNode.id;
            });
            config.links = config.links.filter(l => l.source !== currentContextNode.id && l.target !== currentContextNode.id);
        }
        updateGraph();
        menu.style("display", "none");
    });
    // Add new attribute (for entities)
    d3.select("#cm-add-attribute").on("click", function () {
        showModal({ type: "text", title: "Add new attribute", defaultValue: "" }, function (attrText) {
            if (attrText && attrText.trim() !== "") {
                historyManager.save(getStateSnapshot());
                const newId = attrText + "_" + Date.now();
                const newAttr = { id: newId, type: "attribute", text: attrText };
                nodes.push(newAttr);
                config.nodes.push(newAttr);
                const newLink = { source: currentContextNode.id, target: newId };
                links.push(newLink);
                config.links.push(newLink);
                updateGraph();
            }
        });
        menu.style("display", "none");
    });
    // Create new relationship (for entities)
    d3.select("#cm-add-relationship").on("click", function () {
        showModal({ type: "text", title: "Name of the new relationship", defaultValue: "", nodeType: 'relationship' }, function (relText) {
            if (relText && relText.trim() !== "") {
                historyManager.save(getStateSnapshot());
                const validEntities = nodes.filter(n => n.type === "entity" && n.id !== currentContextNode.id)
                    .map(n => ({ value: n.id, text: n.id.substring(0, n.id.lastIndexOf('_')) }));
                if (validEntities.length === 0) {
                    alert("No other entity available.");
                    return;
                }
                showModal({ type: "select", title: "Select target entity", options: validEntities }, function (targetEntity) {
                    if (targetEntity) {
                        const newRelId = relText + "_" + Date.now();
                        const newRel = { id: newRelId, type: "relationship", text: relText };
                        nodes.push(newRel);
                        config.nodes.push(newRel);
                        const link1 = { source: currentContextNode.id, target: newRelId, cardinality: "1" };
                        const link2 = { source: newRelId, target: targetEntity, cardinality: "n" };
                        links.push(link1, link2);
                        config.links.push(link1, link2);
                        updateGraph();
                    }
                });
            }
        });
        menu.style("display", "none");
    });
    // Set as primary key (for attributes)
    d3.select("#cm-set-primary").on("click", function () {
        historyManager.save(getStateSnapshot());
        const attributeNode = currentContextNode;
        // Find the parent entity
        const parentEntity = nodes.find(n =>
            links.some(l =>
                (l.source.id || l.source) === n.id &&
                (l.target.id || l.target) === attributeNode.id
            )
        );
        if (parentEntity) {
            // Reset primary key status for all attributes of the entity
            nodes.forEach(n => {
                if (n.type === "attribute" &&
                    links.some(l => (l.source.id || l.source) === parentEntity.id && (l.target.id || l.target) === n.id)) {
                    n.primary = n.id === attributeNode.id;
                }
            });
            updateGraph();
        }
        menu.style("display", "none");
    });
    // Add new attribute to relationship (for relationships)
    d3.select("#cm-add-attribute-rel").on("click", function () {
        showModal({ type: "text", title: "Add new attribute for relationship", defaultValue: "" }, function (attrText) {
            if (attrText && attrText.trim() !== "") {
                historyManager.save(getStateSnapshot());
                const newId = attrText + "_" + Date.now();
                const newAttr = { id: newId, type: "attribute", text: attrText };
                nodes.push(newAttr);
                config.nodes.push(newAttr);
                const newLink = { source: currentContextNode.id, target: newId };
                links.push(newLink);
                config.links.push(newLink);
                updateGraph();
            }
        });
        menu.style("display", "none");
    });
}
// Hide context menu when clicking outside of it
d3.select("body").on("click", function () {
    d3.select("#context-menu").style("display", "none");
});


/***************************************
 * Undo and Redo functions
 ***************************************/
function undo() {
    const prevState = historyManager.undo(getStateSnapshot());
    if (prevState) {
        config = prevState;
        nodes = config.nodes.slice();
        links = config.links.slice();
        nodes.forEach(n => {
            if (typeof n.x !== "number" || typeof n.y !== "number") {
                n.x = width / 2;
                n.y = height / 2;
            }
        });
        updateGraph();
    }
}

function redo() {
    const nextState = historyManager.redo(getStateSnapshot());
    if (nextState) {
        config = nextState;
        nodes = config.nodes.slice();
        links = config.links.slice();
        nodes.forEach(n => {
            if (typeof n.x !== "number" || typeof n.y !== "number") {
                n.x = width / 2;
                n.y = height / 2;
            }
        });
        updateGraph();
    }
}

// Attach undo/redo to buttons
d3.select("#undo-btn").on("click", undo);
d3.select("#redo-btn").on("click", redo);

/***************************************
 * Button actions: Add new entity, JSON export/import, and reset view
 ***************************************/
d3.select("#add-entity").on("click", function () {
    showModal({ type: "text", title: "Name of the new entity", defaultValue: "" }, function (entityName) {
        if (entityName && entityName.trim() !== "") {
            historyManager.save(getStateSnapshot());
            const newId = entityName + "_" + Date.now();
            const newEntity = { id: newId, type: "entity", text: entityName, x: width / 2, y: height / 2 };
            nodes.push(newEntity);
            config.nodes.push(newEntity);
            updateGraph();
        }
    });
});

d3.select("#download-json").on("click", function () {
    config.nodes = nodes.map(n => ({
        id: n.id,
        type: n.type,
        text: n.text,
        primary: n.primary,
        x: n.x,
        y: n.y
    }));
    config.links = links.map(l => ({
        source: typeof l.source === "object" ? l.source.id : l.source,
        target: typeof l.target === "object" ? l.target.id : l.target,
        cardinality: l.cardinality
    }));
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", projectname + ".json");
    dlAnchorElem.click();
});

d3.select("#upload-json-btn").on("click", function () {
    document.getElementById("upload-json").click();
});

d3.select("#diagram-new").on("click", function () {
    showModal({ type: "confirm", title: "New Document", message: "Are you sure you want to create a new document? Your current status will be overwritten and not saved. This action cannot be undone. Save your work before you continue." }, function (result) {
        if (result) {
            historyManager.clear();
            setProjectname("er_diagram");
            config = {
                "nodes": [],
                "links": []
            };
            nodes = config.nodes.slice();
            links = config.links.slice();
            updateGraph();
        }
    });
});

d3.select("#projectname").on("click", function () {
    showModal({ type: "text", title: "Change projectname", defaultValue: projectname }, function (newText) {
        if (newText !== null && newText.trim() !== "") {
            setProjectname(newText);
        }
    });
});

function baseName(str) {
    var base = new String(str).substring(str.lastIndexOf('/') + 1);
    if (base.lastIndexOf(".") != -1)
        base = base.substring(0, base.lastIndexOf("."));
    return base;
}

d3.select("#upload-json").on("change", function () {
    const file = this.files[0];
    setProjectname(baseName(file.name));
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const json = JSON.parse(e.target.result);
            if (json.nodes && json.links) {
                config = json;
                nodes = config.nodes.slice();
                links = config.links.slice();
                nodes.forEach(n => {
                    if (typeof n.x !== "number" || typeof n.y !== "number") {
                        n.x = width / 2;
                        n.y = height / 2;
                    }
                });
                updateGraph();
            } else {
                alert("Invalid JSON format.");
            }
        } catch (err) {
            alert("Error parsing the JSON file.");
        }
    };
    reader.readAsText(file);
    this.value = "";
});

// Reset view button: reset zoom and pan to default
d3.select("#reset-view").on("click", function () {
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
});


/***************************************
 * Export PNG functionality
 ***************************************/
function exportImage(format, quality) {
    const bbox = getDiagramBBox();
    const originalSvg = document.querySelector('svg');
    const clonedSvg = originalSvg.cloneNode(true);

    clonedSvg.setAttribute('width', bbox.width);
    clonedSvg.setAttribute('height', bbox.height);

    const gMain = clonedSvg.querySelector('.gMain');
    if (gMain) {
        gMain.style.transform = `translate(${bbox.minX * -1}px, ${bbox.minY * -1}px)`;
    }

    const svgNS = "http://www.w3.org/2000/svg";
    const watermark = document.createElementNS(svgNS, "text");
    watermark.textContent = "Created with ermodell";
    watermark.setAttribute("x", "5");
    watermark.setAttribute("y", bbox.height - 5);
    watermark.setAttribute("dominant-baseline", "text-after-edge");
    watermark.style.fontSize = "10px";
    watermark.setAttribute("fill", "rgba(0,0,0,0.5)");

    clonedSvg.appendChild(watermark);

    clonedSvg.setAttribute('id', 'clonedSvg');
    document.body.appendChild(clonedSvg);

    d3SvgToPng('#clonedSvg', projectname, {
        scale: 3,
        format: format,
        quality: quality,
        download: true,
        ignore: '.ignored',
        background: 'white'
    });

    document.getElementById('clonedSvg').remove();
}

d3.select("#export-png").on("click", function () {
    exportImage('png', 1);
});

d3.select("#export-webp").on("click", function () {
    exportImage('webp', 1);
});

d3.select("#back-to-content").on("click", function () {
    fitToScreen();
});

d3.select("#fit-content").on("click", function () {
    fitToScreen();
});

function fitToScreen() {
    if (config.nodes.length === 0) return;
    const bbox = getDiagramBBox();
    const svgRect = svg.node().getBoundingClientRect();

    const scaleX = svgRect.width / bbox.width;
    const scaleY = svgRect.height / bbox.height;
    const scale = Math.max(0.1, Math.min(scaleX, scaleY, 1)); // Maximum 1x scaling

    const translateX = (svgRect.width - bbox.width * scale) / 2 - bbox.minX * scale;
    const translateY = (svgRect.height - bbox.height * scale) / 2 - bbox.minY * scale;

    const transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);

    svg.transition()
        .duration(750)
        .call(zoom.transform, transform);
}

function getDiagramBBox() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
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
        minX = Math.min(minX, n.x - halfWidth);
        minY = Math.min(minY, n.y - halfHeight);
        maxX = Math.max(maxX, n.x + halfWidth);
        maxY = Math.max(maxY, n.y + halfHeight);
    });
    const padding = 20;
    return {
        minX: minX - padding,
        minY: minY - padding,
        width: (maxX - minX) + 2 * padding,
        height: (maxY - minY) + 2 * padding
    };
}


/***************************************
 * Initial rendering of the graph
 ***************************************/
updateGraph();
