import { describe, expect, test } from "vitest";
import values from "./fixtures/satellitesDiagnostics.json";
import { parseL6Cn0, parseSatellites } from "../src/panels/satellites/parseSatellites.ts";
import { createChannelDecoder } from "../src/decoding/channelDecoder.ts";
import { DiagnosticsStore } from "../src/store/diagnosticsStore.ts";
import { diagnosticBytes, diagnosticSchema } from "./support/diagnosticFixture.ts";

describe("衛星の診断", () => {
  test("全衛星と未知の信号・衛星系を保持する", () => {
    // Arrange・Act
    const result = parseSatellites(values);
    // Assert
    expect(result.satellites).toHaveLength(10);
    expect(result.unparsed).toEqual([]);
    expect(result.satellites.find((item) => item.prn === "20")?.elevation).toBeNull();
    expect(result.satellites.find((item) => item.prn === "13")?.signals[0]?.cn0).toBeNull();
    expect(result.satellites.find((item) => item.system === "GN")).toBeDefined();
    expect(result.satellites.flatMap((item) => item.signals.map((signal) => signal.name))).toEqual(expect.arrayContaining(["sig3", "sig?"]));
  });
  test("崩れた欄を安全に飛ばし空の入力も扱う", () => {
    // Arrange
    const input = { good: "el 1 az 2", "GPS 01": "el x az 2", "GPS 02": "el 2", "GPS 03": "el 4 az 2 L1 bad L2 33", "GPS 04": "el 91 az 360" };
    // Act
    const result = parseSatellites(input);
    // Assert
    expect(result.unparsed).toHaveLength(3);
    expect(result.satellites[0]?.signals).toEqual([{ name: "L2", cn0: 33 }]);
    expect(result.satellites[1]).toMatchObject({ elevation: null, azimuth: null });
    expect(parseSatellites({}).satellites).toEqual([]);
  });
  test("L6 の参考値と none を解析する", () => {
    // Arrange・Act・Assert
    expect(parseL6Cn0("02:39, 03:35 (unreliable, display only)")).toEqual({ "02": 39, "03": 35 });
    expect(parseL6Cn0("none (unreliable, display only)")).toEqual({});
  });
  test("手組みの CDR をデコードしてストアから解析できる", () => {
    // Arrange
    const decoder = createChannelDecoder({ encoding: "cdr", schemaEncoding: "ros2msg", schema: diagnosticSchema });
    const store = new DiagnosticsStore();
    // Act
    if (!decoder.isDecodable) throw new Error(decoder.reason);
    store.update(decoder.decode(diagnosticBytes()), 123);
    // Assert
    expect(parseSatellites(store.get("ma10p_node: satellites")?.values ?? {}).satellites).toHaveLength(10);
  });
});

test("範囲外の角度と信号を除き衛星系を既定順に並べる", () => {
  // Arrange
  const input = { "GN 01": "el - az - sig1 20", "QZSS 02": "el 91 az 360 L6D 100 L6E 39", "GPS 01": "el 1 az 2", invalid: "el 1 az 2" };
  // Act
  const result = parseSatellites(input);
  // Assert
  expect(result.satellites.map((satellite) => satellite.system)).toEqual(["GPS", "QZSS", "GN"]);
  expect(result.satellites[1]).toMatchObject({ elevation: null, azimuth: null, signals: [{ name: "L6E", cn0: 39 }] });
  expect(result.unparsed).toEqual(["invalid"]);
});
