import * as assert from 'assert';
import { parseHoi4File } from '../../../src/hoiformat/hoiparser';
import { getFocusTree } from '../../../src/previewdef/focustree/schema';

suite('focus search filters', () => {
    test('keeps search filters on regular, shared, and joint focuses', () => {
        const focusTrees = getFocusTree(parseHoi4File(`
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
        `), [], 'test.txt');

        assert.deepStrictEqual(focusTrees.find(tree => tree.id === 'test_tree')?.focuses.TEST_FOCUS.searchFilters,
            ['FOCUS_FILTER_POLITICAL', 'FOCUS_FILTER_INNER_CIRCLE']);
        const sharedFocuses = focusTrees.find(tree => tree.isSharedFocues)?.focuses;
        assert.deepStrictEqual(sharedFocuses?.TEST_SHARED_FOCUS.searchFilters, ['FOCUS_FILTER_RESEARCH']);
        assert.deepStrictEqual(sharedFocuses?.TEST_JOINT_FOCUS.searchFilters, ['FOCUS_FILTER_INDUSTRY']);
    });
});
