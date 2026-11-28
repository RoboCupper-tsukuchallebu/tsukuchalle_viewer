# tsukuchalle_viewer

つくちゃれ部のロボットを、ブラウザから見る・操作するための Web ビューアです。X13 の foxglove_bridge（Foxglove WebSocket、副プロトコル `foxglove.sdk.v1`）につなぎ、Three.js で描きます。仕様は [Issue #1](../../issues/1) にあります。

今できること:

- `foxglove.sdk.v1` の薄いクライアント（`src/connection/`）。申し出る副プロトコルは `foxglove.sdk.v1` だけ。切れたら 1 秒から間隔を延ばして（最大 10 秒）つなぎ直し、トピックは名前で購読し直す。
- cdr（ROS 2）と json のデコード（`src/decoding/`）。トピックごとの最新値と受信時刻を持つ store（`src/store/`）。
- 上部バー（閲覧用・書き込み用それぞれの接続の状態、capabilities）と、7 つのタブ（3D・地図・衛星・状態・パラメータ・サービス・チャネル）。停止・一時停止は押せる（書き込みのスイッチが無効でも使える）。書き込みのスイッチは、有効にしたときだけ waypoint・サービス・手動走行の速さなどの書き込みを使えるようにする。

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

書き込み用の 2 本目の bridge はループバックだけで待ち受ける必要があり、tsukuchalle_description 側で用意します。導入前は、許可リストが設定されていれば `/ws-control` は 502 となり、書き込み用は「つなぎ直し中」のままです。このあいだ、停止・一時停止と書き込みの操作は届きません。

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

### 3D 表示

3D タブでは TF を使って点群、保存地図、軌跡、走行経路とロボットを表示します。表示フレーム、点数の上限、保存地図と軌跡のトピックを変更できます。既定の点群は aligned_scan です。velodyne は必要なときだけ有効にしてください（約 1.5 MB × 10 Hz）。地面のクリックは map 座標に変換され、TF が不足または古い場合は理由を表示します。

PR 7 からは `src/panels/3d/viewApi.ts` の `onGroundClick(listener: (point: { x: number; y: number }) => void): () => void`、`onGroundClickRejected(listener: (reason: string) => void): () => void`、`addOverlay(object: Object3D): () => void` を import できます。返り値はいずれも登録を解除する関数です。クリックは map 座標の x・y で、ロボットの z の高さにある水平面との交点です。必要な TF がない場合や動的 TF が古い場合は配置できず、理由が通知されます。オーバーレイはパネルを開き直しても再び追加されます。

`addOverlay` に渡す物は **map 座標**で置いてください。パネルが map から表示フレームへの変換を掛けるので、表示フレームが odom や base_link でも印は同じ場所に出ます。map から表示フレームへの TF が無いときは隠れます。

ロボットの位置は `getRobotPoseInMap(): RobotPoseInMap` で取れます。型は `{ isAvailable: true; x: number; y: number; z: number; yawRadians: number } | { isAvailable: false; reason: string }` で、map → base_link の TF から求めます。TF が無い、動的 TF が古い、3D パネルが開かれていないときは `isAvailable: false` と理由を返します（waypoint の確認の画面で、ロボットから最初の waypoint までの距離を出すために使います）。

### TF の購読

TF の購読はアプリ起動時にストアが保持します。3D タブを閉じても map 座標のロボット姿勢を参照できるようにするためです。動的 TF の古さはブラウザでの受信時刻から判断します。3D パネルも表示更新のために同じトピックを購読しますが、接続側が購読を共有します。

### Waypoint と mission

3D の地面をクリックすると map 座標の waypoint が追加されます。一覧で到達半径（0 は mission の既定値）、順序、削除を編集できます。書き込みスイッチを有効にし、「mission に送信」から内容と注意を確認して送信します。スイッチは再読み込みすると無効に戻ります。確認画面では Enter で送信されません。

停止・一時停止は全タブ共通の上部バーにあり、書き込みスイッチが無効でも使えます。停止は非常停止の代わりにはなりません。再開には確認が必要です。接続が切れている場合は操作できません。閲覧先を変更した場合、書き込み用接続は作られません。ロボットを動かす操作には確認画面を出し、書き込みは既定で無効とします。

#### lightnav_sim で停止の応答時間を測る

lightnav_sim と書き込み用 bridge を起動し、点群を購読したまま waypoint を送信します。受理されて get_result を待っている間に、ブラウザの開発者ツールの WebSocket フレームで cancel_goal の要求送信から対応する応答までの時間を測ります。mission を再開して同じ条件で 10 回繰り返し、各回の時間、中央値、最大値を記録します。目安は 1 秒以内です。同じ待機中に一時停止も応答すること、goal が無い停止で ERROR_REJECTED と空の一覧が返ることも確認します。

3D パネルの「障害物を表示」ではローカルの占有グリッドと stop・slow ゾーン、障害物状態を表示します。不明セルは別のスイッチで表示でき、ゾーン寸法は画面で変更できます。グリッドとゾーンの表示には各フレームから表示フレームへの TF が必要です。 local_grid の値は現在 0 と 100 のみで、-1 は出ないため「不明セルを表示」は効果がありません。公開グリッドは膨張後のセルですが、ゾーン判定は膨張前のセルで行うため、赤いセルがゾーンにかかっていても占有と判定されないことがあります。

### 手動走行の最大の速さ（パラメータのタブ）

パッドのスティックをいっぱいに倒したときの最大の速さ（直進 m/s・旋回 rad/s）を、走行中に変えます（[Issue #16](../../issues/16)）。

使い方:

1. 上部バーの「書き込み」のスイッチを有効にします（ページを開き直すと無効に戻ります）。
2. 「パラメータ」のタブで、直進・旋回のスライダーを動かします。最大はロボットから読んだ上限です（直進は 0.10 m/s から 0.05 刻み、旋回は 0.3 rad/s から 0.1 刻み）。
3. 「適用」を押すと確認の画面が出ます。「変える」を押すと送ります。Enter キーでは送りません。「元に戻す」で、選んだ値を今の値に戻します。
4. 今の値は 2 秒ごとに読み直します。最後に読めてから 5 秒を超えると「古い」と出て、「適用」は押せません。

送る値には必ず `type: "float64"` を付けます。foxglove_bridge は、型の印の無い `1.0` を整数として扱い、ノードが拒むためです。ロボットが拒むと「ロボットが受け付けませんでした」、12 秒返事が無いと「応答がありません」と出ます。拒まれた理由は、ブリッジが返さないので出せません。

読み書きに使うのは書き込み用の接続で、名前は `src/config.ts` の `teleopSpeedParameterNames` にあります（`scale_linear.x`・`scale_angular.yaw` は読む・書く、`scale_linear_limit.x`・`scale_angular_limit.yaw` は読むだけ）。上限の数はビューアに書いていません。

- **画面のスイッチと画面の範囲は防護ではありません。本当の上限はロボット側（tsukuchalle_drivers の teleop）です。** 範囲外の値は、ロボットが拒みます。
- **teleop を起動し直すと、設定ファイルの値に戻ります。** 画面で遅くしたあとに起動し直すと、設定ファイルの値（今は速い側）に戻り、画面で決めた値より速くなることがあります。選んだ値も変えた値も、ブラウザには覚えません（`localStorage` に書きません）。ずっと変えたいときは、設定ファイルを PR で変えます。
- ロボット側が古い（上限つきの teleop が入っていない）間は、「上限が読めません」と出て、何も送れません。
- 閲覧先を `?ws=` で変えているときは、書き込み用の接続が無いので、この画面は使えません。

### サービス管理

`.env` の `SERVICE_MANAGER_PORT`、`DRIVERS_DIR`、`LIGHTNAV_DIR`、`BAGS_DIR` を設定します。各ディレクトリはロボット PC 上に作成済みの絶対パスを指定します。前二者はそれぞれ対象の `compose.yaml` と `.env` を含むディレクトリです。Compose が相対 bind mount をホスト側で正しく解決できるよう、管理コンテナには同じ絶対パスで読み取り専用にマウントし、`--project-directory` を指定します。対象プロジェクトの `.env` を Compose が読みます。

サービス管理は Docker ソケットを扱うため、**root と同等の権限**を持ちます。管理 API はループバックだけで待ち受け、nginx の `/api/services` は Host と Origin の許可リストで制限します。GET で Origin が無い場合は Referer の origin を検査し、どちらも無ければ拒否します。cross-site の要求も拒否します。許可リストに登録するのは信頼できる接続先だけにしてください。書き込みスイッチは既定で無効で、各操作に確認画面が出ます。画面の停止は非常停止ではありません。

地図作成と自己位置推定の切り替えには、実行中の localization を先に停止してください。停止は Compose の SIGINT と猶予時間を使い地図の保存を待ちます。地図作成は既存の地図を上書きします。rosbag は固定トピックを `BAGS_DIR` に記録し、停止時は SIGINT で終了を待ちます。記録には drivers のイメージが必要です。

記録するトピック（`service-manager/manager.py` の `TOPICS`。画面からは変えられません）:

| トピック | 出どころ |
|---|---|
| `/tf` `/tf_static` | 各ノード |
| `/wheel/odom` `/wheel/motor_states` | tsukuchalle_drivers（`motor_states` は各モーターの回転速度・電流・角度の生データ） |
| `/joint_states` | tsukuchalle_description |
| `/joy` `/cmd_vel` `/cmd_vel_teleop` `/cmd_vel_mux` | 操縦入力と駆動への指令 |
| `/velodyne_points` | tsukuchalle_drivers |
| `/fix` `/fix_all` `/nmea` `/rtk/fix` `/rtk/fix_all` | datagnss-ma10p-ros2 |
| `/imu/data_raw` `/imu/data` `/imu/odom` `/imu/localization/odom` `/imu/stationary` `/imu/temperature` | spresense-imu-ros2 |
| `/diagnostics` `/system/low_battery` | 各ノード、host_monitor |
| `/lightnav/localization/odom` `/lightnav/localization/map_cloud` `/lightnav/localization/path` `/lightnav/pose` `/lightnav/local_grid` | lightweight-nav-stack |

- 容量は `/velodyne_points` が大半で、およそ 15 MB/s（1 時間で約 55 GB）です。記録の前に `BAGS_DIR` の空きを確かめてください。
- drivers のイメージに型が無いトピックは記録できないので入れていません（`lightnav_msgs` の status、`/velodyne_packets`）。
- 記録の開始時に出ていないトピックは、出始めてから記録されます。`/wheel/motor_states` は、これを出す版の drivers がロボット PC に入っているときだけ記録されます。

サービス管理の単体試験は `python3 -m unittest discover -s service-manager` で実行します。現在の CI にはこの試験が含まれていません。
