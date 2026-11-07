// Automated ATS (applicant tracking system) test.
// Reads the built .docx back as plain text and fails if anything a CV parser needs is missing,
// out of order, or hidden in places parsers skip (tables, text boxes, images, headers/footers).
// If LibreOffice is available it also makes a text-based PDF and checks it is 2 pages or fewer.
// Usage: node build/ats-check.js [--require-contact]
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const JSZip = require("jszip");
const yaml = require("js-yaml");

const ROOT = path.join(__dirname, "..");
const DOCX = path.join(ROOT, "out", "Paul-Martin-CV.docx");
const requireContact = process.argv.includes("--require-contact");
const cv = yaml.load(fs.readFileSync(path.join(ROOT, "cv.yaml"), "utf8"));
const fails = [];
const ok = (msg) => console.log("  ok  " + msg);
const fail = (msg) => { fails.push(msg); console.log("  FAIL " + msg); };

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const paraText = (xml) => (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [])
  .map((p) => decode((p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join("")))
  .filter((t) => t.trim());

(async () => {
  console.log("ATS check: " + DOCX);
  const zip = await JSZip.loadAsync(fs.readFileSync(DOCX));
  const xml = await zip.file("word/document.xml").async("string");

  // 1. Nothing hidden where parsers can't read it
  for (const [tag, what] of [["<w:tbl>", "tables"], ["<w:drawing", "images/shapes"], ["<w:pict", "pictures"], ["<w:txbxContent", "text boxes"]]) {
    xml.includes(tag) ? fail(`contains ${what}`) : ok(`no ${what}`);
  }
  const hf = Object.keys(zip.files).filter((f) => /word\/(header|footer)\d*\.xml$/.test(f));
  let hfText = "";
  for (const f of hf) hfText += paraText(await zip.file(f).async("string")).join(" ");
  hfText.trim() ? fail("text found in page header/footer (parsers often skip it)") : ok("no text in header/footer");

  // 2. Read it back as plain text, in order
  const lines = paraText(xml);
  const text = lines.join("\n");
  lines[0] === cv.name ? ok("name is the first line") : fail(`first line should be "${cv.name}", got "${lines[0]}"`);

  // 3. Contact details in the body
  const contact = lines[1] || "";
  /[\w.+-]+@[\w-]+\.[\w.]+/.test(contact) ? ok("email in contact line") : (requireContact ? fail("no email in contact line") : console.log("  skip email (not required for this build)"));
  /(\+44\s?|0)\d[\d\s]{8,12}\d/.test(contact) ? ok("phone in contact line") : (requireContact ? fail("no phone in contact line") : console.log("  skip phone (not required for this build)"));
  contact.includes(cv.location) ? ok("location in contact line") : fail("location missing from contact line");

  // 4. Standard headings, in the expected order
  const expected = ["Profile", "Experience", "Skills", "Projects", "Qualifications", "Education"];
  const found = lines.filter((l) => expected.includes(l));
  const order = expected.filter((h) => found.includes(h));
  JSON.stringify(found) === JSON.stringify(order) ? ok(`headings in order: ${found.join(" > ")}`) : fail(`headings out of order: ${found.join(" > ")}`);
  for (const h of ["Profile", "Experience", "Skills", "Education"]) if (!found.includes(h)) fail(`missing heading ${h}`);

  // 5. Every role: title, employer and dates on one line, one date format, newest first
  const DATE = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d{4}";
  let lastIdx = -1;
  for (const r of cv.roles) {
    const idx = lines.findIndex((l) => l.startsWith(r.title) && l.includes(r.employer));
    if (idx < 0) { fail(`role line missing: ${r.title}`); continue; }
    if (idx < lastIdx) fail(`role out of order: ${r.title}`);
    lastIdx = idx;
    new RegExp(`${DATE} – (${DATE}|Present)$`).test(lines[idx]) ? ok(`role line ok: ${r.title}`) : fail(`bad date format on: ${lines[idx]}`);
  }

  // 6. Text-based PDF, 2 pages max (needs LibreOffice + poppler)
  try {
    execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", path.dirname(DOCX), DOCX], { stdio: "ignore", timeout: 120000 });
    const pdf = DOCX.replace(/\.docx$/, ".pdf");
    const pages = Number((execFileSync("pdfinfo", [pdf]).toString().match(/Pages:\s+(\d+)/) || [])[1]);
    pages <= 2 ? ok(`PDF is ${pages} page(s)`) : fail(`PDF is ${pages} pages (max 2)`);
    const pdfText = execFileSync("pdftotext", ["-layout", pdf, "-"]).toString();
    expected.filter((h) => found.includes(h)).every((h) => pdfText.includes(h)) ? ok("PDF text is selectable and has every heading") : fail("PDF text missing headings");
  } catch (e) {
    console.log("  skip PDF checks (LibreOffice/poppler not available): " + e.message.split("\n")[0]);
  }

  console.log(fails.length ? `\nATS check FAILED (${fails.length} problem(s))` : "\nATS check passed");
  process.exit(fails.length ? 1 : 0);
})();
