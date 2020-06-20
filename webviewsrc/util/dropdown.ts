import { Disposable, asEvent, Subscriber, EventEmitter } from "./event";
import { feLocalize } from "./i18n";
import { Checkbox } from "./checkbox";

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
        this.select.classList.add('dropdown-opened');
        const options = this.select.querySelectorAll('option');
        const optionForDropdownMenu: Option[] = [];
        options.forEach(option => {
            if (!option.hidden) {
                optionForDropdownMenu.push({
                    text: option.textContent ?? '',
                    value: option.value,
                    selected: option.value === this.select.value,
                });
            }
        });

        const dropdownMenu = new DropdownMenu(optionForDropdownMenu);
        const dropdownMenuSubscriptions: Disposable[] = [ dropdownMenu ];

        dropdownMenuSubscriptions.push(dropdownMenu.onChanged(options => {
            const selectedOption = options.find(o => o.selected);
            if (selectedOption) {
                this.select.value = selectedOption.value;
                this.select.dispatchEvent(new Event('change'));
            }

            this.closeDropdown?.apply(this);
            setTimeout(() => this.select.focus(), 0);
        }));

        dropdownMenuSubscriptions.push(dropdownMenu.onClose(isKey => {
            if (isKey) {
                this.select.focus();
            }
            this.closeDropdown?.apply(this);
        }));

        this.closeDropdown = () => {
            this.select.classList.remove('dropdown-opened');
            dropdownMenu.hide();
            dropdownMenuSubscriptions.forEach(d => d.dispose());
            this.closeDropdown = undefined;
        };

        dropdownMenu.show(this.select);
    }
}

export class DivDropdown extends Subscriber {
    private closeDropdown: (() => void) | undefined = undefined;
    
    private onChangeEmitter = new EventEmitter<readonly string[]>();
    public onChange = this.onChangeEmitter.event;

    public selectedValues: readonly string[] = [];

    constructor(readonly select: HTMLDivElement, private multiSelection: boolean = false) {
        super();
        this.init();
    }

    public setSelection(value: string | string[]) {
        if (typeof value === 'string') {
            this.selectedValues = [value];
        } else {
            this.selectedValues = value;
        }

        this.onChangeEmitter.fire(this.selectedValues);

        const options = this.getOptions();
        this.updateSelectedValue(options);
    }

    public selectAll() {
        const options = this.getOptions();
        const values: string[] = [];
        options.forEach(option => {
            option.selected = true;
            values.push(option.value);
        });

        this.selectedValues = values;
        this.onChangeEmitter.fire(this.selectedValues);

        this.updateSelectedValue(options);
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

        const options = this.getOptions();
        this.updateSelectedValue(options);
    }

    private showSelectionsForDropdown() {
        this.select.classList.add('dropdown-opened');

        const dropdownMenu = new DropdownMenu(this.getOptions(), this.multiSelection);
        const dropdownMenuSubscriptions: Disposable[] = [ dropdownMenu ];

        dropdownMenuSubscriptions.push(dropdownMenu.onChanged(options => {
            this.updateSelectedValue(options);
            this.selectedValues = options.filter(o => o.selected).map(o => o.value);
            this.onChangeEmitter.fire(this.selectedValues);
            if (!this.multiSelection) {
                this.closeDropdown?.apply(this);
                setTimeout(() => this.select.focus(), 0);
            }
        }));

        dropdownMenuSubscriptions.push(dropdownMenu.onClose(isKey => {
            if (isKey) {
                this.select.focus();
            }
            this.closeDropdown?.apply(this);
        }));

        this.closeDropdown = () => {
            this.select.classList.remove('dropdown-opened');
            dropdownMenu.hide();
            dropdownMenuSubscriptions.forEach(d => d.dispose());
            this.closeDropdown = undefined;
        };

        dropdownMenu.show(this.select);
    }

    private getOptions(): Option[] {
        const options = this.select.querySelectorAll('.option');
        const optionForDropdownMenu: Option[] = [];
        options.forEach(option => {
            if (!option.hasAttribute('hidden')) {
                const value = option.getAttribute('value');
                optionForDropdownMenu.push({
                    text: option.textContent ?? '',
                    value: value ?? '',
                    selected: value !== null ? this.selectedValues.includes(value) : false,
                });
            }
        });

        return optionForDropdownMenu;
    }

