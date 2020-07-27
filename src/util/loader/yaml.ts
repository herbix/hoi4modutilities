import { ContentLoader, Dependency, LoaderSession, LoadResultOD } from "./loader";
import { parseYaml } from "../yaml";

export class YamlLoader extends ContentLoader<any> {
    constructor(file: string, contentProvider?: () => Promise<string>) {
        super(file, contentProvider);
        this.readDependency = false;
    }

    protected async postLoad(content: string | undefined, dependencies: Dependency[], error: any, session: LoaderSession): Promise<LoadResultOD<any>> {
        if (error || (content === undefined)) {
            throw error;
        }

        return {
            result: parseYaml(content),
        };
    }

    public toString() {
        return `[YamlLoader ${this.file}]`;
    }
}
