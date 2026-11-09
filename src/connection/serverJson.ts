import type { Channel, ConnectionGraphUpdate, Parameter, ServerJsonMessage, ServiceDescription, StatusLevel } from "./protocol.ts";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArrayOf<Item>(value: unknown, isItem: (item: unknown) => item is Item): value is Item[] {
  return Array.isArray(value) && value.every(isItem);
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number";

function isChannel(value: unknown): value is Channel {
  return (
    isRecord(value) &&
    isNumber(value["id"]) &&
    isString(value["topic"]) &&
    isString(value["encoding"]) &&
    isString(value["schemaName"]) &&
    isString(value["schema"])
  );
}

function isServiceMessageDescription(value: unknown): boolean {
  return isRecord(value) && isString(value["encoding"]) && isString(value["schemaName"]) && isString(value["schema"]);
}

function isServiceDescription(value: unknown): value is ServiceDescription {
  return (
    isRecord(value) &&
    isNumber(value["id"]) &&
    isString(value["name"]) &&
    isString(value["type"]) &&
    (value["request"] === undefined || isServiceMessageDescription(value["request"])) &&
    (value["response"] === undefined || isServiceMessageDescription(value["response"]))
  );
}

function isParameter(value: unknown): value is Parameter {
  return isRecord(value) && isString(value["name"]);
}

function isStatusLevel(value: unknown): value is StatusLevel {
  return value === 0 || value === 1 || value === 2;
}

function parseConnectionGraphUpdate(record: JsonRecord): ConnectionGraphUpdate {
  // 欠けた欄は空として扱う（サーバーは差分だけを送る）。
  const listOrEmpty = <Item>(key: string, isItem: (item: unknown) => item is Item): Item[] =>
    isArrayOf(record[key], isItem) ? record[key] : [];
  const isNamedWith = (idsKey: string) => (item: unknown): item is { name: string } =>
    isRecord(item) && isString(item["name"]) && isArrayOf(item[idsKey], isString);
  return {
    publishedTopics: listOrEmpty("publishedTopics", isNamedWith("publisherIds")) as ConnectionGraphUpdate["publishedTopics"],
    subscribedTopics: listOrEmpty("subscribedTopics", isNamedWith("subscriberIds")) as ConnectionGraphUpdate["subscribedTopics"],
    advertisedServices: listOrEmpty("advertisedServices", isNamedWith("providerIds")) as ConnectionGraphUpdate["advertisedServices"],
    removedTopics: listOrEmpty("removedTopics", isString),
    removedServices: listOrEmpty("removedServices", isString),
  };
}

function optionalString(record: JsonRecord, key: string): { [Key in string]?: string } {
  const value = record[key];
  return isString(value) ? { [key]: value } : {};
}

/** 作らない op・知らない op・形が合わない JSON は undefined を返して捨てる。 */
export function parseServerJson(text: string): ServerJsonMessage | undefined {
  let record: unknown;
  try {
    record = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(record)) {
    return undefined;
  }

  switch (record["op"]) {
    case "serverInfo":
      if (!isString(record["name"]) || !isArrayOf(record["capabilities"], isString)) {
        return undefined;
      }
      return {
        op: "serverInfo",
        name: record["name"],
        capabilities: record["capabilities"],
        supportedEncodings: isArrayOf(record["supportedEncodings"], isString) ? record["supportedEncodings"] : [],
        ...optionalString(record, "sessionId"),
      };
    case "status":
      if (!isStatusLevel(record["level"]) || !isString(record["message"])) {
        return undefined;
      }
      return { op: "status", level: record["level"], message: record["message"], ...optionalString(record, "id") };
    case "removeStatus":
      return isArrayOf(record["statusIds"], isString) ? { op: "removeStatus", statusIds: record["statusIds"] } : undefined;
    case "advertise":
      return isArrayOf(record["channels"], isChannel) ? { op: "advertise", channels: record["channels"] } : undefined;
    case "unadvertise":
      return isArrayOf(record["channelIds"], isNumber) ? { op: "unadvertise", channelIds: record["channelIds"] } : undefined;
    case "advertiseServices":
      return isArrayOf(record["services"], isServiceDescription)
        ? { op: "advertiseServices", services: record["services"] }
        : undefined;
    case "unadvertiseServices":
      return isArrayOf(record["serviceIds"], isNumber)
        ? { op: "unadvertiseServices", serviceIds: record["serviceIds"] }
        : undefined;
    case "parameterValues":
      return isArrayOf(record["parameters"], isParameter)
        ? { op: "parameterValues", parameters: record["parameters"], ...optionalString(record, "id") }
        : undefined;
    case "connectionGraphUpdate":
      return { op: "connectionGraphUpdate", ...parseConnectionGraphUpdate(record) };
    case "serviceCallFailure":
      if (!isNumber(record["serviceId"]) || !isNumber(record["callId"]) || !isString(record["message"])) {
        return undefined;
      }
      return {
        op: "serviceCallFailure",
        serviceId: record["serviceId"],
        callId: record["callId"],
        message: record["message"],
      };
    default:
      return undefined;
  }
}
