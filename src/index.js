import { ERDiagram } from "./diagram";
import { InputModal, ExportModal, ConfirmModal } from "./modal";

const er_diagram = new ERDiagram(
    "svg",
    window.innerWidth,
    document.documentElement.clientHeight
)

const zoomText = document.getElementById('zoom-text');
const downloadDocumentButton = document.getElementById('download-json');
const uploadDocumentButton = document.getElementById('upload-json-btn');
const newDocumentButton = document.getElementById('diagram-new');
const addEntityButton = document.getElementById('add-entity');
const undoButton = document.getElementById('undo-btn');
const redoButton = document.getElementById('redo-btn');
const viewFitContentButton = document.getElementById('fit-content');
const backToContentButton = document.getElementById('back-to-content');
const exportButton = document.getElementById('export-png');
const renameProjectButton = document.getElementById('projectname');

const decreaseZoomButton = document.getElementById('decrease-zoom');
const increaseZoomButton = document.getElementById('increase-zoom');

er_diagram.onZoom = function(zoom) {
    zoomText.innerText = Math.round(zoom * 100) + "%";
}

window.addEventListener("resize", function () {
    er_diagram.setDimensions(
        window.innerWidth,
        window.innerHeight
    )
});

downloadDocumentButton.addEventListener("click", function () {
    er_diagram.downloadDocument();
});

uploadDocumentButton.addEventListener("click", function () {
    er_diagram.uploadDocument();
});

newDocumentButton.addEventListener("click", function () {
    const confirm = new ConfirmModal({
        title: 'New document',
        text: 'Are you sure you want to create a new document? The current document wont be saved.'
    });
    confirm.show().then(confirmed => {
        if (confirmed) {
            er_diagram.clear();
        }
    });
});

increaseZoomButton.addEventListener("click", function () {
    er_diagram.increaseZoom();
});

decreaseZoomButton.addEventListener("click", function () {
    er_diagram.decreaseZoom();
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

viewFitContentButton.addEventListener("click", function () {
    er_diagram.fitToContent();
});

backToContentButton.addEventListener("click", function () {
    er_diagram.fitToContent();
});

exportButton.addEventListener("click", function () {
    er_diagram.getRenderPreview().then(dataUrl => {
        const exp = new ExportModal({ imageSrc: dataUrl });
        exp.show().then(opts => {
            if (opts) {
                switch (opts.format) {
                    case 'png':
                        er_diagram.renderImage('png', 1, opts.scale, opts.transparent);
                        break;
                    case 'jpeg':
                        er_diagram.renderImage('jpeg', 1, opts.scale, false);
                        break;
                    case 'webp':
                        er_diagram.renderImage('webp', 1, opts.scale, opts.transparent);
                        break;
                    case 'svg':
                        er_diagram.renderSVG();
                        break;
                }
            }
        });
    });
});

renameProjectButton.addEventListener("click", function () {
    const input = new InputModal({ title: 'Rename', text: 'Enter new name', placeholder: 'Name...', defaultValue: er_diagram.getName() });
    input.show().then(value => {
        if (value) {
            er_diagram.setName(value);
        }
    });
});