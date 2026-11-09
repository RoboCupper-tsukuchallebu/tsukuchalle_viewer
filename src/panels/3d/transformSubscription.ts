import { topicNames } from "../../config.ts";
import type { PanelContext } from "../../layout/panelContext.ts";
import { isTransformMessage, type TransformTree } from "./transformTree.ts";

export function subscribeTransforms(
  context: PanelContext,
  transformTree: TransformTree,
  report: (key: string, reason: string) => void,
  onChange: () => void,
): () => void {
  const subscriptions = [
    { topic: topicNames.staticTransform, isStatic: true },
    { topic: topicNames.transform, isStatic: false },
  ];
  const apply = (topic: string, isStatic: boolean, entry: { value: unknown; receivedAtMs: number }) => {
    if (!isTransformMessage(entry.value)) {
      report(topic, `${topic}: TF の形式を読めません`);
      return;
    }
    report(topic, "");
    transformTree.update(entry.value, isStatic, entry.receivedAtMs);
    onChange();
  };
  for (const { topic, isStatic } of subscriptions) {
    const entry = context.topicStore.get(topic);
    if (entry) {
      apply(topic, isStatic, entry);
    }
  }
  const releases: (() => void)[] = [];
  for (const { topic, isStatic } of subscriptions) {
    releases.push(context.connections.viewing.subscribeToTopic(topic));
    releases.push(
      context.topicStore.subscribe(topic, (entry) => {
        apply(topic, isStatic, entry);
      }),
    );
  }
  return () => {
    releases.forEach((release) => {
      release();
    });
  };
}
