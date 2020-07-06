import { ContentLoader, Dependency, LoaderSession, LoadResultOD } from "./loader";
import * as yaml from 'js-yaml';

export class YamlLoader extends ContentLoader<any> {
    constructor(file: string, contentProvider?: () => Promise<string>) {
        super(file, contentProvider);
        this.readDependency = false;
    }

    protected async postLoad(content: string | undefined, dependencies: Dependency[], error: any, session: LoaderSession): Promise<LoadResultOD<any>> {
        if (error || (content === undefined)) {
            throw error;
        }

        try {
            return {
                result: yaml.safeLoad(content)
            };
        } catch (e) {
            content = content.replace(/:\d+\s*"/g, ": \"").replace(/(?<=")((?:\\.|[^\\"\n\r])*?)"(?!\s*$)/gm, "$1\\\"");
        }

        return {
            result: yaml.safeLoad(content)
        };
    }

    public toString() {
        return `[YamlLoader ${this.file}]`;
    }
}
