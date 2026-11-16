import { describe, it, expect, beforeEach, vi } from "vitest";
import { ERDiagram, asNode, endpointId, type ERLink } from "../diagram";
import { ERNode } from "../ernode";
import { mountAppShell } from "../test/domFixture";
import exampleConfig from "../diagram_exampleconfig.json";

beforeEach(() => {
    mountAppShell();
    // jsdom does not implement SVGAnimatedTransformList, which d3-transition
    // needs to animate the "transform" attribute (triggered via Contextmenu.hide()).
    // The animation itself is outside what these tests cover.
    vi.spyOn(ERNode.prototype, "setScale").mockImplementation(() => { });
});

function createDiagram(): ERDiagram {
    return new ERDiagram("svg", 1024, 768);
}

describe("asNode / endpointId", () => {
    it("endpointId returns the id unchanged for a string/number endpoint", () => {
        expect(endpointId("node-1")).toBe("node-1");
        expect(endpointId(42)).toBe(42);
    });

    it("endpointId extracts the id from a resolved node reference", () => {
        const node = new ERNode({ id: "node-1", type: "entity", text: "Entity" }, 100, 100);
        expect(endpointId(node)).toBe("node-1");
    });

    it("asNode casts an already-resolved endpoint back to ERNode", () => {
        const node = new ERNode({ id: "node-1", type: "entity", text: "Entity" }, 100, 100);
        expect(asNode(node)).toBe(node);
    });
});

describe("ERDiagram construction", () => {
    it("loads the default example configuration", () => {
        const diagram = createDiagram();
        expect(diagram.nodes).toHaveLength(exampleConfig.nodes.length);
        expect(diagram.links).toHaveLength(exampleConfig.links.length);
        expect(diagram.getName()).toBe("untitled");
    });

    it("renders the project name into the DOM", () => {
        createDiagram();
        expect(document.getElementById("projectname")!.innerText).toBe("untitled.json");
    });
});

describe("ERDiagram state snapshot / load round-trip", () => {
    it("getStateSnapshot reflects the loaded nodes and links", () => {
        const diagram = createDiagram();
        const snapshot = diagram.getStateSnapshot();

        expect(snapshot.nodes.map(n => n.id).sort()).toEqual(exampleConfig.nodes.map(n => n.id).sort());
        expect(snapshot.links).toHaveLength(exampleConfig.links.length);
        for (const link of snapshot.links) {
            expect(typeof link.source).toBe("string");
            expect(typeof link.target).toBe("string");
        }
    });

    it("loadConfig(getStateSnapshot()) reproduces the same node/link ids", () => {
        const diagram = createDiagram();
        const before = diagram.getStateSnapshot();

        diagram.loadConfig(before);
        const after = diagram.getStateSnapshot();

        expect(after.nodes.map(n => n.id).sort()).toEqual(before.nodes.map(n => n.id).sort());
        expect(after.links.map(l => `${l.source}-${l.target}`).sort())
            .toEqual(before.links.map(l => `${l.source}-${l.target}`).sort());
    });

    it("clear() empties nodes, links and the history stack", () => {
        const diagram = createDiagram();
        diagram.clear();
        expect(diagram.nodes).toHaveLength(0);
        expect(diagram.links).toHaveLength(0);
        diagram.undo();
        expect(diagram.nodes).toHaveLength(0);
        expect(diagram.getStateSnapshot()).toEqual({ nodes: [], links: [] });
    });
});

describe("ERDiagram entity/undo/redo", () => {
    it("addEntity adds a new entity node and makes the action undoable", () => {
        const diagram = createDiagram();
        const countBefore = diagram.nodes.length;

        diagram.addEntity();
        expect(diagram.nodes).toHaveLength(countBefore + 1);
        expect(diagram.nodes.at(-1)!.type).toBe("entity");

        diagram.undo();
        expect(diagram.nodes).toHaveLength(countBefore);

        diagram.redo();
        expect(diagram.nodes).toHaveLength(countBefore + 1);
    });

    it("undo on an empty history stack is a no-op", () => {
        const diagram = createDiagram();
        const countBefore = diagram.nodes.length;
        diagram.undo();
        expect(diagram.nodes).toHaveLength(countBefore);
    });
});

