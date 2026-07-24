import type { EvaluationPlugin, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { Node, Keyword } from "@hyperjump/json-schema/experimental";

type Annotation = Record<string, unknown>;

type SchemaAnnotationContext = ValidationContext & {
  pendingAnnotations?: Annotation;
  declaredProperties?: string[];
  passedProperties?: Set<string>;
  failedProperties?: Set<string>;
  rejectedProperties?: Set<string>;
};

type Alternative = {
  declaredProperties: string[];
  rejectedProperties: Set<string>;
};

export class MatchingSchemaCollector implements EvaluationPlugin {
  private annotations: Map<string, Annotation[]> = new Map();
  private alternatives: Map<string, Alternative[]> = new Map();
  private acceptedProperties: Map<string, Set<string>> = new Map();

  beforeSchema(_url: string, _instance: JsonNode, context: SchemaAnnotationContext): void {
    context.pendingAnnotations = {};
    context.declaredProperties = undefined;
    context.rejectedProperties = undefined;
  }

  afterKeyword(node: Node<unknown>, instance: JsonNode, context: SchemaAnnotationContext, _valid: boolean, schemaContext: SchemaAnnotationContext, keyword: Keyword<unknown>): void {
    const [keywordId, , keywordValue] = node;

    if (keywordId === "https://json-schema.org/keyword/properties") {
      schemaContext.declaredProperties = Object.keys(keywordValue as Record<string, string>);
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
    const declaredProperties = context.declaredProperties ?? [];
    const rejectedProperties = context.rejectedProperties ?? new Set<string>();

    if (declaredProperties.length === 0 && rejectedProperties.size === 0) {
      return;
    }

    const alternatives = this.alternatives.get(instanceLocation) ?? [];
    alternatives.push({ declaredProperties, rejectedProperties });
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
      if (!isContradicted) {
        addAll(propertyNames, alternative.declaredProperties);
      }
    }

    return propertyNames;
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
