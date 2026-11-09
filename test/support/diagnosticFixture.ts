import { readFileSync } from "node:fs";

const values = JSON.parse(readFileSync(new URL("../fixtures/satellitesDiagnostics.json", import.meta.url), "utf8")) as Record<string, string>;

export const diagnosticSchema = `std_msgs/Header header
diagnostic_msgs/DiagnosticStatus[] status
====
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
====
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec
====
MSG: diagnostic_msgs/DiagnosticStatus
byte level
string name
string message
string hardware_id
diagnostic_msgs/KeyValue[] values
====
MSG: diagnostic_msgs/KeyValue
string key
string value`;

// CDR の規則に従って手で組み立てる。MessageWriter は使用しない。
export function diagnosticBytes(): Uint8Array {
  const bytes: number[] = [0, 1, 0, 0];
  const align = (): void => { while ((bytes.length - 4) % 4) bytes.push(0); };
  const number = (value: number): void => { align(); bytes.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255); };
  const string = (value: string): void => { const encoded = new TextEncoder().encode(value); number(encoded.length + 1); bytes.push(...encoded, 0); };
  number(0); number(0); string(""); number(1);
  bytes.push(0); string("ma10p_node: satellites"); string("ok"); string("");
  number(Object.keys(values).length);
  for (const [key, value] of Object.entries(values)) { string(key); string(value); }
  return Uint8Array.from(bytes);
}
