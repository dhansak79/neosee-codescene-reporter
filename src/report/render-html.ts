import type { AssessmentReport } from "../analysis/report-model.js";

export type ReportBranding = {
  neoseeLogoUrl: string;
  partnerBadgeUrl: string;
};

export function renderHtml(report: AssessmentReport, branding: ReportBranding): string {
  const findings = renderFindings(report);
  const evidenceRows = renderEvidenceRows(report);
  const neoseeLogoUrl = escapeHtml(branding.neoseeLogoUrl);
  const partnerBadgeUrl = escapeHtml(branding.partnerBadgeUrl);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report.project.name)} engineering health assessment</title>
  <style>${STYLES}</style>
</head>
<body><main>
  <section class="cover">
    <div class="cover-logos">
      <img class="neosee-logo" src="${neoseeLogoUrl}" alt="NeoSee">
      <img class="partner-badge" src="${partnerBadgeUrl}" alt="CodeScene Official Partner">
    </div>
    <p class="brand">NeoSee Code Health Report</p>
    <h1>Engineering health assessment</h1>
    <h2>${escapeHtml(report.project.name)}</h2>
    <p class="meta">CodeScene analysis ${report.analysis.id} · ${escapeHtml(report.analysis.analysedAt)}</p>
  </section>
  <section>
    <p class="eyebrow">Executive summary</p>
    <h2>Current engineering health</h2>
    <div class="metrics">
      <div class="metric"><strong>${report.summary.codeHealth.toFixed(1)}</strong>Code Health</div>
      <div class="metric"><strong>${formatPercent(report.summary.lineCoveragePercent)}</strong>Line coverage</div>
      <div class="metric"><strong>${report.summary.loadedFilePage.hotspots}</strong>Hotspots on loaded page</div>
    </div>
    <p>${report.summary.loadedFilePage.measurableFiles} of ${report.summary.loadedFilePage.analysedFiles} files on the loaded API page currently have a Code Health score. These values are page-scoped, not project totals.</p>
    <h2>Selected findings</h2>
    ${findings}
  </section>
  <section>
    <p class="eyebrow">Evidence appendix</p>
    <h2>Traceable source measures</h2>
    <table><thead><tr><th>ID</th><th>Metric</th><th>Value</th><th>Observed</th></tr></thead><tbody>${evidenceRows}</tbody></table>
    <p class="evidence-ref">Ruleset 1.0 · Generated deterministically from ${escapeHtml(report.evidence[0]?.source ?? "CodeScene")}</p>
  </section>
</main></body></html>\n`;
}

function renderFindings(report: AssessmentReport): string {
  if (report.findings.length === 0) {
    return '<p class="empty">No findings were selected by the current ruleset.</p>';
  }
  return report.findings
    .map(
      (finding) => `<article class="finding">
          <p class="eyebrow">${escapeHtml(finding.severity)} · ${escapeHtml(finding.id)}</p>
          <h3>${escapeHtml(finding.title)}</h3>
          <p>${escapeHtml(finding.summary)}</p>
          <p><strong>Next step:</strong> ${escapeHtml(finding.recommendation)}</p>
          <p class="evidence-ref">Evidence: ${finding.evidenceIds.map(escapeHtml).join(", ")}</p>
        </article>`,
    )
    .join("");
}

function renderEvidenceRows(report: AssessmentReport): string {
  return report.evidence
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.metric)}</td><td>${escapeHtml(String(item.value))}</td><td>${escapeHtml(item.observedAt)}</td></tr>`,
    )
    .join("");
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const STYLES = `
    :root { color: #172033; background: #eef1f6; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(900px, 100%); margin: 0 auto; background: white; }
    section { min-height: 100vh; padding: 72px; page-break-after: always; }
    .cover { color: white; background: linear-gradient(145deg, #172033, #233f73); display: grid; align-content: center; }
    .cover-logos { display: flex; align-items: center; gap: 24px; margin-bottom: 36px; }
    .neosee-logo { width: 104px; height: 104px; border-radius: 22px; box-shadow: 0 18px 48px #050b1f66; }
    .partner-badge { width: 116px; height: 116px; object-fit: contain; }
    .brand, .eyebrow { color: #43d9ad; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    h1 { font-size: 54px; line-height: 1.02; margin: 20px 0; max-width: 700px; }
    h2 { font-size: 32px; margin-top: 0; }
    .meta { color: #b8c7df; }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 36px 0; }
    .metric, .finding { border: 1px solid #dfe5ef; border-radius: 12px; padding: 20px; }
    .metric strong { display: block; color: #233f73; font-size: 32px; }
    .finding { border-left: 5px solid #43d9ad; }
    .evidence-ref, .empty { color: #62708a; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border-bottom: 1px solid #dfe5ef; padding: 12px 8px; text-align: left; vertical-align: top; }
    @media print { body { background: white; } main { width: auto; } section { min-height: 0; height: 297mm; } }
  `;
