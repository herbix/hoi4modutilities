import { WorldMapData, ProgressReporter, ProvinceMap } from "../definitions";
import { CountriesLoader } from "./countries";
import { Loader, LoadResult, mergeInLoadResult } from "./common";
import { StatesLoader } from "./states";
import { DefaultMapLoader } from "./provincemap";
import { debug } from "../../../util/debug";
import { StrategicRegionsLoader } from "./strategicregion";
import { SupplyAreasLoader } from "./supplyarea";
import { LoaderSession } from "../../../util/loader";

export class WorldMapLoader extends Loader<WorldMapData> {
    private defaultMapLoader: DefaultMapLoader;
    private statesLoader: StatesLoader;
    private countriesLoader: CountriesLoader;
    private strategicRegionsLoader: StrategicRegionsLoader;
    private supplyAreasLoader: SupplyAreasLoader;
    private shouldReloadValue: boolean = false;

    constructor() {
        super();
        this.defaultMapLoader = new DefaultMapLoader();
        this.defaultMapLoader.onProgress(e => this.onProgressEmitter.fire(e));

        this.statesLoader = new StatesLoader(this.defaultMapLoader);
        this.statesLoader.onProgress(e => this.onProgressEmitter.fire(e));

        this.countriesLoader = new CountriesLoader();
        this.countriesLoader.onProgress(e => this.onProgressEmitter.fire(e));

        this.strategicRegionsLoader = new StrategicRegionsLoader(this.defaultMapLoader, this.statesLoader);
        this.strategicRegionsLoader.onProgress(e => this.onProgressEmitter.fire(e));

        this.supplyAreasLoader = new SupplyAreasLoader(this.defaultMapLoader, this.statesLoader);
        this.supplyAreasLoader.onProgress(e => this.onProgressEmitter.fire(e));
    }

    public async shouldReloadImpl(): Promise<boolean> {
        return this.shouldReloadValue;
    }

    public async loadImpl(force: boolean): Promise<LoadResult<WorldMapData>> {
        this.shouldReloadValue = false;

        const session = LoaderSession.start();

        const provinceMap = await this.defaultMapLoader.load(force);
        const stateMap = await this.statesLoader.load(force);
        const countries = await this.countriesLoader.load(force);
        const strategicRegions = await this.strategicRegionsLoader.load(force);
        const supplyAreas = await this.supplyAreasLoader.load(force);

        const loadedLoaders = Array.from((session as any).loadedLoader).map<string>(v => (v as any).toString());
        debug('Loader session', loadedLoaders);

        LoaderSession.complete();

        const subLoaderResults = [ provinceMap, stateMap, countries, strategicRegions, supplyAreas ];
        const warnings = mergeInLoadResult(subLoaderResults, 'warnings');

        const worldMap: WorldMapData = {
            ...provinceMap.result,
            ...stateMap.result,
            ...strategicRegions.result,
            ...supplyAreas.result,
            provincesCount: provinceMap.result.provinces.length,
            statesCount: stateMap.result.states.length,
            countriesCount: countries.result.length,
            strategicRegionsCount: strategicRegions.result.strategicRegions.length,
            supplyAreasCount: supplyAreas.result.supplyAreas.length,
            countries: countries.result,
            warnings,
        };

        delete (worldMap as unknown as ProvinceMap)['colorByPosition'];

        const dependencies = mergeInLoadResult(subLoaderResults, 'dependencies');
        debug('World map dependencies', dependencies);

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

    public toString() {
        return `[WorldMapLoader]`;
    }
}
