#!/usr/bin/env bash
# Gives every post in posts/ a date line, using the time the file was first committed
# (UK time). Posts that already have a date are left alone.
set -euo pipefail
export TZ=Europe/London

changed=0
for f in posts/*.html; do
  first=$(head -n1 "$f")
  if echo "$first" | grep -qi '<!--.*date:'; then continue; fi

  when=$(git log --diff-filter=A --follow --format=%ad --date=format-local:'%Y-%m-%d %H:%M' -- "$f" | tail -n1)
  [ -z "$when" ] && when=$(date '+%Y-%m-%d %H:%M')

  if echo "$first" | grep -q '^\s*<!--'; then
    # Already has a comment line (e.g. just an author) — add the date into it.
    sed -i "1s/<!--/<!-- date: $when |/" "$f"
  else
    sed -i "1i <!-- date: $when | author: You -->" "$f"
  fi
  echo "Dated $f: $when"
  changed=1
done

echo "changed=$changed" >> "${GITHUB_OUTPUT:-/dev/null}"
