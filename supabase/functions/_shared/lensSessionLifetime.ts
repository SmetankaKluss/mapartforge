export function lensSessionStatus(
  row: { status: "active" | "offline" | "closed" | "expired"; expires_at: string; last_editor_seen_at: string },
  now: number,
  offlineMs: number,
): "active" | "offline" | "closed" | "expired" {
  if (row.status === "closed" || row.status === "expired") return row.status;
  if (new Date(row.expires_at).getTime() <= now) return "expired";
  return now - new Date(row.last_editor_seen_at).getTime() >= offlineMs ? "offline" : "active";
}
