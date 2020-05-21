export type Disposable = { dispose(): void };
export type IEvent<T> = (callback: (param: T) => void) => Disposable;
export type IEventWithThis<T, TThis> = (callback: (this: TThis, param: T) => void) => Disposable;

export class EventEmitter<T> {
    private handlers: ((param: T) => void)[] = [];
    public event: IEvent<T> = callback => {
        this.handlers.push(callback);
        return {
            dispose: () => {
                const index = this.handlers.indexOf(callback);
                if (index >= 0) {
                    this.handlers.splice(index, 1);
                }
            }
        };
    };

    public fire(param: T): void {
        this.handlers.forEach(h => {
            try {
                h(param);
            } catch (e) {
                console.error(e);
            }
        });
    }
}

export class Observable<T> {
    private onChangeEmitter = new EventEmitter<T>();
    public onChange = this.onChangeEmitter.event;
    public value: T;
    constructor(initialValue: T) {
        this.value = initialValue;
    }

    set(newValue: T) {
        if (this.value !== newValue) {
            this.value = newValue;
            this.onChangeEmitter.fire(newValue);
        }
    }
}

type ElementAndEventList = [
    [Window, WindowEventMap],
    [Document, DocumentEventMap],
    [HTMLElement, HTMLElementEventMap],
    [Element, ElementEventMap],
];

type ListOfNumberN<T extends any[], N extends number> = {
    [K in keyof T]: T[K] extends any[] ? T[K][N] : K;
};

type ElementList = ListOfNumberN<ElementAndEventList, 0>;
type EventList = ListOfNumberN<ElementAndEventList, 1>;

type KeyOfInElementList<T> = {
    [K in keyof ElementList]: K extends number ? never : ElementList[K] extends ElementList[number] ? (T extends ElementList[K] ? K : never) : never;
}[keyof ElementList];

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;
type ElementToEvent<T> = UnionToIntersection<EventList[KeyOfInElementList<T>]>;

export function asEvent<TElement extends ElementList[number], TEvent extends keyof ElementToEvent<TElement> & string>(
    host: TElement, event: TEvent
): IEventWithThis<ElementToEvent<TElement>[TEvent], TElement> {
    return callback => {
        host.addEventListener(event, callback as any);
        return {
            dispose: () => {
                host.removeEventListener(event, callback as any);
            }
        };
    };
}

export class Subscriber implements Disposable {
    protected subscriptions: Disposable[] = [];

    dispose(): void {
        this.subscriptions.forEach(s => s.dispose());
    }
}
