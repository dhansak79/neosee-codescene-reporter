import type { AssessmentReport } from "../analysis/report-model.js";

export type ReportBranding = {
  neoseeLogoUrl: string;
  partnerBadgeUrl: string;
};

export function renderHtml(report: AssessmentReport, branding: ReportBranding): string {
  const findings = renderFindings(report);
  const evidenceRows = renderEvidenceRows(report);
  const analysisRows = renderRecordRows(report.analysisDetails.summary);
  const highLevelMetricRows = renderRecordRows(report.analysisDetails.highLevelMetrics);
  const languageRows = renderLanguageRows(report);
  const catalogueSections = renderCatalogue(report);
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
    <p class="eyebrow">Analysis inventory</p>
    <h2>Everything in the latest analysis metadata</h2>
    <p>${escapeHtml(report.analysisDetails.description)}</p>
    <h3>Analysis summary</h3>
    <table><thead><tr><th>Measure</th><th>Value</th></tr></thead><tbody>${analysisRows}</tbody></table>
    <h3>High-level metrics</h3>
    <table><thead><tr><th>Measure</th><th>Value</th></tr></thead><tbody>${highLevelMetricRows}</tbody></table>
  </section>
  <section>
    <p class="eyebrow">Language inventory</p>
    <h2>Files and lines by language</h2>
    <table><thead><tr><th>Language</th><th>Files</th><th>Code</th><th>Comments</th><th>Blank</th></tr></thead><tbody>${languageRows}</tbody></table>
  </section>
  <section>
    <p class="eyebrow">Executive summary</p>
    <h2>Current engineering health</h2>
    <div class="metrics">
      <div class="metric"><strong>${report.summary.codeHealth.toFixed(1)}</strong>Code Health</div>
      <div class="metric"><strong>${formatPercent(report.summary.lineCoveragePercent)}</strong>Line coverage</div>
      <div class="metric"><strong>${report.summary.projectFiles.hotspots}</strong>Hotspots</div>
    </div>
    <p>${report.summary.projectFiles.measurableFiles} of ${report.summary.projectFiles.analysedFiles} project files currently have a Code Health score. These totals include every page returned by CodeScene.</p>
    <h2>Selected findings</h2>
    ${findings}
  </section>
  <section>
    <p class="eyebrow">Evidence appendix</p>
    <h2>Traceable source measures</h2>
    <table><thead><tr><th>ID</th><th>Metric</th><th>Value</th><th>Observed</th></tr></thead><tbody>${evidenceRows}</tbody></table>
    <p class="evidence-ref">Ruleset 1.0 · Generated deterministically from ${escapeHtml(report.evidence[0]?.source ?? "CodeScene")}</p>
  </section>
  <section>
    <p class="eyebrow">CodeScene source data</p>
    <h2>Complete read-only API catalogue</h2>
    <p>Available, empty, and unavailable datasets are shown separately. This appendix preserves CodeScene's source values without adding consultancy interpretation.</p>
    ${catalogueSections}
  </section>
</main></body></html>\n`;
}

function renderCatalogue(report: AssessmentReport): string {
  return Object.entries(report.catalogue)
    .map(([name, dataset]) => {
      const label = humanize(name);
      if (dataset.status === "unavailable") {
        return `<article class="dataset unavailable"><h3>${escapeHtml(label)}</h3><p>Unavailable: ${escapeHtml(dataset.reason)}</p><p class="evidence-ref">${escapeHtml(dataset.source)}</p></article>`;
      }
      const count = Array.isArray(dataset.data) ? ` · ${dataset.data.length} records` : "";
      return `<details class="dataset"><summary>${escapeHtml(label)}${count}</summary><p class="evidence-ref">${escapeHtml(dataset.source)}</p><pre>${escapeHtml(JSON.stringify(dataset.data, null, 2))}</pre></details>`;
    })
    .join("");
}

function renderRecordRows(record: Record<string, number>): string {
  return Object.entries(record)
    .map(
      ([name, value]) =>
        `<tr><td>${escapeHtml(humanize(name))}</td><td>${escapeHtml(String(value))}</td></tr>`,
    )
    .join("");
}

function renderLanguageRows(report: AssessmentReport): string {
  return report.analysisDetails.languages
    .map(
      (language) =>
        `<tr><td>${escapeHtml(language.language)}</td><td>${language.files}</td><td>${language.codeLines}</td><td>${language.commentLines}</td><td>${language.blankLines}</td></tr>`,
    )
    .join("");
}

function humanize(value: string): string {
  const words = value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
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
    .dataset { border: 1px solid #dfe5ef; border-radius: 12px; margin: 14px 0; padding: 16px; }
    .dataset summary { cursor: pointer; font-weight: 700; }
    .dataset.unavailable { background: #f7f8fb; }
    pre { background: #172033; color: #e8eef8; max-height: 520px; overflow: auto; padding: 16px; white-space: pre-wrap; }
    th, td { border-bottom: 1px solid #dfe5ef; padding: 12px 8px; text-align: left; vertical-align: top; }
    @media print {
      body { background: white; }
      main { width: auto; }
      section { min-height: 0; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
    }
  `;
