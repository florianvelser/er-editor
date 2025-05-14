class ModalBase {
    constructor({ title = '', text = '', onConfirm = null }) {
        this.modal = document.getElementById('modal');
        this.titleEl = this.modal.querySelector('#modal-title');
        this.textEl = this.modal.querySelector('.modal-text');
        this.controlContainer = this.modal.querySelector('.modal-control');
        this.cancelBtn = this.modal.querySelector('#modal-cancel');
        this.confirmBtn = this.modal.querySelector('#modal-confirm');
        this.backdrop = this.modal.querySelector('#modal-backdrop');

        this.titleEl.textContent = title;
        this.textEl.textContent = text;
        this.onConfirm = onConfirm;
        this._promiseResolve = null;

        this._attachCommonEvents();
    }

    _attachCommonEvents() {
        this.cancelBtn.addEventListener('click', () => this._close(null));
        this.backdrop.addEventListener('click', () => this._close(null));
        this.confirmBtn.addEventListener('click', () => this._close(this.getResult()));
    }

    // to be overridden by subclasses
    renderControl() {
        throw new Error('renderControl() must be implemented by subclass');
    }

    // to be overridden by subclasses, returns data on confirm
    getResult() {
        return null;
    }

    show() {
        this.renderControl();
        return new Promise(resolve => {
            this._promiseResolve = resolve;
            this.modal.style.display = 'block';
            this.modal.focus();
        });
    }

    _close(result) {
        this.modal.style.display = 'none';
        if (this._promiseResolve) {
            this._promiseResolve(result);
            this._promiseResolve = null;
        }
    }
}

export class SelectModal extends ModalBase {
    constructor(opts) {
        super(opts);
        this.options = opts.options;
        this.selected = opts.defaultOption || opts.options[0];
    }

    renderControl() {
        this.controlContainer.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'segmented-control';
        wrapper.style.padding = '4px 2px';
        const indicator = document.createElement('div');
        indicator.className = 'indicator';
        wrapper.appendChild(indicator);

        this.options.forEach(opt => {
            const seg = document.createElement('div');
            seg.className = 'segment';
            seg.textContent = opt;
            seg.dataset.value = opt;
            if (opt === this.selected) seg.classList.add('active');
            seg.addEventListener('click', () => this._select(seg));
            wrapper.insertBefore(seg, indicator);
        });

        this.controlContainer.appendChild(wrapper);
        this.control = wrapper;
        this.indicator = indicator;
    }

    show() {
        this.renderControl();
        // disable transition for initial render
        this.indicator.style.transition = 'none';
        this.modal.style.display = 'block';
        this.modal.focus();

        return new Promise(resolve => {
            this._promiseResolve = resolve;
            // position indicator in next frame
            requestAnimationFrame(() => {
                const active = this.control.querySelector('.segment.active');
                this._moveIndicator(active);
                // force reflow
                this.indicator.getBoundingClientRect();
                // restore transition
                this.indicator.style.transition = 'left 0.3s ease, width 0.3s ease';
            });
        });
    }

    _select(seg) {
        const prev = this.control.querySelector('.segment.active');
        if (prev) prev.classList.remove('active');
        seg.classList.add('active');
        this.selected = seg.dataset.value;
        this._moveIndicator(seg);
    }

    _moveIndicator(target) {
        const style = getComputedStyle(this.control);
        const padL = parseInt(style.paddingLeft);
        const padR = parseInt(style.paddingRight);
        const left = target.offsetLeft + padL;
        const width = target.offsetWidth - padL - padR;
        this.indicator.style.left = left + 'px';
        this.indicator.style.width = width + 'px';
    }

    getResult() {
        return this.selected;
    }
}

export class InputModal extends ModalBase {
    constructor(opts) {
        super(opts);
        this.placeholder = opts.placeholder || '';
        this.defaultValue = opts.defaultValue || '';
    }

    renderControl() {
        this.controlContainer.innerHTML = '';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'input-control';
        input.value = this.defaultValue;
        input.placeholder = this.placeholder;
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        this.controlContainer.appendChild(input);
        this.input = input;
        // focus
        setTimeout(() => input.focus(), 0);
    }

    getResult() {
        return this.input.value;
    }
}