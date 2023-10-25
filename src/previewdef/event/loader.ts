import { HOIEvents, getEvents } from "./schema";
import { ContentLoader, Dependency, LoadResultOD, LoaderSession, mergeInLoadResult } from "../../util/loader/loader";
import { parseHoi4File } from "../../hoiformat/hoiparser";
import { localize } from "../../util/i18n";
import { uniq, flatten } from "lodash";
import { YamlLoader } from "../../util/loader/yaml";
import { getGfxContainerFiles } from "../../util/gfxindex";
import { getLanguageIdInYml } from "../../util/vsccommon";

export interface EventsLoaderResult {
    events: HOIEvents;
    mainNamespaces: string[];
    gfxFiles: string[];
    localizationDict: Record<string, string>;
}

const eventsGFX = 'interface/eventpictures.gfx';

export class EventsLoader extends ContentLoader<EventsLoaderResult> {
    private languageKey: string = '';

    public async shouldReloadImpl(session: LoaderSession): Promise<boolean> {
        return await super.shouldReloadImpl(session) || this.languageKey !== getLanguageIdInYml();
    }

    protected async postLoad(content: string | undefined, dependencies: Dependency[], error: any, session: LoaderSession): Promise<LoadResultOD<EventsLoaderResult>> {
        if (error || (content === undefined)) {
            throw error;
        }

        this.languageKey = getLanguageIdInYml();

        const eventsDependencies = dependencies.filter(d => d.type === 'event').map(d => d.path);
        const eventsDepFiles = await this.loaderDependencies.loadMultiple(eventsDependencies, session, EventsLoader);

        const events = getEvents(parseHoi4File(content, localize('infile', 'In file {0}:\n', this.file)), this.file);
        const mergedEvents = mergeEvents(events, ...eventsDepFiles.map(f => f.result.events));
        
        const localizationDependencies = dependencies.filter(d => d.type.match(/^locali[sz]ation$/) && d.path.endsWith('.yml')).map(d => d.path);
        const localizationDepFiles = await this.loaderDependencies.loadMultiple(localizationDependencies, session, YamlLoader);

        const localizationDict = makeLocalizationDict(mergeInLoadResult(localizationDepFiles, 'result'), this.languageKey);
        Object.assign(localizationDict, ...eventsDepFiles.map(f => f.result.localizationDict));
        
        const gfxDependencies = [
            ...dependencies.filter(d => d.type === 'gfx').map(d => d.path),
            ...flatten(eventsDepFiles.map(f => f.result.gfxFiles)),
            ...await getGfxContainerFiles(flatten(Object.values(events.eventItemsByNamespace)).map(e => e.picture)),
        ];

        return {
            result: {
                events: mergedEvents,
                mainNamespaces: Object.keys(events.eventItemsByNamespace),
                gfxFiles: uniq([...gfxDependencies, eventsGFX]),
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

function makeLocalizationDict(dicts: any[], language: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const dict of dicts) {
        if (dict[language] && typeof dict[language] === 'object' && !Array.isArray(dict[language])) {
            Object.assign(result, dict[language]);
        }
    }

    return result;
}
