export type Candidate = {
  x: number;
  y: number;
  width: number;
  height: number;
  extractedText: string;
  candidatePrice?: string;
  confidence: number;
};
/** Heuristic OCR proposals only. Human reviewers must establish the product and price. */
export function detectCandidates(
  tsv: string,
  pageWidth: number,
  pageHeight: number,
): Candidate[] {
  const groups = new Map<
    string,
    {
      left: number;
      top: number;
      right: number;
      bottom: number;
      text: string[];
      confidence: number[];
    }
  >();
  for (const line of tsv.split(/\r?\n/).slice(1)) {
    const c = line.split("\t");
    if (c.length < 12 || c[0] !== "5" || !c[11].trim()) continue;
    const [left, top, width, height, confidence] = c.slice(6, 11).map(Number);
    if (
      ![left, top, width, height, confidence].every(Number.isFinite) ||
      confidence < 0
    )
      continue;
    const key = c.slice(1, 5).join(":");
    const g = groups.get(key) || {
      left,
      top,
      right: left + width,
      bottom: top + height,
      text: [],
      confidence: [],
    };
    g.left = Math.min(g.left, left);
    g.top = Math.min(g.top, top);
    g.right = Math.max(g.right, left + width);
    g.bottom = Math.max(g.bottom, top + height);
    g.text.push(c[11]);
    g.confidence.push(confidence);
    groups.set(key, g);
  }
  const results: Candidate[] = [];
  for (const g of groups.values()) {
    const text = g.text.join(" "),
      match = text.match(/(?:₹|\bRs\.?|\bINR)\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (!match) continue;
    const price = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(price) || price <= 0 || price > 10000000) continue;
    const x = Math.max(0, Math.min(1, g.left / pageWidth)),
      y = Math.max(0, Math.min(1, g.top / pageHeight));
    results.push({
      x,
      y,
      width: Math.min(1 - x, (g.right - g.left) / pageWidth),
      height: Math.min(1 - y, (g.bottom - g.top) / pageHeight),
      extractedText: text,
      candidatePrice: price.toFixed(2),
      confidence:
        g.confidence.reduce((a, b) => a + b, 0) / g.confidence.length / 100,
    });
  }
  return results.filter((r) => r.width > 0 && r.height > 0).slice(0, 300);
}
