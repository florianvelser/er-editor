import { ERDiagram } from "./diagram";

const topOffset = 36;
const bottomOffset = 36;

const er_diagram = new ERDiagram(
    "svg",
    window.innerWidth,
    document.documentElement.clientHeight - topOffset - bottomOffset
)

window.addEventListener("resize", function () {
    er_diagram.setDimensions(
        this.window.innerWidth,
        this.window.innerHeight - topOffset - bottomOffset
    )
});