---
type: regex
target: {source: file, path: .git/logs/HEAD}
match: not_contains
flags: m
---

commit( \([a-z]+\))?: x$
