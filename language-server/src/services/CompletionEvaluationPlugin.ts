import * as Instance from "@hyperjump/json-schema/instance/experimental";
import * as Pact from "@hyperjump/pact";

import type { EvaluationPlugin, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { Node } from "@hyperjump/json-schema/experimental";

export type PropertyValueInfo = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  hasConst: boolean;
  excluded?: unknown[];
  excludedTypes?: string[];
  permitsAnyValue?: boolean;
};

type CompletionContext = ValidationContext & {
  declaredProperties?: Map<string, PropertyValueInfo>;
  additionalPropertiesInfo?: PropertyValueInfo;
  passedProperties?: Set<string>;
  failedProperties?: Set<string>;
  rejectedProperties?: Set<string>;
  negated?: boolean;
  isAnyOf?: boolean;
  isOneOf?: boolean;
  groupId?: number;
  inIfCondition?: boolean;
};

type Alternative = {
  declaredProperties: Map<string, PropertyValueInfo>;
  additionalPropertiesInfo?: PropertyValueInfo;
  rejectedProperties: Set<string>;
  isAnyOf?: boolean;
  isOneOf?: boolean;
  groupId?: number;
};

export class CompletionEvaluationPlugin implements EvaluationPlugin {
  private alternatives = new Map<string, Alternative[]>();
  private acceptedProperties = new Map<string, Set<string>>();
  private forbiddenProperties = new Map<string, Set<string>>();
  private allOfCheckpoints = new Map<string, number[]>();
  private nextGroupId = 0;
  private ast?: Record<string, unknown>;

  beforeSchema(_url: string, _instance: JsonNode, context: CompletionContext): void {
    context.declaredProperties = undefined;
    context.additionalPropertiesInfo = undefined;
    context.rejectedProperties = undefined;
    this.ast ??= context.ast as Record<string, unknown>;
  }

  beforeKeyword(node: Node<unknown>, instance: JsonNode, context: CompletionContext, schemaContext: CompletionContext): void {
    const [keywordId] = node;
    const negated = schemaContext.negated ?? false;
    context.negated = keywordId === "https://json-schema.org/keyword/not" ? !negated : negated;
    context.isAnyOf = keywordId === "https://json-schema.org/keyword/anyOf" ? true : (schemaContext.isAnyOf ?? false);
    context.isOneOf = keywordId === "https://json-schema.org/keyword/oneOf" ? true : (schemaContext.isOneOf ?? false);
    context.inIfCondition = keywordId === "https://json-schema.org/keyword/if" ? true : (schemaContext.inIfCondition ?? false);

    const isCombinator = keywordId === "https://json-schema.org/keyword/allOf" || keywordId === "https://json-schema.org/keyword/anyOf" || keywordId === "https://json-schema.org/keyword/oneOf";
    context.groupId = isCombinator ? this.nextGroupId++ : schemaContext.groupId;

    if (keywordId === "https://json-schema.org/keyword/allOf") {
      getOrCreate(this.allOfCheckpoints, instance.pointer, () => []).push((this.alternatives.get(instance.pointer) ?? []).length);
    }
  }

