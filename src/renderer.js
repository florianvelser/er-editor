import d3SvgToPng from 'd3-svg-to-png';

/**
 * Class for exporting an ERDiagram instance as an image.
 */
export class ERDiagramImageRenderer {
    /**
     * @param {ERDiagram} diagram - The diagram instance containing the D3 SVG elements.
     * @param {string} projectName - The project name used in the image file.
     */
    constructor(diagram, projectName) {
        this.diagram = diagram;
        this.projectName = projectName;
    }

    /**
     * Exports the diagram as an image.
     *
     * @param {string} format - The image format (e.g., 'png').
     * @param {number} quality - The quality parameter for the conversion.
     */
    exportImage(format, quality, scale) {
        // Get the bounding box of the diagram content from the diagram instance.
        const bbox = this.diagram.getDiagramBBox();

        // Retrieve the original SVG element from the diagram.
        const originalSvg = this.diagram.svg.node();
        // Clone the entire SVG to leave the current view unchanged.
        const clonedSvg = originalSvg.cloneNode(true);

        // Adjust the cloned SVG to tightly fit the content.
        clonedSvg.setAttribute('width', bbox.width);
        clonedSvg.setAttribute('height', bbox.height);

        // Translate the main group to ensure content is properly positioned.
        const gMain = clonedSvg.querySelector('.gMain');
        if (gMain) {
            gMain.style.transform = `translate(${bbox.minX * -1}px, ${bbox.minY * -1}px)`;
        }

        // Create a watermark element.
        const svgNS = "http://www.w3.org/2000/svg";
        const watermark = document.createElementNS(svgNS, "text");
        watermark.textContent = "Created with ermodell";
        watermark.setAttribute("x", "5");
        watermark.setAttribute("y", bbox.height - 5);
        watermark.setAttribute("dominant-baseline", "text-after-edge");
        watermark.style.fontSize = "10px";
        watermark.setAttribute("fill", "rgba(0,0,0,0.5)");

        // Append the watermark to the cloned SVG.
        clonedSvg.appendChild(watermark);

        // Temporarily assign an ID to the cloned SVG and add it to the document.
        clonedSvg.setAttribute('id', 'clonedSvg');
        document.body.appendChild(clonedSvg);

        // Trigger conversion of the SVG to PNG.
        d3SvgToPng('#clonedSvg', this.projectName, {
            scale: scale,
            format: format,
            quality: quality,
            download: true,
            ignore: '.ignored',
            background: 'white'
        });

        // Remove the temporary cloned SVG from the document.
        document.getElementById('clonedSvg').remove();
    }

    generateStandaloneSVG() {
        // Get the bounding box of the diagram content.
        const bbox = this.diagram.getDiagramBBox();

        // Retrieve the original SVG element from the diagram.
        const originalSvg = this.diagram.svg.node();
        // Clone the SVG element.
        const clonedSvg = originalSvg.cloneNode(true);

        // Set the cloned SVG dimensions to match the content exactly.
        clonedSvg.setAttribute('width', bbox.width);
        clonedSvg.setAttribute('height', bbox.height);
    
        // Adjust the main group to align the diagram properly.
        const gMain = clonedSvg.querySelector('.gMain');
        if (gMain) {
            gMain.style.transform = `translate(${bbox.minX * -1}px, ${bbox.minY * -1}px)`;
        }

        // ➤ Set stroke-linecap="round" on all <line> elements
        const lines = clonedSvg.querySelectorAll('line');
        lines.forEach(line => {
            line.setAttribute('stroke-linecap', 'round');
            line.setAttribute('stroke', '#999');
        });

        clonedSvg.style.cursor = "default";

        const fontStyle = `
            <style type="text/css">
                @import url('https://fonts.googleapis.com/css?family=Inter');
                text, div {
                    font-family: 'Inter', sans-serif;
                    font-size: 12px;
                }
            </style>
        `;

        // Serialize the SVG as a string.
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(clonedSvg);

        // Insert the font style after the opening <svg ...> tag.
        svgString = svgString.replace(/<svg([^>]*)>/, `<svg$1>${fontStyle}`);
    
        // Ensure the SVG namespace is declared.
        if (!svgString.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
            svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        if (!svgString.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/1999\/xlink"/)) {
            svgString = svgString.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
        }
    
        // Optionally add an XML declaration to ensure it's recognized as a standalone SVG.
        svgString = '<?xml version="1.0" standalone="no"?>\n' + svgString;
    
        return svgString;
    }
    

    downloadStandaloneSVG(fileName) {
        const svgString = this.generateStandaloneSVG();

        // Create a Blob from the SVG string.
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        // Create a temporary link element to trigger the download.
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = fileName || `${this.projectName}.svg`;
        document.body.appendChild(downloadLink);
        downloadLink.click();

        // Clean up by revoking the object URL and removing the temporary link.
        setTimeout(() => {
            URL.revokeObjectURL(url);
            downloadLink.remove();
        }, 100);
    }
}
