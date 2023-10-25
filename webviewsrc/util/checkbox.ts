import { fromEvent } from 'rxjs';
import { Subscriber } from "./event";

const checkboxes: Checkbox[] = [];

export function enableCheckboxes() {
    checkboxes.forEach(s => s.dispose());
    checkboxes.length = 0;

    const inputs = document.querySelectorAll('input[type=checkbox]');
    for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i] as HTMLInputElement;
        checkboxes.push(new Checkbox(input));
    }
}

export class Checkbox extends Subscriber {
    constructor(readonly input: HTMLInputElement, private text?: string) {
        super();
        this.init();
    }

    private init() {
        const id = this.input.id;
        let text = this.text ?? '';
        if (id) {
            const label = document.querySelector('label[for=' + JSON.stringify(id) + ']') as HTMLLabelElement;
            if (label) {
                label.classList.add('hidden');
                label.tabIndex = -1;
                text = label.textContent ?? '';
            }
        }

        const checkboxContainerOut = document.createElement('div');
        checkboxContainerOut.classList.add('checkbox-container-out');

        const checkboxContainer = document.createElement('div');
        checkboxContainer.classList.add('checkbox-container');
        checkboxContainerOut.appendChild(checkboxContainer);
        checkboxContainer.tabIndex = 0;
        checkboxContainer.setAttribute('role', 'checkbox');
        checkboxContainer.setAttribute('aria-checked', this.input.checked.toString());

        const checkbox = document.createElement('div');
        checkbox.classList.add('checkbox');
        checkbox.classList.add('codicon');
        checkbox.classList.add('codicon-check');
        checkboxContainer.appendChild(checkbox);

        const label = document.createElement('div');
        label.append(text);
        checkboxContainer.append(label);

        this.input.classList.add('hidden');
        this.input.tabIndex = -1;
        this.input.after(checkboxContainerOut);

        this.addSubscription({
            dispose: () => {
                checkboxContainerOut.remove();
            }
        });

        this.addEventHandlersForCheckBox(checkboxContainer, checkbox);
    }

    private addEventHandlersForCheckBox(checkboxContainer: HTMLDivElement, checkbox: HTMLDivElement) {
        const toggleValue = () => {
            this.input.checked = !this.input.checked;
            checkboxContainer.setAttribute('aria-checked', this.input.checked.toString());
            this.input.dispatchEvent(new Event('change'));
        };

        this.addSubscription(fromEvent<MouseEvent>(checkboxContainer, 'click').subscribe((e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleValue();
        }));

        this.addSubscription(fromEvent<KeyboardEvent>(checkboxContainer, 'keydown').subscribe((e) => {
            if (e.code === 'Enter' || e.code === 'Space') {
                e.preventDefault();
                toggleValue();
            }
        }));
    }
}
