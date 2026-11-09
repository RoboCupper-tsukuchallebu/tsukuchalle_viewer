export const SYSTEM_ORDER = ["GPS", "QZSS", "Galileo", "GLONASS", "BeiDou", "NavIC"] as const;
const MAX_ELEVATION = 90;
const MAX_AZIMUTH = 359;
const MAX_CN0 = 99;
const SIGNAL_FIELDS_START = 4;
export type Signal = { name: string; cn0: number | null };
export type Satellite = { system: string; prn: string; elevation: number | null; azimuth: number | null; signals: Signal[] };

function integer(value: string | undefined): number | null {
  return value !== undefined && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

function parseSignals(parts: string[]): Signal[] {
  const signals: Signal[] = [];
  for (let index = SIGNAL_FIELDS_START; index < parts.length; index += 2) {
    const cn0 = parts[index + 1] === "-" ? null : integer(parts[index + 1]);
    if (parts[index + 1] !== "-" && (cn0 === null || cn0 > MAX_CN0)) {
      continue;
    }
    signals.push({ name: parts[index] ?? "", cn0 });
  }
  return signals;
}

function parseSatellite(key: string, value: string): Satellite | null {
  const split = key.lastIndexOf(" ");
  if (split <= 0 || split === key.length - 1) {
    return null;
  }
  const parts = value.trim().split(/\s+/);
  if (parts.length < SIGNAL_FIELDS_START || parts[0] !== "el" || parts[2] !== "az" || (parts.length - SIGNAL_FIELDS_START) % 2 !== 0) {
    return null;
  }
  const elevation = parts[1] === "-" ? null : integer(parts[1]);
  const azimuth = parts[3] === "-" ? null : integer(parts[3]);
  if ((parts[1] !== "-" && elevation === null) || (parts[3] !== "-" && azimuth === null)) {
    return null;
  }
  return {
    system: key.slice(0, split), prn: key.slice(split + 1),
    elevation: elevation !== null && elevation <= MAX_ELEVATION ? elevation : null,
    azimuth: azimuth !== null && azimuth <= MAX_AZIMUTH ? azimuth : null,
    signals: parseSignals(parts),
  };
}

function systemOrder(system: string): number {
  const index = SYSTEM_ORDER.findIndex((name) => name === system);
  return index < 0 ? SYSTEM_ORDER.length : index;
}

export function parseSatellites(values: Record<string, string>): { satellites: Satellite[]; unparsed: string[] } {
  const satellites: Satellite[] = [];
  const unparsed: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    const satellite = parseSatellite(key, value);
    if (satellite) {
      satellites.push(satellite);
    } else {
      unparsed.push(key);
    }
  }
  satellites.sort((left, right) => systemOrder(left.system) - systemOrder(right.system) || left.system.localeCompare(right.system) || left.prn.localeCompare(right.prn, undefined, { numeric: true }));
  return { satellites, unparsed };
}

export function parseL6Cn0(value: string): Record<string, number> {
  const result: Record<string, number> = {};
  const entries = value.replace(/\s*\(unreliable, display only\)\s*$/, "");
  if (entries === "none") {
    return result;
  }
  for (const entry of entries.split(",")) {
    const match = /^\s*(\d+):(\d+)\s*$/.exec(entry);
    if (match?.[1] && match[2] && Number(match[2]) <= MAX_CN0) {
      result[match[1]] = Number(match[2]);
    }
  }
  return result;
}
