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