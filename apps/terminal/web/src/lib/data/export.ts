/* Report exports generated from a saved assessment, so the dashboard offers the same
   machine-readable exports as the TUI. Pure string builders that mirror reconix/store's
   report_csv.py and report_sarif.py. Everything here is read-only; evidence stays masked. */
import type { Assessment, Finding } from "./schema";

const SARIF_LEVEL: Record<string, string> = {
  CRITICAL: "error",
  HIGH: "error",
  MEDIUM: "warning",
  LOW: "note",
  INFO: "note",
};

const CSV_COLUMNS = [
  "ID", "Severity", "CVSS", "Status", "Validation", "Category", "Finding",
  "Location", "Affected URL", "CWE", "OWASP", "Tool", "Remediation",
];

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The CSV as rows (header first); the file and the preview table are both built from it. */
export function csvRows(a: Assessment): string[][] {
  return [
    [...CSV_COLUMNS],
    ...a.findings.map((f) =>
      [
        f.id, f.severity, f.cvss_score || "", f.status, f.validation, f.category, f.title,
        f.path, f.affected_url, f.cwe.join(" "), f.owasp.join(" "), f.tool, f.remediation,
      ].map((v) => String(v ?? "")),
    ),
  ];
}

export function toCsv(a: Assessment): string {
  return `${csvRows(a)
    .map((row) => row.map(csvCell).join(","))
    .join("\n")}\n`;
}

function ruleId(f: Finding): string {
  return f.cwe[0] ?? f.owasp[0] ?? f.id;
}

export function toSarif(a: Assessment): string {
  const rules = new Map<string, unknown>();
  const results = a.findings.map((f) => {
    const id = ruleId(f);
    if (!rules.has(id)) {
      rules.set(id, { id, name: f.title, shortDescription: { text: f.title }, properties: { category: f.category } });
    }
    return {
      ruleId: id,
      level: SARIF_LEVEL[f.severity] ?? "warning",
      message: { text: f.description || f.title },
      locations: [{ physicalLocation: { artifactLocation: { uri: f.affected_url || f.path || "" } } }],
      properties: {
        severity: f.severity,
        cvss: f.cvss_score || null,
        validation: f.validation,
        status: f.status,
        category: f.category,
        remediation: f.remediation,
      },
    };
  });
  const doc = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      { tool: { driver: { name: "Reconix", version: a.report_version || "1.0", rules: [...rules.values()] } }, results },
    ],
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}
