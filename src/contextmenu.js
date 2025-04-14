export class Contextmenu {
    constructor() {
        this.contextnode = null
        this.element = document.getElementById('contextmenu');
        this.element.addEventListener('blur', (event) => {
            this.hide();
        });
    }

    setPosition(x, y) {
        this.element.style.left = x + 'px';
        this.element.style.top = y + 'px';
    }

    show(node) {
        this.contextnode = node
        this.element.style.display = 'block';
        this.element.focus();
    }

    hide() {
        this.element.style.display = 'none';
    }

    getContextNode() {
        return this.contextnode
    }
}