  afterKeyword(node: Node<unknown>, instance: JsonNode, context: CompletionContext, _valid: boolean, schemaContext: CompletionContext): void {
    const [keywordId, , keywordValue] = node;

    if (keywordId === "https://json-schema.org/keyword/required" && schemaContext.negated && instance.type === "object") {
      const missing = (keywordValue as string[]).filter((name) => !Instance.has(name, instance));
      if (missing.length === 1) {
        getOrCreate(this.forbiddenProperties, instance.pointer, () => new Set()).add(missing[0]);
      }
    }

    if (keywordId === "https://json-schema.org/keyword/properties") {
      schemaContext.declaredProperties ??= new Map();
      for (const [name, schemaUri] of Object.entries(keywordValue as Record<string, string>)) {
        if (!schemaContext.declaredProperties.has(name)) {
          schemaContext.declaredProperties.set(name, resolveValueInfo(this.ast, schemaUri));
        }
      }
    }

    if (keywordId === "https://json-schema.org/keyword/required") {
      schemaContext.declaredProperties ??= new Map();
      for (const name of keywordValue as string[]) {
        if (!schemaContext.declaredProperties.has(name)) {
          schemaContext.declaredProperties.set(name, { hasConst: false });
        }
      }
    }

    if (keywordId === "https://json-schema.org/keyword/additionalProperties") {
      schemaContext.additionalPropertiesInfo = resolveValueInfo(this.ast, (keywordValue as [unknown, string])[1]);
    }

    if (keywordId === "https://json-schema.org/keyword/properties" || keywordId === "https://json-schema.org/keyword/additionalProperties" || keywordId === "https://json-schema.org/keyword/patternProperties") {
      addAll(getOrCreate(this.acceptedProperties, instance.pointer, () => new Set()), context.passedProperties);
      schemaContext.rejectedProperties ??= new Set();
      addAll(schemaContext.rejectedProperties, context.failedProperties);
    }

    if (keywordId === "https://json-schema.org/keyword/allOf") {
      const checkpoint = this.allOfCheckpoints.get(instance.pointer)?.pop() ?? 0;
      const bucket = this.alternatives.get(instance.pointer);
      if (bucket && bucket.length > checkpoint) {
        const branches = bucket.splice(checkpoint);
        const mine = branches.filter((branch) => branch.groupId === context.groupId);
        bucket.push(...branches.filter((branch) => branch.groupId !== context.groupId));
        if (mine.length > 0) {
          bucket.push(collapseAllOfBranches(mine, schemaContext.groupId));
        }
      }
    }
  }

  afterSchema(_schemaUri: string, instance: JsonNode, context: CompletionContext, valid: boolean): void {
    if (instance.pointer !== "") {
      const propertyName = instance.pointer.slice(instance.pointer.lastIndexOf("/") + 1);
      (valid ? (context.passedProperties ??= new Set()) : (context.failedProperties ??= new Set())).add(propertyName);
    }

    const { declaredProperties = new Map(), rejectedProperties = new Set(), isAnyOf, isOneOf, groupId, inIfCondition, additionalPropertiesInfo } = context;
    if (!inIfCondition && (declaredProperties.size > 0 || rejectedProperties.size > 0 || additionalPropertiesInfo)) {
      getOrCreate(this.alternatives, instance.pointer, () => []).push({
        declaredProperties, additionalPropertiesInfo, rejectedProperties, isAnyOf, isOneOf, groupId
      });
    }
  }

  private activeAlternatives(instanceLocation: string): Alternative[] {
    const acceptedProperties = this.acceptedProperties.get(instanceLocation) ?? new Set();
    return (this.alternatives.get(instanceLocation) ?? []).filter((alternative) => {
      const isCombinator = alternative.isAnyOf || alternative.isOneOf;
      return !(isCombinator && Pact.some((property) => acceptedProperties.has(property), alternative.rejectedProperties));
    });
  }

  getDeclaredProperties(instanceLocation: string): Set<string> {
    const propertyNames = new Set<string>();
    for (const alternative of this.activeAlternatives(instanceLocation)) {
      addAll(propertyNames, alternative.declaredProperties?.keys());
    }
    const forbiddenProperties = this.forbiddenProperties.get(instanceLocation);
    return forbiddenProperties ? propertyNames.difference(forbiddenProperties) : propertyNames;
  }

  getPropertyValueInfo(instanceLocation: string, propertyName: string): PropertyValueInfo | undefined {
    let constraints: PropertyValueInfo | undefined;
    let choices: PropertyValueInfo | undefined;
    const oneOfInfos: PropertyValueInfo[] = [];

    for (const alternative of this.activeAlternatives(instanceLocation)) {
      const info = alternative.declaredProperties.get(propertyName) ?? alternative.additionalPropertiesInfo;
      if (!info) {
        continue;
      }
      if (alternative.isAnyOf) {
        choices = choices ? unionValueInfo(choices, info) : info;
      } else if (alternative.isOneOf) {
        oneOfInfos.push(info);
      } else {
        constraints = constraints ? intersectValueInfo(constraints, info) : info;
      }
    }

    if (oneOfInfos.length > 0) {
      const oneOfResult = exactlyOneValueInfo(oneOfInfos);
      choices = choices ? unionValueInfo(choices, oneOfResult) : oneOfResult;
    }

    return constraints && choices ? intersectValueInfo(constraints, choices) : choices ?? constraints;
  }
}