    private updateSelectedValue(options: Option[]) {
        const selectedOptions = options.filter(o => o.selected);
        const valueSpan = this.select.querySelector('span.value') as HTMLSpanElement;
        valueSpan.textContent = selectedOptions.length === 0 ? feLocalize('combobox.noselection', '(No selection)') :
            selectedOptions.length === options.length ? feLocalize('combobox.all', '(All)') :
            selectedOptions.length > 1 ? feLocalize('combobox.multiple', '{0} (+{1})', selectedOptions[0].text, selectedOptions.length - 1) :
            selectedOptions[0].text;
    }
}

type Option = { text: string, value: string, selected: boolean };
class DropdownMenu extends Subscriber {
    private onChangedEmitter = new EventEmitter<Option[]>();
    public onChanged = this.onChangedEmitter.event;
    private onCloseEmitter = new EventEmitter<boolean>();
    public onClose = this.onCloseEmitter.event;

    private list: HTMLUListElement;
    private items: HTMLLIElement[] = [];
    private subscriptionWhenOpen: Disposable[] = [];

    constructor(private options: Option[], private multiSelection: boolean = false) {
        super();
        this.list = this.createList();
        this.subscriptions.push({
            dispose: () => {
                this.list.remove();
            }
        });
    }

    public show(host: Element) {
        this.hide();
        const bbox = host.getBoundingClientRect();
        this.list.style.left = bbox.left + 'px';
        this.list.style.top = bbox.bottom + 'px';
        this.list.style.width = bbox.width + 'px';
        this.registerEventHandlerWhenOpen(host);
        document.body.appendChild(this.list);

        const selectedOptionIndex = this.multiSelection ? 0 : Math.max(0, this.options.findIndex(o => o.selected));
        if (this.items.length > 0) {
            this.items[selectedOptionIndex].focus();
        }
    }

    public hide() {
        this.list.parentElement?.removeChild(this.list);
        this.subscriptionWhenOpen.forEach(s => s.dispose());
    }

    private createList(): HTMLUListElement {
        const options = this.options;
        const list = document.createElement('ul');
        list.classList.add('select-dropdown');

        const items = this.items;
    
        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            const item = this.createDropdownItem(option, i, items);
            list.appendChild(item);
        }

        return list;
    }

    private createDropdownItem(option: Option, index: number, items: HTMLLIElement[]): HTMLLIElement {
        const item = document.createElement('li');
        item.setAttribute('role', 'option');
        item.tabIndex = -1;

        if (this.multiSelection) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = option.selected;

            item.appendChild(checkbox);
            const checkboxItem = new Checkbox(checkbox, option.text);
            this.subscriptions.push(checkboxItem);

            asEvent(checkbox, 'change')(() => {
                option.selected = checkbox.checked;
                this.onChangedEmitter.fire(this.options);
            });

            asEvent(item, 'click')((e) => {
                if (e.target === item) {
                    checkbox.click();
                }
            });

            asEvent(item, 'keydown')((e) => {
                if (e.target === item && (e.code === 'Enter' || e.code === 'Space')) {
                    e.preventDefault();
                    checkbox.click();
                }
            });

        } else {
            item.textContent = option.text;
            const updateValue = () => {
                this.options.forEach(o => o.selected = false);
                option.selected = true;
                this.onChangedEmitter.fire(this.options);
            };

            asEvent(item, 'click')(updateValue);

            asEvent(item, 'keydown')((e) => {
                if (e.code === 'Enter') {
                    e.preventDefault();
                    updateValue();
                }
            });
        }

        asEvent(item, 'mouseenter')(() => {
            item.focus();
        });

        asEvent(item, 'keydown')((e) => {
            if (e.code === 'ArrowDown' && index < items.length - 1) {
                e.preventDefault();
                items[index + 1].focus();
            } else if (e.code === 'ArrowUp' && index > 0) {
                e.preventDefault();
                items[index - 1].focus();
            }
        });

        items.push(item);

        return item;
    }

    private registerEventHandlerWhenOpen(host: Element) {
        const closeDropdown = (eacapeKey: boolean = false) => {
            this.onCloseEmitter.fire(eacapeKey);
            this.hide();
        };

        this.subscriptionWhenOpen.push(asEvent(window, 'blur')(() => {
            closeDropdown();
        }));

        this.subscriptionWhenOpen.push(asEvent(window, 'focusin')((e) => {
            if (!(this.list.contains(e.target as any) || host.contains(e.target as any))) {
                closeDropdown();
            }
        }));

        this.subscriptionWhenOpen.push(asEvent(window, 'mousedown')((e) => {
            if (!(this.list.contains(e.target as any) || host.contains(e.target as any))) {
                closeDropdown();
            }
        }));

        this.subscriptionWhenOpen.push(asEvent(window, 'keydown')((e) => {
            if (e.code === 'Escape') {
                closeDropdown(true);
            }
        }));
    }
}
