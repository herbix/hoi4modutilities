import { WorldMapData, ProgressReporter } from "../definitions";
import { CountriesLoader } from "./countries";
import { Loader, LoadResult, mergeInLoadResult } from "./common";
import { StatesLoader } from "./states";
import { DefaultMapLoader } from "./provincemap";
import { debug } from "../../../util/debug";

export class WorldMapLoader extends Loader<WorldMapData> {
    private defaultMapLoader: DefaultMapLoader;
    private statesLoader: StatesLoader;
    private countriesLoader: CountriesLoader;
    private shouldReloadValue: boolean = false;

    constructor(progressReporter: ProgressReporter) {
        super(progressReporter);
        this.defaultMapLoader = new DefaultMapLoader(progressReporter);
        this.statesLoader = new StatesLoader(this.defaultMapLoader, progressReporter);
        this.countriesLoader = new CountriesLoader(progressReporter);
    }

    public async shouldReload(): Promise<boolean> {
        return this.shouldReloadValue;
    }

    public async loadImpl(force: boolean): Promise<LoadResult<WorldMapData>> {
        this.shouldReloadValue = false;

        const provinceMap = await this.defaultMapLoader.load(force);
        const stateMap = await this.statesLoader.load(force);
        const countries = await this.countriesLoader.load(force);

        const subLoaderResults = [ provinceMap, stateMap, countries ];
        const warnings = mergeInLoadResult(subLoaderResults, 'warnings');

        const worldMap: WorldMapData = {
            ...provinceMap.result,
            ...stateMap.result,
            provincesCount: provinceMap.result.provinces.length,
            statesCount: stateMap.result.states.length,
            countriesCount: countries.result.length,
            countries: countries.result,
            warnings,
        };

        const dependencies = mergeInLoadResult(subLoaderResults, 'dependencies');
        debug(dependencies);

        return {
            result: worldMap,
            dependencies,
            warnings,
        };
    }

    public getWorldMap(force?: boolean): Promise<WorldMapData> {
        return this.load(force).then(r => r.result);
    }

    public shallowForceReload(): void {
        this.shouldReloadValue = true;
    }
}
