// Turns form submissions (JSON files written by the n8n "Add to my CV" form) into ledger.yaml entries.
// Appends as text so the comments in ledger.yaml are kept. Prints the ids it added.
// Usage: node scripts/add-from-inbox.js file1.json [file2.json ...]
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const LEDGER = path.join(__dirname, "..", "ledger.yaml");
const existing = new Set((yaml.load(fs.readFileSync(LEDGER, "utf8")) || []).map((c) => c.id));
const SECTION = { Skills: "skills", Projects: "projects", Qualifications: "qualifications", "Experience (current role)": "experience" };
const PROOF = {
  "GitHub repo or commit": "github", "Certificate": "cert", "Manager / employer reference": "reference",
  "Work example I can show": "work_artifact", "I can demo it live": "live_test", "Course progress page": "course_record",
};
const NEEDS_URL = ["github", "cert"];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "claim";
const added = [];
let out = "";

for (const file of process.argv.slice(2)) {
  const f = JSON.parse(fs.readFileSync(file, "utf8"));
  const section = SECTION[f.section];
  const proof_type = PROOF[f.proof_type];
  const claim_text = String(f.claim_text || "").replace(/\s+/g, " ").trim();
  if (!section || !proof_type || !claim_text) throw new Error(`${path.basename(file)}: missing section, proof type or claim text`);
  const skills = String(f.skills || "").split(",").map((s) => s.trim()).filter(Boolean);
  const proof_url = String(f.proof_url || "").trim();
  if (proof_url && !/^https?:\/\//.test(proof_url)) throw new Error(`${path.basename(file)}: proof link must start with http`);
  const canExplain = String(f.can_explain || "").startsWith("Yes");

  // Honesty rule: only goes on the CV if Paul can explain it AND the proof is in place.
  const reasons = [];
  if (!canExplain) reasons.push("Paul to confirm he can explain this in an interview");
  if (NEEDS_URL.includes(proof_type) && !proof_url) reasons.push("add the proof link");

  let id = slug(f.id_hint || claim_text);
  for (let n = 2; existing.has(id); n++) id = `${slug(f.id_hint || claim_text)}-${n}`;
  existing.add(id);

  const entry = {
    id, section, ...(section === "experience" ? { role: "team-leader" } : {}),
    skills, claim_text, proof_type, proof_url,
    date_verified: (f.submitted_at || new Date().toISOString()).slice(0, 10),
    status: reasons.length ? "pending_proof" : "on_cv",
    ...(reasons.length ? { note: reasons.join("; ") } : {}),
  };
  out += "\n" + yaml.dump([entry], { lineWidth: -1, flowLevel: 2 }).replace(/date_verified: '(\d{4}-\d{2}-\d{2})'/, "date_verified: $1");
  added.push(id + (reasons.length ? " (pending)" : ""));
}

if (added.length) {
  const cur = fs.readFileSync(LEDGER, "utf8");
  fs.writeFileSync(LEDGER, cur.replace(/\n*$/, "\n") + out);
}
console.log(added.join(", "));
