import { HOIEvents, getEvents } from "./schema";
import { ContentLoader, Dependency, LoadResultOD, LoaderSession, LoadResult } from "../../util/loader";
import { error as debugError } from "../../util/debug";
import { parseHoi4File } from "../../hoiformat/hoiparser";
import { localize } from "../../util/i18n";
import { uniq, flatten } from "lodash";

export interface EventsLoaderResult {
    events: HOIEvents;
    mainNamespaces: string[];
}

export class EventsLoader extends ContentLoader<EventsLoaderResult> {
    protected async postLoad(content: string | undefined, dependencies: Dependency[], error: any, session: LoaderSession): Promise<LoadResultOD<EventsLoaderResult>> {
        if (error || (content === undefined)) {
            throw error;
        }
        
        const eventsDependencies = dependencies.filter(d => d.type === 'event').map(d => d.path);
        const eventsDepFiles = (await Promise.all(eventsDependencies.map(async (dep) => {
            try {
                const eventsDepLoader = this.loaderDependencies.getOrCreate(dep, k => session.createOrGetCachedLoader(k, EventsLoader), EventsLoader);
                return await eventsDepLoader.load(session);
            } catch (e) {
                debugError(e);
                return undefined;
            }
        }))).filter((v): v is LoadResult<EventsLoaderResult> => !!v);

        const events = getEvents(parseHoi4File(content, localize('infile', 'In file {0}:\n', this.file)), this.file);
        const mergedEvents = mergeEvents(events, ...eventsDepFiles.map(f => f.result.events));
        
        return {
            result: {
                events: mergedEvents,
                mainNamespaces: Object.keys(events.eventItemsByNamespace),
            },
            dependencies: uniq([
                this.file,
                ...eventsDependencies,
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
