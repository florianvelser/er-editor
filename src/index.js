import { ERDiagram } from "./diagram";

const topOffset = 36;
const bottomOffset = 36;

const er_diagram = new ERDiagram(
    "svg",
    window.innerWidth,
    document.documentElement.clientHeight - topOffset - bottomOffset
)

const zoomRange = document.getElementById('zoom-level');
const zoomText = document.getElementById('zoom-text');
const downloadDocumentButton = document.getElementById('download-json');
const uploadDocumentButton = document.getElementById('upload-json-btn');
const newDocumentButton = document.getElementById('diagram-new');
const addEntityButton = document.getElementById('add-entity');
const undoButton = document.getElementById('undo-btn');
const redoButton = document.getElementById('redo-btn');
const resetViewButton = document.getElementById('reset-view');
const viewFitContentButton = document.getElementById('fit-content');
const backToContentButton = document.getElementById('back-to-content');
const exportPNGButton = document.getElementById('export-png');
const exportWEBPButton = document.getElementById('export-webp');
const exportJPEGButton = document.getElementById('export-jpeg');
const exportSVGButton = document.getElementById('export-svg');

zoomRange.value = 50;

zoomRange.addEventListener("input", function() {
    er_diagram.setZoom(zoomRange.value);
}, false);

er_diagram.onZoom = function(zoom) {
    const minLog = Math.log10(0.1);
    const maxLog = Math.log10(10);
    zoomRange.value = ((Math.log10(zoom) - minLog) / (maxLog - minLog)) * 100;
    zoomText.innerText = Math.round(zoom * 100) + "%";
}

window.addEventListener("resize", function () {
    er_diagram.setDimensions(
        this.window.innerWidth,
        this.window.innerHeight - topOffset - bottomOffset
    )
});

downloadDocumentButton.addEventListener("click", function () {
    er_diagram.downloadDocument();
});

uploadDocumentButton.addEventListener("click", function () {
    er_diagram.uploadDocument();
});

newDocumentButton.addEventListener("click", function () {
    er_diagram.clear();
});

addEntityButton.addEventListener("click", function () {
    er_diagram.addEntity();
});

undoButton.addEventListener("click", function () {
    er_diagram.undo();
});

redoButton.addEventListener("click", function () {
    er_diagram.redo();
});

resetViewButton.addEventListener("click", function () {
    er_diagram.resetView();
});

viewFitContentButton.addEventListener("click", function () {
    er_diagram.fitToContent();
});

backToContentButton.addEventListener("click", function () {
    er_diagram.fitToContent();
});

exportPNGButton.addEventListener("click", function () {
    er_diagram.renderImage('png', 1, 2);
});

exportJPEGButton.addEventListener("click", function () {
    er_diagram.renderImage('jpeg', 1, 2);
});

exportWEBPButton.addEventListener("click", function () {
    er_diagram.renderImage('webp', 1, 2);
});

exportSVGButton.addEventListener("click", function () {
    er_diagram.renderSVG();
});