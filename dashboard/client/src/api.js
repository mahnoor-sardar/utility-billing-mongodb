export async function api(path, body) {
  let res;
  try {
    res = await fetch("/api" + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  } catch { throw new Error("Cannot reach the API. Is the server running on port 4000?"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
export const rs = (v) => "Rs " + Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const num = (v) => Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
export const compact = (v) => Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v || 0);
export const date = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export function ago(d) {
  const s = Math.round((Date.now() - new Date(d)) / 1000);
  if (s < 60) return s + "s ago"; if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago"; return date(d);
}
export function slabPreview(units, t) {
  if (!t || !(units > 0)) return null;
  let rem = units; const rows = [];
  for (const s of [...t.slabs].sort((a, b) => a.from - b.from)) {
    if (rem <= 0) break;
    const u = Math.min(rem, s.to == null ? rem : s.to - s.from + 1);
    rows.push({ ...s, units: u, amount: Math.round(u * s.rate * 100) / 100 }); rem -= u;
  }
  const energy = rows.reduce((a, r) => a + r.amount, 0), fixed = t.fixed_charge, tax = Math.round((energy + fixed) * t.tax_rate * 100) / 100;
  return { rows, energy, fixed, tax, total: Math.round((energy + fixed + tax) * 100) / 100 };
}
