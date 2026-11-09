# tsukuchalle_viewer

つくちゃれ部のロボットを、ブラウザから見る・操作するための Web ビューアです。X13 の foxglove_bridge（Foxglove WebSocket、副プロトコル `foxglove.sdk.v1`）につなぎ、Three.js で描きます。仕様は [Issue #1](../../issues/1) にあります。

今できること（PR 1 の土台）:

- `foxglove.sdk.v1` の薄いクライアント（`src/connection/`）。申し出る副プロトコルは `foxglove.sdk.v1` だけ。切れたら 1 秒から間隔を延ばして（最大 10 秒）つなぎ直し、トピックは名前で購読し直す。
- cdr（ROS 2）と json のデコード（`src/decoding/`）。トピックごとの最新値と受信時刻を持つ store（`src/store/`）。
- 上部バー（閲覧用・書き込み用それぞれの接続の状態、capabilities）と、5 つのタブの枠とチャネルの一覧。停止・一時停止・書き込みのスイッチは場所だけあり、まだ押せない。

## 安全について

- **画面の停止は非常停止ではありません。** 通信が切れると届きません。ロボットの非常停止スイッチの代わりにしないでください。
- ロボットを動かす操作（PR 7 以降）は、書き込みのスイッチを画面で有効にしたときだけ使え、送る前に必ず確認の画面を出します。スイッチは開き直すと無効に戻ります。
- 画面のスイッチは防護ではありません。本当の制限は bridge の設定で行います。

## 接続先

閲覧用はページと同じ origin の `/ws`、書き込み用は `/ws-control` です（`ws:` か `wss:` はページに合わせる）。nginx がそれぞれ別の foxglove_bridge に中継します。接続先をコードに書きません。

- 閲覧用の接続先は、URL の `?ws=ws://ホスト:ポート` で変えられます（`ws:` と `wss:` だけ）。変えたときは上部バーに接続先が出ます。
- 閲覧用の接続先を変えたときは、書き込み用の接続は作りません。書き込み用の接続先は URL でも画面でも変えられません。

## 開発

Node 24 が要ります。

```sh
npm ci
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run typecheck # tsc --noEmit
npm run lint
npm run build      # tsc と vite build
npx playwright install chromium   # 初回だけ
npm run test:e2e   # vite build のあと、Playwright（幅 360 px の画面の試験）
```

`vite dev` から bridge へ直接つなぐときは、commit しない `.env.local` に中継先を書きます。

```sh
VIEWER_DEV_BRIDGE_URL=ws://localhost:8765
VIEWER_DEV_CONTROL_BRIDGE_URL=ws://localhost:8766
```

それぞれ未設定なら対応する dev proxy は作りません。

試験は、`ws` で立てた偽の `foxglove.sdk.v1` サーバーとの接続試験（`test/foxgloveClient.test.ts`）、op とバイナリのフレーム、CDR の単体試験、happy-dom による画面の試験です。幅 360 px（スマートフォン）で、どのタブでも停止・一時停止が画面の中に見え、ページを下まで送っても見え続けることは、Playwright（Chromium、`e2e/`）が偽のサーバーにつないで確かめます。

## 配信（X13）

ビューアは Docker の nginx から配ります。ビルドはビルド機で行い、イメージをロボット PC に送ります（Mac の Docker は使いません）。

```sh
# ビルド機で、コミット済みのクローンの中から
scripts/deploy.sh <ロボットの SSH 先>
```

`scripts/deploy.sh` は `compose.yaml` と `.env.example` をロボット PC の `~/tsukuchalle_viewer/` に送ります。初回だけ `.env.example` を `.env` に写して（必要なら編集して）起動します。

```sh
cd ~/tsukuchalle_viewer
cp .env.example .env   # 初回だけ
docker compose up -d
```

`compose.yaml` は `restart: "no"` です（tsukuchalle_description の `compose.yaml` に合わせている。ロボット PC を再起動したあとは、人が `docker compose up -d` します）。nginx のイメージは digest で固定しています。

| 変数 | 既定 | 意味 |
|---|---|---|
| `VIEWER_PORT` | 8080 | ビューアが待ち受けるポート |
| `VIEWER_BRIDGE_PORT` | 8765 | `/ws` の中継先。同じホストの foxglove_bridge のポート |
| `VIEWER_CONTROL_BRIDGE_PORT` | 8766 | `/ws-control` の中継先。仮の既定で、2 本目の bridge の設定に合わせる |
| `VIEWER_ALLOWED_ORIGINS` | 空 | 書き込み用に許可する Origin（空白区切り） |
| `VIEWER_ALLOWED_HOSTS` | 空 | 書き込み用に許可する Host（空白区切り） |

書き込み用の 2 本目の bridge はループバックだけで待ち受ける必要があり、tsukuchalle_description 側で用意します。導入前は、許可リストが設定されていれば `/ws-control` は 502 となり、書き込み用は「つなぎ直し中」のままです。停止・一時停止はまだ押せません。

許可リストが空なら `/ws-control` はすべて 403 です。Host と Origin はブラウザが送るヘッダーの値をそれぞれ完全一致で照合します。値に使える文字は英数字と `._:/[]-` だけで、それ以外を含む値は無視します。例は `.env.example` を参照してください。閲覧用 `/ws` に Origin 制限はありません。

`compose.yaml` は `network_mode: host` です。ブラウザからは `http://<ロボット PC>:<VIEWER_PORT>/` を開きます（Tailscale 越し）。

## CI

`.github/workflows/ci.yml`

- `build`（必須）: `npm ci`、`tsc --noEmit`、`eslint .`、`vitest run`、`vite build`、Playwright（Chromium だけ入れて `playwright test`）。
- `docker`（必須ではない）: イメージを作って起動し、ページが返ることと、`/ws` が `Upgrade` と `Sec-WebSocket-Protocol` を通して偽の bridge に中継されることに加え、`/ws-control` の許可された接続と Host・Origin の不一致や Origin 欠落時の 403 を確かめる。

## ライセンス

未定（仕様 7.2 の 5 で MIT を提案中）。

## 公開リポジトリです

IP アドレス、ホスト名、メールアドレス、緯度経度などの位置、個人の情報を、コード・文書・commit・PR に書かないでください。
