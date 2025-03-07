/***************************************
 * Dynamic SVG size (full window width & height minus button area)
 ***************************************/
const STROKE_WIDTH = 0;

const topOffset = document.querySelector(".button-container").offsetHeight + 20;
let svg = d3.select("svg")
    .attr("width", window.innerWidth)
    .attr("height", window.innerHeight - topOffset);
let width = +svg.attr("width"),
    height = +svg.attr("height");

window.addEventListener("resize", function () {
    svg.attr("width", window.innerWidth)
        .attr("height", window.innerHeight - topOffset);
    width = window.innerWidth;
    height = window.innerHeight - topOffset;
    simulation.force("center", d3.forceCenter(width / 2, height / 2));
    updateGraph();
});

/***************************************
 * Initial configuration (JSON)
 ***************************************/
let config = {
    "nodes": [
        {"id":"Entity_1741374044081","type":"entity","text":"Entity"},
        {"id":"Entity_1741374049158","type":"entity","text":"Entity"},
        {"id":"Relation_1741374062200","type":"relationship","text":"Relation"},
        {"id":"Attribut_1741374067971","type":"attribute","text":"Attribute"},
        {"id":"Attribut_1741374073140","type":"attribute","text":"Attribute"},
        {"id":"Attribute_1741374083026","type":"attribute","text":"Attribute"},
        {"id":"Attribute_1741374090093","type":"attribute","text":"Attribute"}
    ],
    "links":[
        {"source":"Entity_1741374049158","target":"Relation_1741374062200","cardinality":"1"},
        {"source":"Relation_1741374062200","target":"Entity_1741374044081","cardinality":"n"},
        {"source":"Entity_1741374049158","target":"Attribut_1741374067971"},
        {"source":"Entity_1741374049158","target":"Attribut_1741374073140"},
        {"source":"Entity_1741374044081","target":"Attribute_1741374083026"},
        {"source":"Entity_1741374044081","target":"Attribute_1741374090093"}
    ]
};

let nodes = config.nodes.slice();
let links = config.links.slice();
let currentContextNode = null; // Node to which the context menu belongs

// Separate groups: Links (in the background) and Nodes
const gLinks = svg.append("g").attr("class", "gLinks");
const gNodes = svg.append("g").attr("class", "gNodes");


/***************************************
 * Modal functionality
 ***************************************/
function showModal(options, callback) {
    // Options: type ('text' or 'select'), title, defaultValue, options (for select: array of {value,text})
    const modal = d3.select("#modal");
    d3.select("#modal-title").text(options.title || "");
    const content = d3.select("#modal-content");
    content.html("");
    if (options.type === "text") {
        content.append("input")
            .attr("type", "text")
            .attr("id", "modal-input")
            .attr("value", options.defaultValue || "");
    } else if (options.type === "select") {
        const sel = content.append("select")
            .attr("id", "modal-select");
        sel.selectAll("option")
            .data(options.options)
            .enter()
            .append("option")
            .attr("value", d => d.value)
            .text(d => d.text);
    }
    modal.style("display", "block");
    d3.select("#modal-ok").on("click", function () {
        let value = options.type === "text" ? d3.select("#modal-input").property("value") : d3.select("#modal-select").property("value");
        modal.style("display", "none");
        callback(value);
    });
    d3.select("#modal-cancel").on("click", function () {
        modal.style("display", "none");
        callback(null);
    });
}

/***************************************
 * Force simulation and rendering
 ***************************************/
