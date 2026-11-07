# CV as code

My CV, built from an evidence ledger. **Every line on the CV has to point to proof, and I have to be able to explain it in an interview.** Anything without proof stays off the CV and goes on the [build-next list](BUILD-NEXT.md).

## How it works

```
phone ──> n8n form ──> inbox file ──> laptop sync job ──> ledger.yaml ──> build ──> ATS test ──> GitHub
          (self-hosted)                (cron, every 5 min)                 (Node.js)  (GitHub Actions too)
```

| File | What it is |
|---|---|
| [`ledger.yaml`](ledger.yaml) | One entry per claim: wording, proof type, proof link, date checked, status (`on_cv` / `pending_proof` / `removed`) |
| [`cv.yaml`](cv.yaml) | The fixed parts: name, profile, job titles and dates |
| [`build/cv.js`](build/cv.js) | Checks the ledger, then builds `Paul-Martin-CV.docx` with the `docx` library |
| [`build/ats-check.js`](build/ats-check.js) | Reads the .docx back as plain text, like recruiter software (ATS) does, and fails if anything is missing, out of order, or hidden in tables/headers; checks the PDF is 2 pages max |
| [`SKILLS.md`](SKILLS.md) | Skills ranked by how much evidence each has (generated) |
| [`BUILD-NEXT.md`](BUILD-NEXT.md) | Claims still waiting for proof (generated) |
| [`scripts/cv-sync.sh`](scripts/cv-sync.sh) | Runs on my laptop: takes new entries from the n8n form, rebuilds, tests, commits, pushes |

Phone number and email are never in the repo. GitHub Actions gets them from repo secrets; the laptop gets them from a private file.

## Run it yourself

```bash
npm ci
npm run build    # CV_PHONE / CV_EMAIL optional
npm run ats
```

## Honesty notes

- This repo is a personal tool, not a portfolio project, so it never appears on my CV. Version 1 of the code was written with Claude (AI).
- Work achievements at Iron Mountain can't be shared publicly, so their proof is a manager reference.
