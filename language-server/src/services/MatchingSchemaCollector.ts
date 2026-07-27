import * as Instance from "@hyperjump/json-schema/instance/experimental";

import type { EvaluationPlugin, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { Node, Keyword } from "@hyperjump/json-schema/experimental";

type Annotation = Record<string, unknown>;

type SchemaAnnotationContext = ValidationContext & {
  pendingAnnotations?: Annotation;
  declaredProperties?: Set<string>;
  passedProperties?: Set<string>;
  failedProperties?: Set<string>;
  rejectedProperties?: Set<string>;
  negated?: boolean;
  isAlternative?: boolean;
};

type Alternative = {
  declaredProperties: Set<string>;
  rejectedProperties: Set<string>;
  isAlternative: boolean;
};

export class MatchingSchemaCollector implements EvaluationPlugin {
  private annotations: Map<string, Annotation[]> = new Map();
  private alternatives: Map<string, Alternative[]> = new Map();
  private acceptedProperties: Map<string, Set<string>> = new Map();
  private forbiddenProperties: Map<string, Set<string>> = new Map();

  beforeSchema(_url: string, _instance: JsonNode, context: SchemaAnnotationContext): void {
    context.pendingAnnotations = {};
    context.declaredProperties = undefined;
    context.rejectedProperties = undefined;
  }

  beforeKeyword(node: Node<unknown>, _instance: JsonNode, context: SchemaAnnotationContext, schemaContext: SchemaAnnotationContext): void {
    const [keywordId] = node;
    const negated = schemaContext.negated ?? false;
    context.negated = keywordId === "https://json-schema.org/keyword/not" ? !negated : negated;

    const alternative = schemaContext.isAlternative ?? false;
    context.isAlternative = keywordId === "https://json-schema.org/keyword/anyOf" || keywordId === "https://json-schema.org/keyword/oneOf" ? true : alternative;
  }

  afterKeyword(node: Node<unknown>, instance: JsonNode, context: SchemaAnnotationContext, _valid: boolean, schemaContext: SchemaAnnotationContext, keyword: Keyword<unknown>): void {
    const [keywordId, , keywordValue] = node;

    if (keywordId === "https://json-schema.org/keyword/required" && schemaContext.negated && instance.type === "object") {
      const required = keywordValue as string[];
      const missing = required.filter((propertyName) => !Instance.has(propertyName, instance));

      if (missing.length === 1) {
        const forbiddenProperties = this.forbiddenProperties.get(instance.pointer) ?? new Set();
        forbiddenProperties.add(missing[0]);
        this.forbiddenProperties.set(instance.pointer, forbiddenProperties);
      }
    }

    if (keywordId === "https://json-schema.org/keyword/properties") {
      schemaContext.declaredProperties ??= new Set();
      for (const propertyName in keywordValue as Record<string, unknown>) {
        schemaContext.declaredProperties.add(propertyName);
      }
    }

    if (keywordId === "https://json-schema.org/keyword/required") {
      schemaContext.declaredProperties ??= new Set();
      for (const propertyName of keywordValue as string[]) {
        schemaContext.declaredProperties.add(propertyName);
      }
    }

    if (keywordId === "https://json-schema.org/keyword/properties" || keywordId === "https://json-schema.org/keyword/additionalProperties" || keywordId === "https://json-schema.org/keyword/patternProperties") {
      const acceptedProperties = this.acceptedProperties.get(instance.pointer) ?? new Set();
      addAll(acceptedProperties, context.passedProperties);
      this.acceptedProperties.set(instance.pointer, acceptedProperties);

      addAll(schemaContext.rejectedProperties ??= new Set(), context.failedProperties);
    }

    if (keyword.annotation) {
      schemaContext.pendingAnnotations ??= {};
      schemaContext.pendingAnnotations[keywordId] = keyword.annotation(keywordValue, instance, context);
    }
  }

  afterSchema(_schemaUri: string, instance: JsonNode, context: SchemaAnnotationContext, valid: boolean): void {
    const instanceLocation = instance.pointer;

    const propertyName = propertyNameOf(instanceLocation);
    if (propertyName !== undefined) {
      const outcome = valid ? (context.passedProperties ??= new Set()) : (context.failedProperties ??= new Set());
      outcome.add(propertyName);
    }

    this.recordAlternative(instanceLocation, context);

    const annotations = context.pendingAnnotations;

    if (!valid || !annotations) {
      return;
    }

    if (!this.annotations.has(instanceLocation)) {
      this.annotations.set(instanceLocation, []);
    }

    const existing = this.annotations.get(instanceLocation)!;
    existing.push(annotations);
  }

  private recordAlternative(instanceLocation: string, context: SchemaAnnotationContext): void {
    const declaredProperties = context.declaredProperties ?? new Set<string>();
    const rejectedProperties = context.rejectedProperties ?? new Set<string>();
    const isAlternative = context.isAlternative ?? false;

    if (declaredProperties.size === 0 && rejectedProperties.size === 0) {
      return;
    }

    const alternatives = this.alternatives.get(instanceLocation) ?? [];
    alternatives.push({ declaredProperties, rejectedProperties, isAlternative });
    this.alternatives.set(instanceLocation, alternatives);
  }

  getAnnotations(instanceLocation: string): Annotation[] {
    return this.annotations.get(instanceLocation) ?? [];
  }

  getPropertyNames(instanceLocation: string): Set<string> {
    const alternatives = this.alternatives.get(instanceLocation) ?? [];
    const acceptedProperties = this.acceptedProperties.get(instanceLocation) ?? new Set();

    const propertyNames = new Set<string>();
    for (const alternative of alternatives) {
      const isContradicted = [...alternative.rejectedProperties].some((propertyName) => acceptedProperties.has(propertyName));
      if (!alternative.isAlternative || !isContradicted) {
        addAll(propertyNames, alternative.declaredProperties);
      }
    }

    const forbiddenProperties = this.forbiddenProperties.get(instanceLocation);
    return forbiddenProperties ? propertyNames.difference(forbiddenProperties) : propertyNames;
  }
}

const addAll = (target: Set<string>, source?: Iterable<string>) => {
  for (const entry of source ?? []) {
    target.add(entry);
  }
};

const propertyNameOf = (instanceLocation: string) => {
  if (instanceLocation === "") {
    return undefined;
  }

  const lastSegment = instanceLocation.slice(instanceLocation.lastIndexOf("/") + 1);
  return lastSegment;
};
