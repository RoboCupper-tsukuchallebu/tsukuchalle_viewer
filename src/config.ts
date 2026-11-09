// トピック名・サービス名の既定値。画面で変えられるようにするのは各パネルの PR。
// 接続先（ホスト名・IP アドレス）はここに書かない（connection/connectionUrls.ts がページのホストから作る）。

const mission = "/lightnav/mission";
const followWaypointsAction = `${mission}/follow_waypoints`;

export const topicNames = {
  // 3D
  velodynePoints: "/velodyne_points",
  alignedScan: "/lightnav/localization/aligned_scan",
  localizationOdometry: "/lightnav/localization/odom",
  // 依頼にあった /lightnav/saved_map と /lightnav/saved_trajectory はどのリポジトリにも無い。
  // lightweight-nav-stack の Draft PR #56 の名前を既定にする（仕様 7.1 の 2）。
  savedMap: "/lightnav/localization/map_cloud",
  savedTrajectory: "/lightnav/localization/path",
  missionPath: "/lightnav/path",
  transform: "/tf",
  staticTransform: "/tf_static",
  // 状態
  localizationStatus: "/lightnav/localization/status",
  followStatus: "/lightnav/follow_status",
  obstacleStatus: "/lightnav/obstacle_status",
  diagnostics: "/diagnostics",
  bridgeSystemInformation: "/foxglove_bridge/sysinfo",
  // 地図
  rtkFix: "/rtk/fix_all",
  fix: "/fix_all",
  // waypoint（action は隠しサービスとトピックで扱う。仕様 3.3 節）
  missionFeedback: `${followWaypointsAction}/_action/feedback`,
  missionStatus: `${followWaypointsAction}/_action/status`,
} as const;

export const serviceNames = {
  sendGoal: `${followWaypointsAction}/_action/send_goal`,
  getResult: `${followWaypointsAction}/_action/get_result`,
  cancelGoal: `${followWaypointsAction}/_action/cancel_goal`,
  pause: `${mission}/pause`,
  resume: `${mission}/resume`,
} as const;

// diagnostics の status の名前（datagnss-ma10p-ros2 ほか）
export const diagnosticNames = {
  battery: "host: battery",
  receiver: "ma10p_node: receiver",
  correction: "ma10p_node: CLAS",
  satellites: "ma10p_node: satellites",
  rtk: "rtklib_fix_node: RTK",
  localizationGnss: "localization_node: GNSS",
} as const;

export const pointCloudLimits = {
  /** 1 つの点群で描く点の上限。超えたら等間隔に間引く。 */
  defaultMaximumPoints: 200_000,
  /** 保存した地図は 1 回だけ届くので別の上限にする。 */
  savedMapMaximumPoints: 2_000_000,
} as const;

// 地図タイル（国土地理院の標準地図が既定。出典の表示が要る。仕様 3.4 節）
export const mapTiles = {
  standardUrlTemplate: "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
  minimumZoom: 9,
  maximumZoom: 18,
} as const;

// 停止・一時停止の応答を待つ時間。これを過ぎたら赤く出し続ける（仕様 6 章の 3）。
export const stopResponseTimeoutMs = 5000;

export const staleThresholdMs = {
  /** 途中の動的な TF がこれより古いと waypoint を置けない。 */
  dynamicTransform: 1000,
} as const;

export const storageKeys = {
  selectedTab: "tsukuchalle-viewer.selectedTab",
} as const;