const addAll = (target: Set<string>, source?: Iterable<string>) => {
  for (const entry of source ?? []) {
    target.add(entry);
  }
};

const getOrCreate = <Key, Value>(map: Map<Key, Value>, key: Key, create: () => Value): Value => {
  let value = map.get(key);
  if (value === undefined) {
    value = create();
    map.set(key, value);
  }
  return value;
};

const keyOf = (value: unknown): string => JSON.stringify(value);

// De duplicate a list of primitives (e.g. type names) by identity.
const unique = (values: Iterable<string>): string[] => Array.from(new Set(values));

// De duplicating the JSON values by structural equality, since two branches can produce equal but distinct objects.
const uniqueValues = (values: Iterable<unknown>): unknown[] => {
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const value of values) {
    const key = keyOf(value);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
};

const intersectValues = (first: unknown[], second: unknown[]): unknown[] => {
  const secondKeys = new Set(second.map(keyOf));
  return first.filter((value) => secondKeys.has(keyOf(value)));
};

const withoutValues = (values: unknown[], remove: unknown[]): unknown[] => {
  const removeKeys = new Set(remove.map(keyOf));
  return values.filter((value) => !removeKeys.has(keyOf(value)));
};

const typeList = (type: string | string[]): string[] => Array.isArray(type) ? type : [type];

const jsonTypeOf = (value: unknown): string => {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value === "number" ? "number" : typeof value;
};

const isType = (value: unknown, type: string): boolean => {
  if (type === "integer") {
    return typeof value === "number" && Number.isInteger(value);
  }
  return jsonTypeOf(value) === type;
};

const isAnyType = (value: unknown, types: string | string[]): boolean => typeList(types).some((type) => isType(value, type));

const intersectTypes = (first: string | string[], second: string | string[]): string[] => {
  const secondTypes = new Set(typeList(second));
  const result = new Set<string>();
  for (const type of typeList(first)) {
    if (secondTypes.has(type)) {
      result.add(type);
    } else if ((type === "number" && secondTypes.has("integer")) || (type === "integer" && secondTypes.has("number"))) {
      result.add("integer");
    }
  }
  return Array.from(result);
};

const isUnconstrained = (info: PropertyValueInfo): boolean => !info.type && !info.hasConst && !info.enum && !info.excluded && !info.excludedTypes;

const isOpen = (info: PropertyValueInfo): boolean => info.permitsAnyValue === true || (!info.hasConst && !info.enum);

// Drop any enum/const values that contradict the info's own type, excludedTypes, or excluded set.
const dropContradictoryValues = (info: PropertyValueInfo): PropertyValueInfo => {
  let { type, enum: enumValues, const: constValue, hasConst, excluded, excludedTypes } = info;

  if (type && excludedTypes) {
    const rejectedTypes = new Set(excludedTypes);
    type = typeList(type).filter((candidate) => !rejectedTypes.has(candidate));
  }

  if (type && enumValues) {
    enumValues = enumValues.filter((value) => isAnyType(value, type));
  }

  if (excludedTypes && enumValues) {
    enumValues = enumValues.filter((value) => !isAnyType(value, excludedTypes));
  }

  if (excludedTypes && hasConst && isAnyType(constValue, excludedTypes)) {
    hasConst = false;
    constValue = undefined;
  }

  if (excluded && enumValues) {
    enumValues = enumValues.filter((value) => !excluded.some((excludedValue) => keyOf(excludedValue) === keyOf(value)));
  }

  if (excluded && hasConst && excluded.some((excludedValue) => keyOf(excludedValue) === keyOf(constValue))) {
    hasConst = false;
    constValue = undefined;
  }

  return { ...info, type, enum: enumValues, const: constValue, hasConst };
};

