import { convertNodeToJson, CustomMap, Raw, SchemaDef } from '../../../hoiformat/schema';
import { ConditionComplexExpr, ConditionItem, extractConditionValues } from '../../../hoiformat/condition';
import { parseHoi4File } from '../../../hoiformat/hoiparser';
import { localize } from '../../../util/i18n';
import { countryScope } from '../../../hoiformat/scope';

export interface FocusInlayWindow {
    id: string;
    windowName: string;
    visible: ConditionComplexExpr;
    conditionExprs: ConditionItem[];
}

interface FocusInlayWindowDef {
    window_name: string;
    visible: Raw;
}

interface FocusInlayWindowFile extends CustomMap<FocusInlayWindowDef> {
}

const focusInlayWindowSchema: SchemaDef<FocusInlayWindowFile> = {
    _innerType: {
        window_name: 'string',
        visible: 'raw',
    },
    _type: 'map',
};

export function getFocusInlayWindows(content: string, filePath: string): FocusInlayWindow[] {
    const result: FocusInlayWindow[] = [];

    const constants = {};
    const file = convertNodeToJson<FocusInlayWindowFile>(parseHoi4File(content, localize('infile', 'In file {0}:\n', filePath)), focusInlayWindowSchema, constants);
    const conditionExprs: ConditionItem[] = [];

    for (const { _key, _value } of Object.values(file._map)) {
        if (!_value.window_name) {
            continue;
        }

        const visible = _value.visible ? extractConditionValues([_value.visible._raw.value], countryScope, conditionExprs).condition : true;

        result.push({
            id: _key,
            windowName: _value.window_name,
            visible,
            conditionExprs,
        });
    }

    return result;
}
