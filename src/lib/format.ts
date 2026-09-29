/** Formats an ISO timestamp as "Sep 29 2026" in the device's time zone; "" when missing or invalid. */
export function formatDate(value: string | null | undefined): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("month")} ${part("day")} ${part("year")}`;
}
