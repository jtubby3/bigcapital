export function isStagingEnvironment(): boolean {
  return process.env.APP_ENVIRONMENT?.trim().toLowerCase() === 'staging';
}

export function watermarkStagingPdf(html: string): string {
  if (!isStagingEnvironment()) return html;
  const watermark =
    '<div aria-hidden="true" style="position:fixed;top:45%;left:5%;width:90%;text-align:center;transform:rotate(-25deg);font:700 56px sans-serif;color:#a34300;opacity:0.22;z-index:2147483647;pointer-events:none">TEST — STAGING</div>';
  return /<body[^>]*>/i.test(html)
    ? html.replace(/<body[^>]*>/i, (body) => body + watermark)
    : watermark + html;
}
