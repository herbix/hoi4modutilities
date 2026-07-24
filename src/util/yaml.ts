import * as yaml from 'js-yaml';

export function parseLocalisationYaml(content: string, file?: string): any {
    content = preprocessYamlContent(content, file);

    // set "json: true" to allow duplicate keys
    return yaml.safeLoad(content, { schema: yaml.JSON_SCHEMA, json: true });
}

function preprocessYamlContent(fileContent: string, file?: string): string {
    const lines = fileContent.split(/(?:\r\n|\r|\n)/g);
    const processedLines: string[] = [];

    let headerAdded = false;

    // Can't the goddamn Paradox employees and modders just write standard localization yml files?
    for (const l of lines) {
        let line = l;
        if (line.match(/^\s*(#|$)/)) {
            // # comment or empty line
            processedLines.push('');
            continue;
        }

        line = line.trim();

        // Remove "0" in "loc_key:0 <value>" because it's not standard yaml
        line = line.replace(/^([^:]+):(\d+)(?=\s|"|$)/, '$1:');

        if (!headerAdded) {
            processedLines.push(line);
            headerAdded = true;
            continue;
        }

        // For all double quoted strings
        line = line.replace(/^([^:]+):\s*"((?:[^\\]|\\.)*)".*/, (_, p1, p2) => { 
            // Remove redundent prefix \ if it's not a escape character
            p2 = p2.replace(/\\([^0abt\tnvfre "\/\\N_LPxuU])/g, '$1');

            // Add missing `\` before `"` in string
            p2 = p2.replace(/(?<!\\)"/g, '\\"');

            // Drop content outside last `"`
            return `${p1}: "${p2}"`;
        });

        processedLines.push(' ' + line);
    }

    return processedLines.join('\n');
}