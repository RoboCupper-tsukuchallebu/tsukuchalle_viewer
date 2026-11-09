import type { MountPanel } from "../layout/panelContext.ts";
import { createElement } from "../layout/dom.ts";

const refreshIntervalMs = 1000;

/** bridge が advertise したチャネルとサービスの一覧。デコードできるものだけ購読できる。 */
export const createChannelListPanel: MountPanel = (container, context) => {
  const { viewing } = context.connections;
  const root = createElement("section", "channel-list");
  container.append(root);

  const render = () => {
    root.replaceChildren(renderChannels(), renderServices());
  };

  const renderChannels = (): HTMLElement => {
    const section = createElement("div");
    section.append(createElement("h2", undefined, `チャネル（${viewing.channels.size}）`));
    const table = createElement("table", "channel-table");
    const head = createElement("tr");
    for (const title of ["購読", "トピック", "型", "encoding", "デコード", "最新の受信"]) {
      head.append(createElement("th", undefined, title));
    }
    table.append(head);

    const channels = [...viewing.channels.values()].sort((a, b) => a.topic.localeCompare(b.topic));
    for (const channel of channels) {
      const decoder = context.channelBinding.decoderFor(channel);
      const row = createElement("tr");
      row.dataset["topic"] = channel.topic;

      const checkbox = createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = viewing.isSubscribedToTopic(channel.topic);
      checkbox.disabled = !decoder.isDecodable;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          viewing.subscribeToTopic(channel.topic);
        } else {
          viewing.unsubscribeFromTopic(channel.topic);
        }
      });
      const checkboxCell = createElement("td");
      checkboxCell.append(checkbox);

      const ageMs = context.topicStore.ageMs(channel.topic);
      row.append(
        checkboxCell,
        createElement("td", undefined, channel.topic),
        createElement("td", undefined, channel.schemaName),
        createElement("td", undefined, channel.encoding === "" ? "（なし）" : channel.encoding),
        createElement("td", decoder.isDecodable ? undefined : "undecodable", decoder.isDecodable ? "できる" : `できない: ${decoder.reason}`),
        createElement("td", undefined, ageMs === undefined ? "-" : `${(ageMs / 1000).toFixed(1)} 秒前`),
      );
      table.append(row);
    }
    section.append(table);
    return section;
  };

  const renderServices = (): HTMLElement => {
    const section = createElement("div");
    section.append(createElement("h2", undefined, `サービス（${viewing.services.size}）`));
    const list = createElement("ul");
    for (const service of [...viewing.services.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      list.append(createElement("li", undefined, `${service.name}（${service.type}）`));
    }
    section.append(list);
    return section;
  };

  render();
  const stops = [viewing.on("channelsChanged", render), viewing.on("servicesChanged", render)];
  // 受信の古さは、チャネルの変化とは関係なく進むので、定期的に描き直す。チェックの操作中に壊さないよう、焦点が行の中なら飛ばす。
  const timer = setInterval(() => {
    if (!root.contains(document.activeElement)) {
      render();
    }
  }, refreshIntervalMs);

  return () => {
    stops.forEach((stop) => {
      stop();
    });
    clearInterval(timer);
    root.remove();
  };
};
