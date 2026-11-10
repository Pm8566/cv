// Builds the CV from cv.yaml + ledger.yaml.
// Outputs: out/Paul-Martin-CV.docx, BUILD-NEXT.md, SKILLS.md
// Contact details come from environment variables CV_PHONE and CV_EMAIL (never from the repo).
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat, BorderStyle,
} = require("docx");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "out");
const cv = yaml.load(fs.readFileSync(path.join(ROOT, "cv.yaml"), "utf8"));
const ledger = yaml.load(fs.readFileSync(path.join(ROOT, "ledger.yaml"), "utf8")) || [];

// ---------- 1. Check the ledger before building anything ----------
const SECTIONS = ["experience", "skills", "projects", "qualifications"];
const PROOF_TYPES = ["github", "cert", "reference", "work_artifact", "live_test", "course_record"];
const STATUSES = ["on_cv", "pending_proof", "removed"];
const roleIds = cv.roles.map((r) => r.id);
const errors = [];
const seen = new Set();
ledger.forEach((c, i) => {
  const where = `ledger entry ${i + 1} (${c.id || "no id"})`;
  if (!c.id) errors.push(`${where}: missing id`);
  if (seen.has(c.id)) errors.push(`${where}: duplicate id`);
  seen.add(c.id);
  if (!SECTIONS.includes(c.section)) errors.push(`${where}: section must be one of ${SECTIONS}`);
  if (!PROOF_TYPES.includes(c.proof_type)) errors.push(`${where}: proof_type must be one of ${PROOF_TYPES}`);
  if (!STATUSES.includes(c.status)) errors.push(`${where}: status must be one of ${STATUSES}`);
  if (!c.claim_text || !String(c.claim_text).trim()) errors.push(`${where}: claim_text is empty`);
  if (c.section === "experience" && !roleIds.includes(c.role)) errors.push(`${where}: role must be one of ${roleIds}`);
  if (c.proof_type === "github" && c.status === "on_cv" && !c.proof_url) errors.push(`${where}: github proof needs a proof_url`);
  const d = c.date_verified instanceof Date ? c.date_verified.toISOString().slice(0, 10) : String(c.date_verified);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) errors.push(`${where}: date_verified must be YYYY-MM-DD`);
  c.date_verified = d;
});
if (errors.length) {
  console.error("Ledger problems:\n - " + errors.join("\n - "));
  process.exit(1);
}

const onCv = ledger.filter((c) => c.status === "on_cv");
const pending = ledger.filter((c) => c.status === "pending_proof");
const inSection = (s) => onCv.filter((c) => c.section === s);

// ---------- 2. The .docx (ATS-friendly: one column, no tables/images, real headings) ----------
// Design rules (Paul, 10 Nov 2026) - keep these on every rebuild:
//  - Accent colour on name + section headings, thin rule under each heading (ATS-safe: colour/borders are ignored by parsers)
//  - Contact details on one line, links on their own line (no awkward wrapping)
//  - Section order: Profile, Experience, Projects, Skills, Qualifications, Education
//  - Still one column, no tables, images, icons or skill bars
const FONT = "Calibri";
const ACCENT = "1F3864";
const run = (text, opts = {}) => new TextRun({ text, font: FONT, ...opts });
const heading = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1, children: [run(text)],
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 1 } },
});
const bullet = (text) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [run(text)] });
const plain = (children, extra = {}) => new Paragraph({ children, ...extra });

const phone = (process.env.CV_PHONE || "").trim();
const email = (process.env.CV_EMAIL || "").trim();
if (!phone || !email) console.warn("WARNING: CV_PHONE / CV_EMAIL not set — contact details left out of this build.");
const contactLine = [cv.location, phone, email].filter(Boolean).join(" | ");
const linksLine = (cv.links || []).filter(Boolean).join(" | ");

const body = [];
body.push(plain([run(cv.name, { bold: true, size: 36, color: ACCENT })], { alignment: AlignmentType.CENTER }));
body.push(plain([run(contactLine, { size: 20 })], { alignment: AlignmentType.CENTER }));
if (linksLine) body.push(plain([run(linksLine, { size: 20 })], { alignment: AlignmentType.CENTER }));
body.push(plain([run(cv.headline, { bold: true, color: ACCENT })], { alignment: AlignmentType.CENTER, spacing: { after: 120 } }));

