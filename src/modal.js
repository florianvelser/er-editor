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

export class ExportModal {
    constructor({ imageSrc = '' }) {
        this.modal = document.getElementById('export-modal');
        this.backdrop = this.modal.querySelector('#export-backdrop');
        this.imageEl = this.modal.querySelector('.export-image');
        this.transparentCheckbox = this.modal.querySelector('#opt-transparent');
        this.scaleControl = this.modal.querySelector('#opt-scale');
        this.formatButtons = Array.from(this.modal.querySelectorAll('.export-actions .btn'));
        this.indicator = this.scaleControl.querySelector('.indicator');
        this._promiseResolve = null;

        // Set initial image source
        this.imageEl.src = imageSrc;

        // Initialize events
        this._attachEvents();

        // Apply initial checkered state
        this._updateCheckered();
    }

    _attachEvents() {
        this.backdrop.addEventListener('click', () => this._close(null));
        this.formatButtons.forEach(btn => btn.addEventListener('click', () => {
            const format = btn.dataset.format;
            this._close(this._gatherOptions(format));
        }));
        this.scaleControl.querySelectorAll('.segment').forEach(seg => {
            seg.addEventListener('click', () => this._selectScale(seg));
        });

        this.transparentCheckbox.addEventListener('change', () => this._updateCheckered());
    }

    _resetScaleToDefault() {
        // Clear active on all segments
        this.scaleControl.querySelectorAll('.segment.active').forEach(seg =>
            seg.classList.remove('active')
        );
        // Activate default 3x
        const defaultSeg = this.scaleControl.querySelector('.segment[data-value="3"]');
        if (defaultSeg) defaultSeg.classList.add('active');
    }

    _selectScale(seg) {
        const current = this.scaleControl.querySelector('.segment.active');
        if (current) current.classList.remove('active');
        seg.classList.add('active');
        this.scale = Number(seg.dataset.value);
        this._animateIndicator(seg);
    }

    _moveIndicator(target) {
        const style = getComputedStyle(this.scaleControl);
        const pad = parseInt(style.paddingLeft, 10);
        this.indicator.style.left = (target.offsetLeft + pad) + 'px';
        this.indicator.style.width = (target.offsetWidth - pad * 2) + 'px';
    }

    _animateIndicator(target) {
        // Animate using CSS transition
        this._moveIndicator(target);
    }

    _updateCheckered() {
        if (this.transparentCheckbox.checked) {
            this.imageEl.classList.add('checkered');
        } else {
            this.imageEl.classList.remove('checkered');
        }
    }

    _gatherOptions(format) {
        return {
            transparent: this.transparentCheckbox.checked,
            scale: this.scale,
            format
        };
    }

    show() {
        // Reset to default on each open
        this._resetScaleToDefault();

        // Show modal
        this.modal.style.display = 'block';
        this.transparentCheckbox.checked = false;
        this.imageEl.classList.remove('checkered');

        // Immediately position indicator without transition
        const active = this.scaleControl.querySelector('.segment.active');
        if (active) {
            // Temporarily disable transition
            const originalTransition = this.indicator.style.transition;
            this.indicator.style.transition = 'none';

            // Position the indicator
            this._moveIndicator(active);

            // Force reflow to apply changes immediately
            // eslint-disable-next-line no-unused-expressions
            this.indicator.offsetHeight;

            // Restore transition
            this.indicator.style.transition = originalTransition || 'left 0.3s ease, width 0.3s ease';

            // Set scale value
            this.scale = Number(active.dataset.value);
        }

        return new Promise(res => this._promiseResolve = res);
    }

    _close(result) {
        this.modal.style.display = 'none';
        if (this._promiseResolve) { this._promiseResolve(result); this._promiseResolve = null; }
    }
}