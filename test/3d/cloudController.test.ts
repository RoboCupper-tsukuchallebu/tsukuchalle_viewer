import { expect, it } from "vitest";
import { defaultPointCloud, topicNames } from "../../src/config.ts";
import { topicToCloudLayerId } from "../../src/panels/3d/cloudController.ts";

it("トピックとスイッチに応じて点群の ID を選ぶ", () => {
  expect(topicToCloudLayerId(defaultPointCloud, topicNames.savedMap, false)).toBe("pointCloud");
  expect(topicToCloudLayerId(topicNames.savedMap, topicNames.savedMap, false)).toBe("savedMap");
  expect(topicToCloudLayerId(topicNames.velodynePoints, topicNames.savedMap, false)).toBeUndefined();
  expect(topicToCloudLayerId(topicNames.velodynePoints, topicNames.savedMap, true)).toBe("velodyne");
  expect(topicToCloudLayerId("/other", topicNames.savedMap, true)).toBeUndefined();
});