describe("ERDiagram context-menu driven operations", () => {
    it("setPrimaryKey marks exactly one attribute of the owning entity as primary", () => {
        const diagram = createDiagram();
        // From the example config: entity "14a380cc-..." owns attributes
        // "a361fa2e-..." and "c3c2da63-...".
        const attr1 = "a361fa2e-b497-4e7b-90bc-ba0d4689a0cc";
        const attr2 = "c3c2da63-5a45-43b1-9520-8bd7f8383392";

        const attrNode1 = diagram.nodes.find(n => n.id === attr1)!;
        const attrNode2 = diagram.nodes.find(n => n.id === attr2)!;

        diagram.contextmenuhandler.show(attrNode1);
        diagram.setPrimaryKey();
        expect(diagram.nodes.find(n => n.id === attr1)!.primary).toBe(true);
        expect(diagram.nodes.find(n => n.id === attr2)!.primary).toBeFalsy();

        diagram.contextmenuhandler.show(attrNode2);
        diagram.setPrimaryKey();
        expect(diagram.nodes.find(n => n.id === attr1)!.primary).toBe(false);
        expect(diagram.nodes.find(n => n.id === attr2)!.primary).toBe(true);
    });

    it("deleteNode on an entity cascades to its directly dependent attributes", () => {
        const diagram = createDiagram();
        const entityId = "14a380cc-d050-4f01-be12-b0c46351f11a";
        const dependentAttrIds = ["a361fa2e-b497-4e7b-90bc-ba0d4689a0cc", "c3c2da63-5a45-43b1-9520-8bd7f8383392"];

        const entityNode = diagram.nodes.find(n => n.id === entityId)!;
        diagram.contextmenuhandler.show(entityNode);
        diagram.deleteNode();

        expect(diagram.nodes.find(n => n.id === entityId)).toBeUndefined();
        for (const id of dependentAttrIds) {
            expect(diagram.nodes.find(n => n.id === id)).toBeUndefined();
        }
        // No link should reference a now-deleted node.
        const remainingIds = new Set(diagram.nodes.map(n => n.id));
        for (const link of diagram.links) {
            expect(remainingIds.has(endpointId(link.source) as string)).toBe(true);
            expect(remainingIds.has(endpointId(link.target) as string)).toBe(true);
        }
    });

    it("deleteNode without a context node does nothing", () => {
        const diagram = createDiagram();
        const countBefore = diagram.nodes.length;
        diagram.deleteNode();
        expect(diagram.nodes).toHaveLength(countBefore);
    });

    it("addAttributeNode attaches a new attribute to the context entity", () => {
        const diagram = createDiagram();
        const entityId = "bad9ff34-73d2-4670-aa1e-70b59e2e9170";
        const entityNode = diagram.nodes.find(n => n.id === entityId)!;
        const countBefore = diagram.nodes.length;

        diagram.contextmenuhandler.show(entityNode);
        diagram.addAttributeNode();

        expect(diagram.nodes).toHaveLength(countBefore + 1);
        const newAttr = diagram.nodes.at(-1)!;
        expect(newAttr.type).toBe("attribute");
        expect(diagram.links.some(l => endpointId(l.source) === entityId && endpointId(l.target) === newAttr.id)).toBe(true);
    });

    it("createRecursiveRelation adds a relationship node linked twice to the same entity", () => {
        const diagram = createDiagram();
        const entityId = "bad9ff34-73d2-4670-aa1e-70b59e2e9170";
        const entityNode = diagram.nodes.find(n => n.id === entityId)!;
        const countBefore = diagram.nodes.length;
        const linksBefore = diagram.links.length;

        diagram.contextmenuhandler.show(entityNode);
        diagram.createRecursiveRelation();

        expect(diagram.nodes).toHaveLength(countBefore + 1);
        const relationNode = diagram.nodes.at(-1)!;
        expect(relationNode.type).toBe("relationship");

        expect(diagram.links).toHaveLength(linksBefore + 2);
        const recursiveLinks = diagram.links.filter(l =>
            endpointId(l.source) === entityId && endpointId(l.target) === relationNode.id
        );
        expect(recursiveLinks).toHaveLength(2);
        expect(recursiveLinks.every(l => l.recursive)).toBe(true);
        expect(new Set(recursiveLinks.map(l => l.recursiveSide))).toEqual(new Set([1, -1]));
    });

    it("createRecursiveRelation on a non-entity context node does nothing", () => {
        const diagram = createDiagram();
        const attrId = "a361fa2e-b497-4e7b-90bc-ba0d4689a0cc";
        const attrNode = diagram.nodes.find(n => n.id === attrId)!;
        const countBefore = diagram.nodes.length;
        const linksBefore = diagram.links.length;

        diagram.contextmenuhandler.show(attrNode);
        diagram.createRecursiveRelation();

        expect(diagram.nodes).toHaveLength(countBefore);
        expect(diagram.links).toHaveLength(linksBefore);
    });

    it("toggleTotalParticipation flips the flag and is undoable", () => {
        const diagram = createDiagram();
        const link = diagram.links[0];
        expect(link.totalParticipation).toBeFalsy();

        diagram.toggleTotalParticipation(link);
        expect(link.totalParticipation).toBe(true);

        diagram.toggleTotalParticipation(link);
        expect(link.totalParticipation).toBe(false);

        diagram.undo();
        expect(diagram.links[0].totalParticipation).toBe(true);
    });

    it("getStateSnapshot round-trips recursive and total participation link flags", () => {
        const diagram = createDiagram();
        const entityId = "bad9ff34-73d2-4670-aa1e-70b59e2e9170";
        const entityNode = diagram.nodes.find(n => n.id === entityId)!;

        diagram.contextmenuhandler.show(entityNode);
        diagram.createRecursiveRelation();
        const recursiveLink = diagram.links.find(l => l.recursive)!;
        diagram.toggleTotalParticipation(recursiveLink);

        const snapshot = diagram.getStateSnapshot();
        diagram.loadConfig(snapshot);

        const reloaded = diagram.links.find(l =>
            endpointId(l.source) === entityId && l.recursive && l.recursiveSide === recursiveLink.recursiveSide
        )!;
        expect(reloaded.totalParticipation).toBe(true);
        expect(reloaded.recursive).toBe(true);
    });
});

