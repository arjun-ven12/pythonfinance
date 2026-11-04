import { object } from "./data";
export function assertPaperControl(value: unknown) {
  const c = object(value);
  if (c.mode !== "PAPER_AUTONOMOUS" || c.accountId !== "INTERNAL_PAPER")
    throw Error(
      "Only the configured Internal Paper controller can be resumed or edited on mobile.",
    );
  return c;
}
export function assertStopAcknowledged(value: unknown) {
  const data = object(value);
  const c = object(data.control ?? data);
  if (c.status !== "SUSPENDED" || !Number.isInteger(c.generation))
    throw Error(
      "The server did not acknowledge a persisted emergency stop. State is unknown.",
    );
  return c;
}
