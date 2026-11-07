#!/usr/bin/env bash
# Runs every 5 minutes from cron on the laptop.
# 1. Picks up anything the n8n "Add to my CV" form dropped in the inbox folder
# 2. Adds it to ledger.yaml, rebuilds the CV and runs the ATS test
# 3. Commits + pushes to GitHub, copies the finished CV to ~/n8n/local-files/cv/out
# 4. Sends a phone notification (ntfy) saying what happened
# Run by hand with: bash ~/projects/cv/scripts/cv-sync.sh --rebuild
set -uo pipefail
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
REPO="$HOME/projects/cv"
BASE="$HOME/n8n/local-files/cv"
INBOX="$BASE/inbox"; DONE="$BASE/processed"; FAILED="$BASE/failed"; OUTDIR="$BASE/out"
NTFY_TOPIC_FILE="$HOME/n8n/.ntfy-topic"
mkdir -p "$INBOX" "$DONE" "$FAILED" "$OUTDIR"

shopt -s nullglob
files=("$INBOX"/*.json)
[ ${#files[@]} -eq 0 ] && [ "${1:-}" != "--rebuild" ] && exit 0

exec 9>/tmp/cv-sync.lock
flock -n 9 || exit 0
exec >>"$BASE/sync.log" 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M:%S') ==="

notify() {  # notify "title" "message"
  [ -f "$NTFY_TOPIC_FILE" ] || return 0
  curl -fsS --max-time 10 -H "Title: $1" -H "Tags: page_facing_up" -d "$2" \
    "https://ntfy.sh/$(cat "$NTFY_TOPIC_FILE")" >/dev/null 2>&1 || true
}

fail() {
  echo "FAILED: $1"
  git -C "$REPO" checkout -- ledger.yaml SKILLS.md BUILD-NEXT.md 2>/dev/null
  for f in "${files[@]}"; do [ -f "$f" ] && mv "$f" "$FAILED/"; done
  notify "CV update failed" "$1 — see ~/n8n/local-files/cv/sync.log"
  exit 1
}

cd "$REPO" || fail "repo folder missing"
git pull --rebase --quiet || fail "git pull failed"
added=""
if [ ${#files[@]} -gt 0 ]; then
  added=$(node scripts/add-from-inbox.js "${files[@]}") || fail "a form entry was invalid"
fi
set -a; . "$HOME/.config/cv/contact.env"; set +a
node build/cv.js || fail "CV build failed"
node build/ats-check.js --require-contact || fail "ATS test failed"

for f in "${files[@]}"; do mv "$f" "$DONE/"; done
cp out/Paul-Martin-CV.docx out/Paul-Martin-CV.pdf "$OUTDIR/"
git add ledger.yaml SKILLS.md BUILD-NEXT.md
if ! git diff --cached --quiet; then
  git commit -q -m "ledger: add ${added:-rebuild} (via n8n form)" || fail "git commit failed"
  git push -q || fail "git push failed"
fi
echo "OK: ${added:-rebuild only}"
[ -n "$added" ] && notify "CV updated" "Added: $added. New CV in ~/n8n/local-files/cv/out"
exit 0
