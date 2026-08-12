import { applyCondition, ConditionItem } from '../../src/hoiformat/condition';
import { WithCondition } from './definitions';

export function solveWithCondition<T>(value: WithCondition<T>[] | undefined, selectedConditions: ConditionItem[]): T | undefined {
    return value?.find(o => applyCondition(o.condition, selectedConditions))?.value;
}

export function solveWithConditionAsSet<TValue>(value: WithCondition<TValue>[] | undefined, selectedConditions: ConditionItem[]): TValue[] {
    return value?.filter(item => applyCondition(item.condition, selectedConditions)).map(item => item.value) ?? [];
}

export function toCommaDivideNumber(value: number): string {
    return value.toString(10).replace(/(?<!^)(\d{3})(?=(?:\d{3})*$)/g, ',$1');
}
