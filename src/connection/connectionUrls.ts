export type ConnectionUrls = {
  /** 閲覧用。?ws= で変えられる。 */
  viewingUrl: string;
  /**
   * 書き込み用。URL の ? や画面の設定では変えられない。作られたリンクを開いただけで、偽の bridge に goal を送らないため。
   * 閲覧用の接続先が既定から変えられているときは、書き込み用の接続は作らない（null）。
   */
  writingUrl: string | null;
  isViewingUrlOverridden: boolean;
};

const websocketPath = "/ws";

export type PageLocation = { protocol: string; host: string; search: string };

/** ページを配ったホストの /ws が既定。ws: か wss: はページに合わせる。 */
export function resolveConnectionUrls(location: PageLocation): ConnectionUrls {
  const sameOriginUrl = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${websocketPath}`;
  const override = parseWebSocketUrl(new URLSearchParams(location.search).get("ws"));
  if (override !== undefined && override !== sameOriginUrl) {
    return { viewingUrl: override, writingUrl: null, isViewingUrlOverridden: true };
  }
  return { viewingUrl: sameOriginUrl, writingUrl: sameOriginUrl, isViewingUrlOverridden: false };
}

/** ws: と wss: の URL だけを受け付ける。ほかは undefined。 */
export function parseWebSocketUrl(text: string | null): string | undefined {
  if (text === null || text === "") {
    return undefined;
  }
  try {
    const url = new URL(text);
    return url.protocol === "ws:" || url.protocol === "wss:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
