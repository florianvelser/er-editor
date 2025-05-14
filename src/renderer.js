import d3SvgToPng from 'd3-svg-to-png';
import opentype from 'opentype.js';

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
        this.interFontUrl = 'fonts/Inter_28pt-Regular.ttf';
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

    async downloadStandaloneSVG(fileName) {
        const svgString = await this._prepareStandaloneSVGString();
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName || `${this.projectName}.svg`;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            link.remove();
        }, 100);
    }

    async _prepareStandaloneSVGString() {
        // 1) Klonen & Größe/ViewBox setzen
        const bbox = this.diagram.getDiagramBBox();
        const originalSvg = this.diagram.svg.node();
        const clonedSvg = originalSvg.cloneNode(true);
        clonedSvg.setAttribute('width', `${bbox.width}px`);
        clonedSvg.setAttribute('height', `${bbox.height}px`);
        clonedSvg.setAttribute('viewBox', `0 0 ${bbox.width} ${bbox.height}`);

        // 2) Inhalte verschieben (falls diagramm nicht bei 0/0 startet)
        const gMain = clonedSvg.querySelector('.gMain');
        if (gMain) {
            gMain.setAttribute('transform', `translate(${-bbox.minX},${-bbox.minY})`);
        }

        // 3) Linien‐Styling
        clonedSvg.querySelectorAll('line').forEach(line => {
            line.setAttribute('stroke-linecap', 'round');
            line.setAttribute('stroke', '#999');
        });

        // 4) foreignObject entfernen & Text extrahieren
        await this._convertForeignObjects(clonedSvg);

        // 5) alle <text> → Pfade
        await this._convertTextToOutlines(clonedSvg);

        // 6) Namespaces + XML‐Header
        let svgString = new XMLSerializer().serializeToString(clonedSvg);
        if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
            svgString = svgString.replace(
                /^<svg/,
                '<svg xmlns="http://www.w3.org/2000/svg"'
            );
        }
        if (!svgString.includes('xmlns:xlink="http://www.w3.org/1999/xlink"')) {
            svgString = svgString.replace(
                /^<svg/,
                '<svg xmlns:xlink="http://www.w3.org/1999/xlink"'
            );
        }
        return '<?xml version="1.0" standalone="no"?>\n' + svgString;
    }

    async _convertForeignObjects(svgEl) {
        const font = await opentype.load(this.interFontUrl);
        const fobjs = Array.from(svgEl.querySelectorAll('foreignObject'));

        for (const fo of fobjs) {
            const txt = fo.textContent?.trim() || '';
            if (!txt) { fo.remove(); continue; }

            const x = parseFloat(fo.getAttribute('x') || '0');
            const y = parseFloat(fo.getAttribute('y') || '0');
            const w = parseFloat(fo.getAttribute('width') || '0');
            const h = parseFloat(fo.getAttribute('height') || '0');

            const style = fo.querySelector('div')?.getAttribute('style') || '';
            const fontSize = (style.match(/font-size:\s*(\d+)px/)?.[1] || 12) * 1;
            const fill = style.match(/color:\s*(#[0-9A-Fa-f]{3,6})/)?.[1] || '#000';
            const underline = /text-decoration\s*:\s*underline/.test(style);

            // Vertikale Mitte + descent-Korrektur
            const cy = y + h / 2 + fontSize * 0.35;

            // 1) Pfad bei x=0 erzeugen, um Breite zu messen
            const tempPath = font.getPath(txt, 0, cy, fontSize, { kerning: true });
            const bbox = tempPath.getBoundingBox();
            const textWidth = bbox.x2 - bbox.x1;

            // 2) Start-X berechnen
            const startX = x + (w - textWidth) / 2 - bbox.x1;

            // 3) Finalen Textpfad erzeugen
            const finalPath = font.getPath(txt, startX, cy, fontSize, { kerning: true });
            const d = finalPath.toPathData(2);

            const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathEl.setAttribute('d', d);
            pathEl.setAttribute('fill', fill);

            // 4) Optional: Unterstreichung als <line> hinzufügen
            const groupEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            groupEl.appendChild(pathEl);

            if (underline) {
                const underlineY = cy + fontSize * 0.15; // kleine Verschiebung unter Text
                const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                lineEl.setAttribute('x1', startX);
                lineEl.setAttribute('x2', startX + textWidth);
                lineEl.setAttribute('y1', underlineY);
                lineEl.setAttribute('y2', underlineY);
                lineEl.setAttribute('stroke', fill);
                lineEl.setAttribute('stroke-width', Math.max(1, fontSize * 0.07)); // dynamisch
                groupEl.appendChild(lineEl);
            }

            fo.parentNode?.replaceChild(groupEl, fo);
        }
    }


    async _convertTextToOutlines(svgEl) {
        const font = await opentype.load(this.interFontUrl);
        const texts = Array.from(svgEl.querySelectorAll('text'));
        for (const textEl of texts) {
            const txt = textEl.textContent || '';
            const rawX = parseFloat(textEl.getAttribute('x') || '0');
            const rawY = parseFloat(textEl.getAttribute('y') || '0') + 3;
            const style = window.getComputedStyle(textEl);
            const fontSize = parseFloat(style.fontSize) || 12;
            const fill = textEl.getAttribute('fill') || style.fill || '#000';

            // 1) erst bei x=0 messen
            const temp = font.getPath(txt, 0, rawY, fontSize, { kerning: true });
            const bb = temp.getBoundingBox();
            const tw = bb.x2 - bb.x1;

            // 2) wenn text-anchor="middle": rawX ist die Ziel-Mitte
            // andernfalls: rawX ist linker Rand – Du kannst hier je nach Use-Case anpassen
            const isMiddle = textEl.getAttribute('text-anchor') === 'middle';
            const startX = isMiddle
                ? rawX - tw / 2 - bb.x1
                : rawX - bb.x1;

            const pathObj = font.getPath(txt, startX, rawY, fontSize, { kerning: true });
            const d = pathObj.toPathData(2);

            const pathEl = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'path'
            );
            pathEl.setAttribute('d', d);
            pathEl.setAttribute('fill', fill);

            textEl.parentNode?.replaceChild(pathEl, textEl);
        }
    }

}
