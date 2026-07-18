import { HOIEvents, getEvents } from "./schema";
import { ContentLoader, Dependency, LoadResultOD, LoaderSession, mergeInLoadResult } from "../../util/loader/loader";
import { parseHoi4File } from "../../hoiformat/hoiparser";
import { localize } from "../../util/i18n";
import { uniq, flatten, chain } from "lodash";
import { gfxIndex } from "../../indexing/gfxindex";
import { eventIndex } from "../../indexing/eventindex";

export interface EventsLoaderResult {
    events: HOIEvents;
    mainNamespaces: string[];
    gfxFiles: string[];
}

const eventsGFX = 'interface/eventpictures.gfx';

export class EventsLoader extends ContentLoader<EventsLoaderResult> {
    protected async postLoad(content: string | undefined, dependencies: Dependency[], error: any, session: LoaderSession): Promise<LoadResultOD<EventsLoaderResult>> {
        if (error || (content === undefined)) {
            throw error;
        }

        const events = getEvents(parseHoi4File(content, localize('infile', 'In file {0}:\n', this.file)), this.file);
        const eventsDependencies = dependencies.filter(d => d.type === 'event').map(d => d.path);

        const childEventFiles = chain(Object.values(events.eventItemsByNamespace))
            .flatMap(e => e)
            .flatMap(e => e.options)
            .flatMap(o => o.childEvents)
            .map(ce => eventIndex.get(ce.eventName))
            .uniq()
            .filter((e): e is string => e !== undefined)
            .value();

        for (const childEventFile of childEventFiles) {
            if (!eventsDependencies.includes(childEventFile) && childEventFile !== this.file) {
                eventsDependencies.push(childEventFile);
            }
        }

        const eventsDepFiles = await this.loaderDependencies.loadMultiple(eventsDependencies, session, EventsLoader);
        const mergedEvents = mergeEvents(events, ...eventsDepFiles.map(f => f.result.events));
        
        const gfxDependencies = [
            ...dependencies.filter(d => d.type === 'gfx').map(d => d.path),
            ...flatten(eventsDepFiles.map(f => f.result.gfxFiles)),
            ...await gfxIndex.getGfxContainerFiles(flatten(Object.values(events.eventItemsByNamespace)).map(e => e.picture)),
        ];

        return {
            result: {
                events: mergedEvents,
                mainNamespaces: Object.keys(events.eventItemsByNamespace),
                gfxFiles: uniq([...gfxDependencies, eventsGFX]),
            },
            dependencies: uniq([
                this.file,
                ...eventsDependencies,
                ...mergeInLoadResult(eventsDepFiles, 'dependencies'),
                ...flatten(eventsDepFiles.map(f => f.dependencies)),
            ])
        };
    }

    public toString() {
        return `[EventsLoader ${this.file}]`;
    }
}

function mergeEvents(...events: HOIEvents[]): HOIEvents {
    return {
        eventItemsByNamespace: events.map(e => e.eventItemsByNamespace).reduce((p, c) => Object.assign(p, c), {}),
    };
}