const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links)
        .id(d => d.id)
        .distance(d => {
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
    // New nodes are assigned a default position (centre) if no position exists yet
    nodes.forEach(n => {
        if (typeof n.x !== "number" || typeof n.y !== "number") {
            n.x = width / 2;
            n.y = height / 2;
        }
    });
    // Render links as paths - with interrupted centre section if cardinality is present
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

    simulation.nodes(nodes);
    simulation.force("link").links(links);
    simulation.alpha(1).restart();
}

function ticked() {
    // Nodes are kept within the SVG limits (clamping)
    nodes.forEach(function (n) {
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
        n.x = Math.max(halfWidth, Math.min(width - halfWidth, n.x));
        n.y = Math.max(halfHeight, Math.min(height - halfHeight, n.y));
    });
    // Update links as paths
    link.attr("d", function (d) {
        let sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y;
        if (d.cardinality) {
            // Centre point and direction
            let mx = (sx + tx) / 2, my = (sy + ty) / 2;
            let dx = tx - sx, dy = ty - sy;
            let angle = Math.atan2(dy, dx);
            let gap = 20, gapHalf = gap / 2;
            let gx1 = mx - gapHalf * Math.cos(angle);
            let gy1 = my - gapHalf * Math.sin(angle);
            let gx2 = mx + gapHalf * Math.cos(angle);
            let gy2 = my + gapHalf * Math.sin(angle);
            return "M" + sx + "," + sy + " L" + gx1 + "," + gy1 + " M" + gx2 + "," + gy2 + " L" + tx + "," + ty;
        } else {
            return "M" + sx + "," + sy + " L" + tx + "," + ty;
        }
    });
    node.attr("transform", d => `translate(${d.x},${d.y})`);
    // Position cardinality labels in the centre
    linkText
        .attr("x", d => (d.source.x + d.target.x) / 2)
        .attr("y", d => (d.source.y + d.target.y) / 2);
}

/***************************************
 * Size and font customisation
 ***************************************/
function adjustNodeSize(g, d) {
    console.log(g, d)
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
function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}
function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}
function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}
// Text editing via modal
function editText(event, d) {
    event.stopPropagation();
    const currentG = d3.select(this);
    showModal({ type: "text", title: "Edit text", defaultValue: d.text }, function (newText) {
        if (newText !== null && newText.trim() !== "") {
            d.text = newText;
            currentG.select("text").text(newText);
            adjustNodeSize(currentG, d);
            const nodeConfig = config.nodes.find(n => n.id === d.id);
            if (nodeConfig) { nodeConfig.text = d.text; }
            updateGraph();
        }
    });
}
// Cardinality processing - only permissible values (1, n, m)
function editCardinality(event, d) {
    event.stopPropagation();
    showModal({ type: "text", title: "Kardinalität bearbeiten (nur 1, n, m)", defaultValue: d.cardinality }, function (newCard) {
        if (newCard !== null && newCard.trim() !== "") {
            newCard = newCard.trim();
            if (newCard !== "1" && newCard.toLowerCase() !== "n" && newCard.toLowerCase() !== "m") {
                alert("Ungültiger Wert! Bitte nur 1, n oder m eingeben.");
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
 * Context menu (right-click) - dynamic depending on element type
 ***************************************/
function showContextMenu(event, d) {
    event.preventDefault();
    currentContextNode = d;
    const menu = d3.select("#context-menu");
    menu.html("");
    // Standard: Option to delete the element
    let menuHTML = '<ul>';
    menuHTML += '<li id="cm-delete">Delete Element</li>';
    if (d.type === "entity") {
        menuHTML += '<li id="cm-add-attribute">Add new attribute</li>';
        menuHTML += '<li id="cm-add-relationship">Create new relationship</li>';
    } else if (d.type === "attribute") {
        menuHTML += '<li id="cm-set-primary">Set as primary key</li>';
    } else if (d.type === "relationship") {
        menuHTML += '<li id="cm-add-attribute-rel">Add new attribute</li>';
    }
    menuHTML += '</ul>';
    menu.html(menuHTML);
    menu.style("left", event.pageX + "px")
        .style("top", event.pageY + "px")
        .style("display", "block");

    // Delete (for all elements) - for entities, also remove associated attributes and relationships
    d3.select("#cm-delete").on("click", function () {
        if (currentContextNode.type === "entity") {
            let removeSet = new Set([currentContextNode.id]);

            // Find dependent elements recursively
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
            // For attributes or relationships: Simple deletion
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
        showModal({ type: "text", title: "Neues Attribut hinzufügen", defaultValue: "" }, function (attrText) {
            if (attrText && attrText.trim() !== "") {
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
    // Create new relationship (for entities) - Selection via select menu
    d3.select("#cm-add-relationship").on("click", function () {
        showModal({ type: "text", title: "Name of the new relationship", defaultValue: "" }, function (relText) {
            if (relText && relText.trim() !== "") {
                const validEntities = nodes.filter(n => n.type === "entity" && n.id !== currentContextNode.id)
                    .map(n => ({ value: n.id, text: n.id }));
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
    // In showContextMenu, when clicking on 'Set as primary key'
    d3.select("#cm-set-primary").on("click", function () {
        const attributeNode = currentContextNode;

        // Find the parent entity
        const parentEntity = nodes.find(n =>
            links.some(l =>
                (l.source.id || l.source) === n.id &&
                (l.target.id || l.target) === attributeNode.id
            )
        );

        if (parentEntity) {
            // Reset all attributes of the entity
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
        showModal({ type: "text", title: "Neues Attribut für Beziehung hinzufügen", defaultValue: "" }, function (attrText) {
            if (attrText && attrText.trim() !== "") {
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
 * Button actions: New entity, JSON export/import
 ***************************************/
d3.select("#add-entity").on("click", function () {
    showModal({ type: "text", title: "Name of the new relationship", defaultValue: "" }, function (entityName) {
        if (entityName && entityName.trim() !== "") {
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
    dlAnchorElem.setAttribute("download", "er_diagramm.json");
    dlAnchorElem.click();
});

d3.select("#upload-json-btn").on("click", function () {
    document.getElementById("upload-json").click();
});
d3.select("#upload-json").on("change", function () {
    const file = this.files[0];
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
                alert("Ungültiges JSON-Format.");
            }
        } catch (err) {
            alert("Fehler beim Parsen der JSON-Datei.");
        }
    };
    reader.readAsText(file);
    this.value = "";
});

/***************************************
 * Initial rendering
 ***************************************/
updateGraph();