describe("ERDiagram weak entities, identifying relationships and partial keys", () => {
    const entityId = "14a380cc-d050-4f01-be12-b0c46351f11a";
    const relationId = "ea2ecc23-07e9-46a5-8e6b-9e91db0d78ad";
    const attrId = "a361fa2e-b497-4e7b-90bc-ba0d4689a0cc";
    const otherAttrId = "c3c2da63-5a45-43b1-9520-8bd7f8383392";

    it("toggleWeakEntity renders a double rectangle and is undoable", () => {
        const diagram = createDiagram();
        const entity = diagram.nodes.find(n => n.id === entityId)!;
        expect(entity.selection.select("rect.shape-inner").empty()).toBe(true);

        diagram.contextmenuhandler.show(entity);
        diagram.toggleWeakEntity();
        expect(entity.weak).toBe(true);
        expect(entity.selection.select("rect.shape-inner").empty()).toBe(false);

        diagram.undo();
        const restored = diagram.nodes.find(n => n.id === entityId)!;
        expect(restored.weak).toBeFalsy();
    });

    it("toggleIdentifyingRelationship renders a double diamond", () => {
        const diagram = createDiagram();
        const relation = diagram.nodes.find(n => n.id === relationId)!;

        diagram.contextmenuhandler.show(relation);
        diagram.toggleIdentifyingRelationship();
        expect(relation.identifying).toBe(true);
        expect(relation.selection.selectAll("polygon").size()).toBe(2);

        diagram.contextmenuhandler.show(relation);
        diagram.toggleIdentifyingRelationship();
        expect(relation.identifying).toBe(false);
        expect(relation.selection.selectAll("polygon").size()).toBe(1);
    });

    it("toggles only apply to the matching node type", () => {
        const diagram = createDiagram();
        const attr = diagram.nodes.find(n => n.id === attrId)!;
        diagram.contextmenuhandler.show(attr);
        diagram.toggleWeakEntity();
        diagram.toggleIdentifyingRelationship();
        expect(attr.weak).toBeFalsy();
        expect(attr.identifying).toBeFalsy();

        const entity = diagram.nodes.find(n => n.id === entityId)!;
        diagram.contextmenuhandler.show(entity);
        diagram.togglePartialKey();
        expect(entity.partialKey).toBeFalsy();
    });

    it("partial keys may span several attributes and exclude the primary key", () => {
        const diagram = createDiagram();
        const attr = diagram.nodes.find(n => n.id === attrId)!;
        const otherAttr = diagram.nodes.find(n => n.id === otherAttrId)!;

        diagram.contextmenuhandler.show(attr);
        diagram.setPrimaryKey();
        expect(attr.primary).toBe(true);

        diagram.contextmenuhandler.show(attr);
        diagram.togglePartialKey();
        expect(attr.partialKey).toBe(true);
        expect(attr.primary).toBe(false);
        expect(attr.labelDiv!.style("text-decoration")).toContain("dashed");

        diagram.contextmenuhandler.show(otherAttr);
        diagram.togglePartialKey();
        expect(attr.partialKey).toBe(true);
        expect(otherAttr.partialKey).toBe(true);

        diagram.contextmenuhandler.show(attr);
        diagram.setPrimaryKey();
        expect(attr.primary).toBe(true);
        expect(attr.partialKey).toBe(false);
    });

    it("context menu shows the matching toggle with a state-dependent label", () => {
        const diagram = createDiagram();
        const entity = diagram.nodes.find(n => n.id === entityId)!;
        const weakBtn = document.getElementById("toggle-weak-entity")!;

        diagram.contextmenuhandler.show(entity);
        expect(weakBtn.style.display).toBe("block");
        expect(document.getElementById("toggle-partial-key")!.style.display).toBe("none");
        expect(document.getElementById("toggle-identifying-relation")!.style.display).toBe("none");
        expect(weakBtn.textContent).toBe("Mark as weak entity");

        diagram.toggleWeakEntity();
        diagram.contextmenuhandler.show(entity);
        expect(weakBtn.textContent).toBe("Mark as regular entity");
    });

    it("getStateSnapshot round-trips the weak / identifying / partial key flags", () => {
        const diagram = createDiagram();
        diagram.contextmenuhandler.show(diagram.nodes.find(n => n.id === entityId)!);
        diagram.toggleWeakEntity();
        diagram.contextmenuhandler.show(diagram.nodes.find(n => n.id === relationId)!);
        diagram.toggleIdentifyingRelationship();
        diagram.contextmenuhandler.show(diagram.nodes.find(n => n.id === attrId)!);
        diagram.togglePartialKey();

        diagram.loadConfig(diagram.getStateSnapshot());

        expect(diagram.nodes.find(n => n.id === entityId)!.weak).toBe(true);
        expect(diagram.nodes.find(n => n.id === relationId)!.identifying).toBe(true);
        expect(diagram.nodes.find(n => n.id === attrId)!.partialKey).toBe(true);
    });
});

