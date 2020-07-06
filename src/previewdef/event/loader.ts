import { HOIEvents, getEvents } from "./schema";
import { ContentLoader, Dependency, LoadResultOD, LoaderSession, LoadResult, mergeInLoadResult } from "../../util/loader/loader";
import { error as debugError, debug } from "../../util/debug";
import { parseHoi4File } from "../../hoiformat/hoiparser";
import { localize } from "../../util/i18n";
import { uniq, flatten } from "lodash";
import { YamlLoader } from "../../util/loader/yaml";

export interface EventsLoaderResult {
    events: HOIEvents;
    mainNamespaces: string[];
    localizationDict: Record<string, string>;
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
        
        const localizationDependencies = dependencies.filter(d => d.type === 'localization' && d.path.endsWith('.yml')).map(d => d.path);
        const localizationDepFiles = (await Promise.all(localizationDependencies.map(async (dep) => {
            try {
                const localizationDepLoader = this.loaderDependencies.getOrCreate(dep, k => session.createOrGetCachedLoader(k, YamlLoader), YamlLoader);
                return await localizationDepLoader.load(session);
            } catch (e) {
                debugError(e);
                return undefined;
            }
        }))).filter((v): v is LoadResult<any> => !!v);

        const localizationDict = makeLocalizationDict(mergeInLoadResult(localizationDepFiles, 'result'));
        Object.assign(localizationDict, ...eventsDepFiles.map(f => f.result.localizationDict));

        return {
            result: {
                events: mergedEvents,
                mainNamespaces: Object.keys(events.eventItemsByNamespace),
                localizationDict,
            },
            dependencies: uniq([
                this.file,
                ...eventsDependencies,
                ...mergeInLoadResult(eventsDepFiles, 'dependencies'),
                ...localizationDependencies,
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

function makeLocalizationDict(dicts: any[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const dict of dicts) {
        if (dict.l_english && typeof dict.l_english === 'object' && !Array.isArray(dict.l_english)) {
            Object.assign(result, dict.l_english);
        }
    }

    return result;
}
