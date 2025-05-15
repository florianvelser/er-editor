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
        const isAttribute = node.type === 'attribute';
        const primaryBtn = document.getElementById('set-primary-key');
        const addBtn     = document.getElementById('add-attribute-button');
        primaryBtn.style.display = isAttribute ? 'block' : 'none';
        addBtn.style.display     = isAttribute ? 'none'  : 'block';
    
        this.contextnode = node;
        const menu = this.element;
        menu.style.display = 'block';
    
        const right = menu.offsetLeft + menu.offsetWidth;
        const bottom = menu.offsetTop + menu.offsetHeight;
        const overflowX = right  > window.innerWidth;
        const overflowY = bottom > window.innerHeight;
    
        const tx = overflowX ? -100 : 0;
        const ty = overflowY ? -100 : 0;
    
        menu.style.transform = `translate(${tx}%, ${ty}%)`;
    
        menu.focus();
    }

    hide() {
        this.element.style.display = 'none';
    }

    getContextNode() {
        return this.contextnode
    }
}