describe("ERDiagram geometry helpers", () => {
    it("computeAnchor places the anchor on the entity's rectangular border towards the other node", () => {
        const diagram = createDiagram();
        // A 3-4-5 direction (400, 300) keeps both unit-vector components exactly
        // representable, unlike a pure horizontal/vertical offset.
        const entity = new ERNode({ id: "e1", type: "entity", text: "Entity", x: 0, y: 0, width: 120 }, 100, 100);
        const other = new ERNode({ id: "e2", type: "entity", text: "Entity", x: 400, y: 300, width: 120 }, 100, 100);

        const anchor = diagram.computeAnchor(entity, other, 7);
        // halfWidth=60 / unitX(0.8) = 75, halfHeight=30 / unitY(0.6) = 50 -> bounded by height.
        const t = 50;
        expect(anchor.x).toBeCloseTo((t + 7) * 0.8);
        expect(anchor.y).toBeCloseTo((t + 7) * 0.6);
    });

    it("calculateDistanceNodes returns the euclidean distance between two points", () => {
        const diagram = createDiagram();
        expect(diagram.calculateDistanceNodes({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
    });

    it("calculateDistance accounts for both nodes' anchor offsets plus the fixed margin", () => {
        const diagram = createDiagram();
        const a = new ERNode({ id: "e1", type: "entity", text: "Entity", x: 0, y: 0, width: 120 }, 100, 100);
        const b = new ERNode({ id: "e2", type: "entity", text: "Entity", x: 400, y: 300, width: 120 }, 100, 100);
        const link: ERLink = { source: a, target: b };

        // Each anchor sits (halfHeight / sinTheta + gap) = 50 + 7 = 57 away from its own
        // node's center (bounded by the entity's halfHeight along this 3-4-5 direction).
        const distance = diagram.calculateDistance(link);
        expect(distance).toBeCloseTo(57 + 57 + 100);
    });

    it("getDiagramBBox encloses all nodes with their type-specific half-extents", () => {
        const diagram = createDiagram();
        diagram.clear();
        diagram.nodes = [
            new ERNode({ id: "e1", type: "entity", text: "Entity", x: 0, y: 0, width: 120 }, 100, 100),
        ];
        const bbox = diagram.getDiagramBBox();
        // halfWidth = 60, halfHeight = 30, padding = 20
        expect(bbox.minX).toBeCloseTo(-60 - 20);
        expect(bbox.minY).toBeCloseTo(-30 - 20);
        expect(bbox.width).toBeCloseTo(120 + 40);
        expect(bbox.height).toBeCloseTo(60 + 40);
    });
});
