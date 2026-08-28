import * as assert from 'assert';
import { EffectComplexExpr } from '../../../../src/hoiformat/effect';
import { conditionToString } from '../../../../src/hoiformat/condition';
import { parseHoi4File } from '../../../../src/hoiformat/hoiparser';
import { getEvents } from '../../../../src/previewdef/event/schema';

suite('event preview schema', () => {
    test('keeps event text, conditions, effects, and child event calls', () => {
        const events = getEvents(parseHoi4File(`
            add_namespace = test

            country_event = {
                id = test.1
                title = test.1.t
                desc = test.1.desc
                desc = {
                    text = test.1.alternate.desc
                    trigger = { has_country_flag = alternate_description }
                }
                trigger = { has_country_flag = may_fire }
                immediate = {
                    if = {
                        limit = { has_country_flag = publish_news }
                        news_event = { id = test.news days = 2 }
                    }
                }
                option = {
                    name = test.1.a
                    trigger = { has_country_flag = may_choose }
                    ai_chance = { factor = 5 }
                    original_recipient_only = yes
                    add_political_power = -50
                    if = {
                        limit = { has_country_flag = route_a }
                        country_event = { id = test.2 days = 1 }
                    }
                    if = {
                        limit = { has_country_flag = route_b }
                        country_event = { id = test.2 days = 1 }
                    }
                    random_list = {
                        30 = { news_event = test.news }
                        70 = { country_event = { id = test.2 random_days = 3 } }
                    }
                    random = {
                        chance = 25
                        news_event = { id = test.news hours = 6 }
                    }
                    if = {
                        limit = { has_country_flag = weighted_random }
                        random_list = {
                            var:news_weight = { news_event = { id = test.news hours = 4 } }
                            10 = { country_event = { id = test.2 hours = 4 } }
                        }
                    }
                }
            }

            news_event = {
                id = test.news
                title = test.news.t
            }

            country_event = {
                id = test.2
                title = test.2.t
            }
        `), 'events/test.txt').eventItemsByNamespace.test;
        const event = events.find(item => item.id === 'test.1');

        assert.ok(event);
        assert.deepStrictEqual(event.descriptions.map(description => description.text), [
            'test.1.desc',
            'test.1.alternate.desc',
        ]);
        assert.match(conditionToString(event.descriptions[1].trigger), /has_country_flag = alternate_description/);
        assert.match(conditionToString(event.trigger), /has_country_flag = may_fire/);

        const immediateNews = event.immediate.childEvents.find(child => child.eventName === 'test.news');
        assert.ok(immediateNews);
        assert.strictEqual(immediateNews.days, 2);
        assert.ok(getEffectConditions(event.immediate.effect)
            .some(condition => condition.includes('has_country_flag = publish_news')));

        const option = event.options[0];
        assert.strictEqual(option.name, 'test.1.a');
        assert.match(conditionToString(option.trigger), /has_country_flag = may_choose/);
        assert.strictEqual(option.aiChanceScript, 'ai_chance = { factor = 5 }');
        assert.strictEqual(option.originalRecipientOnly, true);

        const effectContents = getEffectContents(option.effect);
        assert.ok(effectContents.includes('add_political_power = -50'));
        assert.ok(effectContents.every(content => !content.startsWith('name =')));
        assert.ok(effectContents.every(content => !content.startsWith('ai_chance =')));
        assert.ok(effectContents.some(content => content.startsWith('random =')));

        const effectConditions = getEffectConditions(option.effect);
        assert.ok(effectConditions.some(condition => condition.includes('has_country_flag = route_a')));
        assert.ok(effectConditions.some(condition => condition.includes('has_country_flag = route_b')));
        assert.ok(effectConditions.some(condition => condition.includes('has_country_flag = weighted_random')));
        assert.deepStrictEqual(getRandomListWeights(option.effect), [30, 70, 'var:news_weight', 10]);

        const conditionalChild = option.childEvents.find(child =>
            child.eventName === 'test.2' && child.days === 1);
        assert.ok(conditionalChild);

        const randomNews = option.childEvents.find(child => child.eventName === 'test.news');
        assert.ok(randomNews);

        const delayedRandomChild = option.childEvents.find(child =>
            child.eventName === 'test.2' && child.randomDays === 3);
        assert.ok(delayedRandomChild);

        const randomChanceNews = option.childEvents.find(child =>
            child.eventName === 'test.news' && child.hours === 6);
        assert.ok(randomChanceNews);

        const variableWeightNews = option.childEvents.find(child =>
            child.eventName === 'test.news' && child.hours === 4);
        assert.ok(variableWeightNews);
    });
});

function getEffectContents(effect: EffectComplexExpr): string[] {
    if (effect === null) {
        return [];
    }
    if ('nodeContent' in effect) {
        return [effect.nodeContent];
    }
    if ('condition' in effect) {
        return effect.items.flatMap(getEffectContents);
    }
    return effect.items.flatMap(item => getEffectContents(item.effect));
}

function getEffectConditions(effect: EffectComplexExpr): string[] {
    if (effect === null || 'nodeContent' in effect) {
        return [];
    }
    if ('condition' in effect) {
        return [
            ...(effect.condition === true ? [] : [conditionToString(effect.condition)]),
            ...effect.items.flatMap(getEffectConditions),
        ];
    }
    return effect.items.flatMap(item => getEffectConditions(item.effect));
}

function getRandomListWeights(effect: EffectComplexExpr): (number | string)[] {
    if (effect === null || 'nodeContent' in effect) {
        return [];
    }
    if ('condition' in effect) {
        return effect.items.flatMap(getRandomListWeights);
    }
    return [
        ...effect.items.map(item => item.possibility),
        ...effect.items.flatMap(item => getRandomListWeights(item.effect)),
    ];
}
