import { AttendanceStatus } from "@prisma/client";

export function calculateAttendancePercentage(statuses: AttendanceStatus[]): number {
  const counted = statuses.filter((status) => status !== "EXCUSED");
  if (counted.length === 0) return 0;
  const presentEquivalent = counted.filter((status) => status === "PRESENT" || status === "LATE").length;
  return Math.round((presentEquivalent / counted.length) * 10000) / 100;
}
