import { Disposable, asEvent, Subscriber } from "./event";

const dropdowns: Dropdown[] = [];

export function enableDropdowns() {
    dropdowns.forEach(s => s.dispose());
    dropdowns.length = 0;

    const selects = document.querySelectorAll('.select-container > select');
    for (let i = 0; i < selects.length; i++) {
        const select = selects[i] as HTMLSelectElement;
        dropdowns.push(new Dropdown(select));
    }
}

class Dropdown extends Subscriber {
    private closeDropdown: (() => void) | undefined = undefined;

    constructor(readonly select: HTMLSelectElement) {
        super();
        this.init();
    }

    private init() {
        this.subscriptions.push(asEvent(this.select, 'mousedown')(e => {
            e.preventDefault();
            this.select.focus();
            if (this.closeDropdown) {
                this.closeDropdown();
            } else {
                this.showSelectionsForDropdown();
            }
        }));
        this.subscriptions.push(asEvent(this.select, 'keydown')(e => {
            if (e.code === 'Enter') {
                e.preventDefault();
                if (this.closeDropdown) {
                    this.closeDropdown();
                } else {
                    this.showSelectionsForDropdown();
                }
            }
        }));
    }

    private showSelectionsForDropdown() {
        const select = this.select;
        const options = select.querySelectorAll('option');
        const list = document.createElement('ul');
        const bbox = select.getBoundingClientRect();
        list.classList.add('select-dropdown');
        list.style.left = bbox.left + 'px';
        list.style.top = bbox.bottom + 'px';
        list.style.width = bbox.width + 'px';
        
        document.body.appendChild(list);

        const items: HTMLLIElement[] = [];
    
        for (let i = 0; i < options.length; i++) {
            const option = options[i] as HTMLOptionElement;
            const item = document.createElement('li');
            const index = i;
            item.textContent = option.textContent;
            item.tabIndex = -1;

            const updateValue = () => {
                select.value = option.value;
                select.dispatchEvent(new Event('change'));
                this.closeDropdown?.apply(this);
                setTimeout(() => select.focus(), 0);
            };

            asEvent(item, 'click')(updateValue);

            asEvent(item, 'mouseenter')(() => {
                item.focus();
            });

            asEvent(item, 'keydown')((e) => {
                if (e.code === 'ArrowDown' && index < items.length - 1) {
                    items[index + 1].focus();
                } else if (e.code === 'ArrowUp' && index > 0) {
                    items[index - 1].focus();
                } else if (e.code === 'Enter') {
                    updateValue();
                }
            });
    
            list.appendChild(item);

            if (option.selected) {
                item.focus();
            }

            items.push(item);
        }

        const dropdownSubscriptions: Disposable[] = [];
        this.closeDropdown = () => {
            list.remove();
            dropdownSubscriptions.forEach(d => d.dispose());
            this.closeDropdown = undefined;
        };

        dropdownSubscriptions.push(asEvent(window, 'blur')(() => {
            this.closeDropdown?.apply(this);
        }));

        dropdownSubscriptions.push(asEvent(window, 'focusin')((e) => {
            if (!(list.contains(e.target as any) || select === e.target)) {
                this.closeDropdown?.apply(this);
            }
        }));

        dropdownSubscriptions.push(asEvent(window, 'mousedown')((e) => {
            if (!(list.contains(e.target as any) || select === e.target)) {
                this.closeDropdown?.apply(this);
            }
        }));

        dropdownSubscriptions.push(asEvent(window, 'keydown')((e) => {
            if (e.code === 'Escape') {
                select.focus();
                this.closeDropdown?.apply(this);
            }
        }));
    }
}
