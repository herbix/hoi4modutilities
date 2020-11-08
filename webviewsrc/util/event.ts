import { BehaviorSubject, fromEvent, Subscription } from 'rxjs';

export type Disposable = { dispose(): void };

export function toDisposable(...subscription: Subscription[]): Disposable {
    return {
        dispose: () => subscription.forEach(s => s.unsubscribe())
    };
}

export class Subscriber implements Disposable {
    private rxjsSubscriptions: Subscription[] = [];
    private subscriptions: Disposable[] = [];

    addSubscription(subscription: Subscription | Disposable): void {
        if ('dispose' in subscription) {
            this.subscriptions.push(subscription);
        } else {
            this.rxjsSubscriptions.push(subscription);
        }
    }

    dispose(): void {
        this.subscriptions.forEach(s => s.dispose());
        toDisposable(...this.rxjsSubscriptions).dispose();
    }
}

export function toBehaviorSubject<T extends string>(element: HTMLSelectElement | HTMLInputElement, initialValue?: T): BehaviorSubject<T> {
    if (initialValue !== undefined) {
        element.value = initialValue;
    }

    const disposables: Subscription[] = [];
    const observable = new BehaviorSubject<T>(element.value as T);
    let changing = false;

    disposables.push(observable.subscribe({
        next: v => {
            if (changing) {
                return;
            }
            changing = true;
            element.value = v;
            changing = false;
        },
        complete: () => {
            disposables.forEach(d => d.unsubscribe());
        }
    }));

    disposables.push(fromEvent(element, 'change').subscribe(() => {
        if (changing) {
            return;
        }
        changing = true;
        observable.next(element.value as T);
        changing = false;
    }));

    return observable;
}
