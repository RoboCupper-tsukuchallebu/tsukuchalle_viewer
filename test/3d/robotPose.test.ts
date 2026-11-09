import { expect, it } from "vitest";
import fixtures from "../fixtures/rosMessages.json";
import { createChannelDecoder } from "../../src/decoding/channelDecoder.ts";
import { TransformTree, type TransformMessage } from "../../src/panels/3d/transformTree.ts";
import { robotPoseInMap, displayedRobotPose, isOdometry } from "../../src/panels/3d/robotPose.ts";
import { getRobotPoseInMap, registerRobotPoseProvider } from "../../src/panels/3d/viewApi.ts";

function decode(fixture: { schema: string; hex: string }): unknown {
  const decoder = createChannelDecoder({ encoding: "cdr", schema: fixture.schema });
  if (!decoder.isDecodable) throw new Error(decoder.reason);
  return decoder.decode(Uint8Array.from(Buffer.from(fixture.hex, "hex")));
}

it("合成した map 上のロボット姿勢と古さを返す", () => {
  const tree = new TransformTree();
  expect(robotPoseInMap(tree, 0).isAvailable).toBe(false);
  tree.update(decode(fixtures.tfMessage) as TransformMessage, false, 0);
  const pose = robotPoseInMap(tree, 0);
  expect(pose.isAvailable).toBe(true);
  if (pose.isAvailable) {
    expect(pose.x).toBeCloseTo(8);
    expect(pose.y).toBeCloseTo(-1);
    expect(pose.z).toBeCloseTo(0.75);
    expect(pose.yawRadians).toBeCloseTo(Math.PI / 2);
  }
  expect(robotPoseInMap(tree, 1001).isAvailable).toBe(false);
});

it("姿勢の提供元を解除できる", () => {
  const release = registerRobotPoseProvider(() => ({ isAvailable: true, x: 1, y: 2, z: 3, yawRadians: 0 }));
  expect(getRobotPoseInMap().isAvailable).toBe(true);
  release();
  expect(getRobotPoseInMap().isAvailable).toBe(false);
});

it("TF がなければ odom の姿勢を表示フレームへ合成する", () => {
  const transformTree = new TransformTree();
  const message = decode(fixtures.tfMessage) as TransformMessage;
  transformTree.update({ transforms: message.transforms.slice(0, 1) }, true, 0);
  const odometry = decode(fixtures.odometry);
  if (!isOdometry(odometry)) {
    throw new Error("odom の形式が不正です");
  }
  const result = displayedRobotPose(transformTree, odometry, "map");
  expect(result.isAvailable).toBe(true);
  if (result.isAvailable) {
    expect(result.position.x).toBeCloseTo(10 - odometry.pose.pose.position.y);
    expect(result.position.y).toBeCloseTo(-2 + odometry.pose.pose.position.x);
    expect(result.position.z).toBeCloseTo(0.5 + odometry.pose.pose.position.z);
  }
  expect(displayedRobotPose(new TransformTree(), undefined, "map").isAvailable).toBe(false);
});
