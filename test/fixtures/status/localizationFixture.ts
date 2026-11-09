// 本番 bridge 由来の fixture ではなく、CDR の配置を手で組み立てた合成値。
export const localizationMessage = {
  header: { stamp: { sec: 1, nanosec: 2 }, frame_id: "odom" },
  state: 1, mode: 0, is_large_correction: false, is_gps_conflict: false,
  pending_correction_m: 1, last_inlier_ratio: 0.5, last_lidar_odom_inlier_ratio: 2,
  seconds_since_last_match: 3, odom_only_distance_m: 4, gps_status: 2,
  gps_std_m: 5, last_scan_time_ms: 6, last_match_time_ms: 7,
  position_std_m: [1, 2, 3], last_error: "ok",
};

// オフセットはヘッダを含む。アラインメントの原点はヘッダ直後の 4。
export const localizationBytes = new Uint8Array([
  0, 1, 0, 0, // 0: リトルエンディアン CDR ヘッダ
  1, 0, 0, 0, 2, 0, 0, 0, // 4: stamp の sec と nanosec
  5, 0, 0, 0, 111, 100, 111, 109, 0, // 12: frame_id の長さと odom、終端
  1, 0, 0, 0, // 21: state、mode、2 つの bool
  0, 0, 0, // 25: float32 の前の詰め物
  0, 0, 128, 63, 0, 0, 0, 63, // 28: pending correction、inlier ratio
  0, 0, 0, 64, 0, 0, 64, 64, 0, 0, 128, 64, // 36: 残りの float32 3 個
  2, 0, 0, 0, // 48: gps_status と詰め物
  0, 0, 160, 64, 0, 0, 192, 64, 0, 0, 224, 64, // 52: GPS、scan、match
  0, 0, 0, 0, // 64: float64 の前の詰め物
  0, 0, 0, 0, 0, 0, 240, 63, // 68: position_std_m[0]
  0, 0, 0, 0, 0, 0, 0, 64, // 76: position_std_m[1]
  0, 0, 0, 0, 0, 0, 8, 64, // 84: position_std_m[2]
  3, 0, 0, 0, 111, 107, 0, // 92: last_error の長さと ok、終端
]);
