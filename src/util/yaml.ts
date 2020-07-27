import * as yaml from 'js-yaml';

export function parseYaml(content: string): any {
    try {
        return yaml.safeLoad(content);
    } catch (e) {
        content = content.replace(/:\d+\s*"/g, ": \"").replace(/(?<=")((?:\\.|[^\\"\n\r])*?)"(?!\s*$)/gm, "$1\\\"");
    }

    return yaml.safeLoad(content);
}
