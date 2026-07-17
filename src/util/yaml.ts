import * as yaml from 'js-yaml';

export function parseYaml(content: string, options?: yaml.LoadOptions): any {
    content = preprocessYamlContent(content);
    return yaml.safeLoad(content, options);
}

export function preprocessYamlContent(fileContent: string): string {
    const lines = fileContent.split(/\r?\n/);

    // Filter out any lines that start with #, regardless of leading spaces
    const filteredLines = lines.filter(line =>
        !/^\s*#/.test(line)
    );

    const header = filteredLines.length > 0 ? filteredLines[0].replace(/^\s+/, '') : '';
    // Can't the goddamn Paradox employees and modders just write standard localization yml files?
    const processedLines = filteredLines.slice(1).map(line => {
        return ' ' + line
            //.replace(/\n/g, 'YAMLParsingLFReplacement')
            .replace(
                /^\s*([^:]+):\s*\d*\s*"((?:[^"#\\]|\\.)*)".*?(?=#|$)/,
                (match, p1, p2) => {
                    // Replace unescaped quotes with escaped ones
                    const escapedContent = p2.replace(/(?<!\\)"/g, '\\"');
                    return `${p1}: "${escapedContent}"`;
                }
            )
            .replace(/:(\d+)(?=[^"]*")/, ':')
            .replace(/^\s+/, '');
    }).filter(line =>
        line.trim() !== ''
    );

    return [header, ...processedLines].join('\n');
}