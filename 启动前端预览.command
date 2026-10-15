#!/bin/zsh
cd "${0:A:h}" || exit 1
task_python="python3"
# Prefer the bundled runtime on this machine; the system Python may require Xcode setup.
bundled_python="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
if [[ -x "$bundled_python" ]]; then task_python="$bundled_python"; fi
"$task_python" scripts/dev_preview.py --port 8792