body.push(heading("Profile"));
body.push(plain([run(cv.profile.replace(/\s+/g, " ").trim())]));

body.push(heading("Experience"));
for (const role of cv.roles) {
  body.push(plain([
    run(role.title, { bold: true }),
    run(` | ${role.employer}, ${role.location} | ${role.start} – ${role.end}`),
  ], { spacing: { before: 80 } }));
  inSection("experience").filter((c) => c.role === role.id).forEach((c) => body.push(bullet(c.claim_text)));
}

if (inSection("projects").length) {
  body.push(heading("Projects"));
  inSection("projects").forEach((c) => body.push(bullet(c.claim_text + (c.proof_url ? ` (${c.proof_url.replace(/^https?:\/\//, "")})` : ""))));
}
if (inSection("skills").length) {
  body.push(heading("Skills"));
  inSection("skills").forEach((c) => body.push(bullet(c.claim_text)));
}
if (inSection("qualifications").length) {
  body.push(heading("Qualifications"));
  inSection("qualifications").forEach((c) => body.push(bullet(c.claim_text)));
}
body.push(heading("Education"));
cv.education.forEach((e) => body.push(bullet(e)));

const doc = new Document({
  creator: cv.name,
  title: `${cv.name} CV`,
  styles: {
    default: { document: { run: { font: FONT, size: 20 }, paragraph: { spacing: { after: 20 } } } },
    paragraphStyles: [{
      id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { font: FONT, size: 23, bold: true, color: ACCENT },
      paragraph: { spacing: { before: 140, after: 40 }, outlineLevel: 0 },
    }],
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
    }],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, bottom: 720, left: 850, right: 850 } } },
    children: body,
  }],
});

// ---------- 3. Markdown reports for the repo ----------
function levelFor(n) { return n >= 4 ? "Proficient" : n >= 2 ? "Applied" : "Working knowledge"; }
const counts = {};
onCv.forEach((c) => (c.skills || []).forEach((s) => { (counts[s] ||= []).push(c); }));
const skillRows = Object.entries(counts).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
const skillsMd = [
  "# Skills by evidence",
  "",
  "_Generated from `ledger.yaml` by `build/cv.js`. Don't edit by hand._",
  "",
  "Level rule: 1 piece of evidence = Working knowledge, 2–3 = Applied, 4+ = Proficient.",
  "",
  "| Skill | Evidence | Level | Proof types |",
  "|---|---|---|---|",
  ...skillRows.map(([s, cs]) => `| ${s} | ${cs.length} | ${levelFor(cs.length)} | ${[...new Set(cs.map((c) => c.proof_type))].join(", ")} |`),
  "",
].join("\n");

const missingLinks = onCv.filter((c) => !c.proof_url && ["cert", "github"].includes(c.proof_type));
const buildNextMd = [
  "# Build next",
  "",
  "_Generated from `ledger.yaml` by `build/cv.js`. Don't edit by hand._",
  "",
  "## Claims waiting for proof (not on the CV yet)",
  "",
  ...(pending.length ? pending.map((c) => `- **${c.id}**: ${c.claim_text}${c.note ? `\n  - Needed: ${c.note}` : ""}`) : ["- None"]),
  "",
  "## On the CV but missing a public proof link",
  "",
  ...(missingLinks.length ? missingLinks.map((c) => `- **${c.id}** (${c.proof_type})${c.note ? `: ${c.note}` : ""}`) : ["- None"]),
  "",
].join("\n");

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(ROOT, "SKILLS.md"), skillsMd);
fs.writeFileSync(path.join(ROOT, "BUILD-NEXT.md"), buildNextMd);
Packer.toBuffer(doc).then((buf) => {
  const file = path.join(OUT, "Paul-Martin-CV.docx");
  fs.writeFileSync(file, buf);
  console.log(`Built ${file}: ${onCv.length} claims on the CV, ${pending.length} pending proof.`);
});
