/**
 * Apple Health exports include a DTD with HTML comments that choke many XML
 * parsers. Strip the declaration (internal subset or simple form) before SAX.
 */
export function stripMalformedDoctype(xml: string): string {
  return xml.replace(/<!DOCTYPE\b[\s\S]*?\]\s*>/i, '').replace(/<!DOCTYPE\b[^>]*>/i, '');
}

export class DoctypeStripper {
  private pending = '';
  private done = false;

  push(chunk: string): string {
    if (this.done) return chunk;
    this.pending += chunk;
    const stripped = stripMalformedDoctype(this.pending);
    const removedDoctype = stripped.length !== this.pending.length || !/<!DOCTYPE/i.test(this.pending);
    const hasRoot =
      /<HealthData[\s>/]/i.test(stripped) ||
      /<(Record|Workout|ActivitySummary|ExportDate)\b/i.test(stripped);
    if (removedDoctype && (hasRoot || this.pending.length > 16_384)) {
      this.done = true;
      this.pending = '';
      return stripped.replace(/^\uFEFF/, '');
    }
    return '';
  }

  flush(): string {
    if (this.done) return '';
    this.done = true;
    const out = stripMalformedDoctype(this.pending).replace(/^\uFEFF/, '');
    this.pending = '';
    return out;
  }
}
