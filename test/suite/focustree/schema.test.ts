import * as assert from 'assert';
import { parseHoi4File } from '../../../src/hoiformat/hoiparser';
import { convertFocusFileNodeToJson } from '../../../src/previewdef/focustree/schema';

suite('focus search filters', () => {
    test('parses search filters on regular, shared, and joint focuses', () => {
        const focusFile = convertFocusFileNodeToJson(parseHoi4File(`
            focus_tree = {
                id = test_tree
                focus = {
                    id = TEST_FOCUS
                    search_filters = { FOCUS_FILTER_POLITICAL FOCUS_FILTER_INNER_CIRCLE }
                }
            }
            shared_focus = {
                id = TEST_SHARED_FOCUS
                search_filters = { FOCUS_FILTER_RESEARCH }
            }
            joint_focus = {
                id = TEST_JOINT_FOCUS
                search_filters = { FOCUS_FILTER_INDUSTRY }
            }
        `), {});

        assert.deepStrictEqual(focusFile.focus_tree[0].focus[0].search_filters._values,
            ['FOCUS_FILTER_POLITICAL', 'FOCUS_FILTER_INNER_CIRCLE']);
        assert.deepStrictEqual(focusFile.shared_focus[0].search_filters._values, ['FOCUS_FILTER_RESEARCH']);
        assert.deepStrictEqual(focusFile.joint_focus[0].search_filters._values, ['FOCUS_FILTER_INDUSTRY']);
    });
});
