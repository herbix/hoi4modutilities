import * as assert from 'assert';
import { parseHoi4File } from '../../../../src/hoiformat/hoiparser';
import { getEvents } from '../../../../src/previewdef/event/schema';

suite('event preview schema', () => {
    test('keeps event text and option metadata', () => {
        const events = getEvents(parseHoi4File(`
            add_namespace = test

            country_event = {
                id = test.1
                title = test.1.t
                desc = test.1.desc
                desc = {
                    text = test.1.alternate.desc
                    trigger = { has_country_flag = test_flag }
                }
                option = {
                    name = test.1.a
                    trigger = { has_war = yes }
                    ai_chance = { factor = 5 }
                    original_recipient_only = yes
                }
            }
        `), 'events/test.txt').eventItemsByNamespace.test;
        const event = events.find(item => item.id === 'test.1');

        assert.ok(event);
        assert.deepStrictEqual(event.descriptions, [
            { text: 'test.1.desc' },
            {
                text: 'test.1.alternate.desc',
                trigger: 'trigger = { has_country_flag = test_flag }',
            },
        ]);

        const option = event.options[0];
        assert.strictEqual(option.name, 'test.1.a');
        assert.strictEqual(option.trigger, 'trigger = { has_war = yes }');
        assert.strictEqual(option.aiChanceScript, 'ai_chance = { factor = 5 }');
        assert.strictEqual(option.originalRecipientOnly, true);
    });
});