const intersectValueInfo = (first: PropertyValueInfo, second: PropertyValueInfo): PropertyValueInfo => {
  const type = first.type && second.type ? intersectTypes(first.type, second.type) : first.type ?? second.type;
  const enumValues = first.enum && second.enum ? intersectValues(first.enum, second.enum) : first.enum ?? second.enum;
  const bothHaveConst = first.hasConst && second.hasConst;
  const constsMatch = bothHaveConst && keyOf(first.const) === keyOf(second.const);

  return dropContradictoryValues({
    type,
    enum: enumValues,
    const: bothHaveConst ? (constsMatch ? first.const : undefined) : (first.hasConst ? first.const : second.const),
    hasConst: bothHaveConst ? constsMatch : (first.hasConst || second.hasConst),
    excluded: (first.excluded ?? second.excluded) ? uniqueValues(Pact.concat(first.excluded ?? [], second.excluded ?? [])) : undefined,
    excludedTypes: (first.excludedTypes ?? second.excludedTypes) ? unique(Pact.concat(first.excludedTypes ?? [], second.excludedTypes ?? [])) : undefined,
    permitsAnyValue: (isOpen(first) && isOpen(second)) || undefined
  });
};

const unionValueInfo = (first: PropertyValueInfo, second: PropertyValueInfo): PropertyValueInfo => {
  if (isUnconstrained(first)) {
    return { ...second, type: undefined, excluded: undefined, excludedTypes: undefined, permitsAnyValue: true };
  }
  if (isUnconstrained(second)) {
    return { ...first, type: undefined, excluded: undefined, excludedTypes: undefined, permitsAnyValue: true };
  }

  let type: string | string[] | undefined;
  let namesTypeAndValues = false;

  if (first.type && second.type) {
    type = unique(Pact.concat(typeList(first.type), typeList(second.type)));
  } else if (first.type ?? second.type) {
    const side = first.type !== undefined ? first : second;
    if (!side.hasConst && !side.enum) {
      type = side.type;
      namesTypeAndValues = true;
    }
  }

  let excludedTypes: string[] | undefined;
  if (first.excludedTypes && second.excludedTypes) {
    const shared = intersectValues(first.excludedTypes, second.excludedTypes) as string[];
    excludedTypes = shared.length > 0 ? shared : undefined;
  }

  if (excludedTypes && type) {
    const rejectedTypes = new Set(excludedTypes);
    type = typeList(type).filter((candidate) => !rejectedTypes.has(candidate));
  }

  const firstValues = first.hasConst ? [first.const] : first.enum;
  const secondValues = second.hasConst ? [second.const] : second.enum;
  let enumValues = firstValues && secondValues ? uniqueValues(Pact.concat(firstValues, secondValues)) : firstValues ?? secondValues;

  let excluded: unknown[] | undefined;
  if (first.excluded && second.excluded) {
    const shared = intersectValues(first.excluded, second.excluded);
    excluded = shared.length > 0 ? shared : undefined;
  }

  if (excluded && enumValues) {
    enumValues = withoutValues(enumValues, excluded);
  }

  const resultType = type && typeList(type).length === 1 ? typeList(type)[0] : type;
  return { type: resultType, enum: enumValues, hasConst: false, excluded, excludedTypes, permitsAnyValue: namesTypeAndValues || undefined };
};

const exactlyOneValueInfo = (infos: PropertyValueInfo[]): PropertyValueInfo => {
  const unioned = infos.reduce((merged, incoming) => unionValueInfo(merged, incoming));
  const counts = new Map<string, number>();
  for (const info of infos) {
    for (const value of (info.hasConst ? [info.const] : info.enum) ?? []) {
      counts.set(keyOf(value), (counts.get(keyOf(value)) ?? 0) + 1);
    }
  }
  return { ...unioned, enum: unioned.enum?.filter((value) => counts.get(keyOf(value)) === 1) };
};

const collapseAllOfBranches = (branches: Alternative[], groupId: number | undefined): Alternative => {
  const declaredProperties = new Map<string, PropertyValueInfo>();
  const rejectedProperties = new Set<string>();
  for (const branch of branches) {
    addAll(rejectedProperties, branch.rejectedProperties);
    for (const [name, info] of branch.declaredProperties) {
      const existing = declaredProperties.get(name);
      declaredProperties.set(name, existing ? intersectValueInfo(existing, info) : info);
    }
  }
  return { declaredProperties, rejectedProperties, isAnyOf: branches[0].isAnyOf, isOneOf: branches[0].isOneOf, groupId };
};

// Read a not subschema for the values and types it forbids, in a single pass over the node.
const resolveNegation = (ast: Record<string, unknown> | undefined, schemaUri: string): { excluded?: unknown[]; excludedTypes?: string[] } => {
  const node = ast?.[schemaUri];
  if (!Array.isArray(node)) {
    return {};
  }
  const values: unknown[] = [];
  let excludedTypes: string[] | undefined;
  for (const [keywordId, , keywordValue] of node as [string, unknown, unknown][]) {
    if (keywordId === "https://json-schema.org/keyword/const") {
      values.push(JSON.parse(keywordValue as string));
    } else if (keywordId === "https://json-schema.org/keyword/enum") {
      for (const entry of keywordValue as string[]) {
        values.push(JSON.parse(entry));
      }
    } else if (keywordId === "https://json-schema.org/keyword/type") {
      excludedTypes = typeList(keywordValue as string | string[]);
    }
  }
  return { excluded: values.length > 0 ? values : undefined, excludedTypes };
};

const resolveValueInfo = (ast: Record<string, unknown> | undefined, schemaUri: string, visited: Set<string> = new Set()): PropertyValueInfo => {
  try {
    let info: PropertyValueInfo = { hasConst: false };
    const node = ast?.[schemaUri];
    if (!Array.isArray(node) || visited.has(schemaUri)) {
      return info;
    }

    const path = new Set(visited).add(schemaUri);
    // A combinator in a property's value schema isn't evaluated while that value is still unwritten, so no hook sees it so we resolve it here.
    const nestedInfos: PropertyValueInfo[] = [];

    for (const [keywordId, , keywordValue] of node as [string, unknown, unknown][]) {
      if (keywordId === "https://json-schema.org/keyword/type") {
        info.type = keywordValue as string | string[];
      } else if (keywordId === "https://json-schema.org/keyword/enum") {
        info.enum = (keywordValue as string[]).map((entry) => JSON.parse(entry));
      } else if (keywordId === "https://json-schema.org/keyword/const") {
        info.const = JSON.parse(keywordValue as string);
        info.hasConst = true;
      } else if (keywordId === "https://json-schema.org/keyword/not") {
        ({ excluded: info.excluded, excludedTypes: info.excludedTypes } = resolveNegation(ast, keywordValue as string));
      } else if (keywordId === "https://json-schema.org/keyword/allOf") {
        const branches = (keywordValue as string[]).map((branchUri) => resolveValueInfo(ast, branchUri, path));
        if (branches.length > 0) {
          nestedInfos.push(branches.reduce((merged, incoming) => intersectValueInfo(merged, incoming)));
        }
      } else if (keywordId === "https://json-schema.org/keyword/anyOf") {
        const branches = (keywordValue as string[]).map((branchUri) => resolveValueInfo(ast, branchUri, path));
        if (branches.length > 0) {
          nestedInfos.push(branches.reduce((merged, incoming) => unionValueInfo(merged, incoming)));
        }
      } else if (keywordId === "https://json-schema.org/keyword/oneOf") {
        const branches = (keywordValue as string[]).map((branchUri) => resolveValueInfo(ast, branchUri, path));
        if (branches.length > 0) {
          nestedInfos.push(exactlyOneValueInfo(branches));
        }
      }
    }

    info = dropContradictoryValues(info);
    if (info.type && info.hasConst && !isAnyType(info.const, info.type)) {
      info = { ...info, hasConst: false, const: undefined };
    }

    if (nestedInfos.length > 0) {
      const combined = nestedInfos.reduce((merged, incoming) => intersectValueInfo(merged, incoming));
      return isUnconstrained(info) ? combined : intersectValueInfo(info, combined);
    }
    return info;
  } catch {
    return { hasConst: false };
  }
};
