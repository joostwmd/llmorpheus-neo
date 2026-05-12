# benchmarks-macos.json

macOS-compatible version of `benchmarks.json` for local replay.

## What changed

On macOS, BSD `sed` requires a backup extension argument for in-place edits. The original file uses Linux-style:

- **Linux:** `sed -i -e 's/foo/bar/' file` (GNU sed)
- **macOS:** `sed -i '' -e 's/foo/bar/' file` (BSD sed; `''` = no backup)

All `sed -i` commands have been changed to `sed -i ''` in this file.

**countries-and-timezones:** The second edit (`sed -i "s/sed -i ''/sed -i/g" .fixTypes.sh`) converts the project's script from macOS to Linux for CI. On macOS we skip that part and only run the package.json edit. If `.fixTypes.sh` fails during build, you may need to manually ensure it uses `sed -i ''`.

## How to use

Use `thesis/code/benchmarks/benchmarks-macos.json` when running local replay:

```sh
# Parse packages (for scripting)
node source/llmorpheus/.github/find_benchmarks.js thesis/code/benchmarks/benchmarks-macos.json

# Or use the run scripts (after clone-benchmarks.sh and setup):
./thesis/code/benchmarks/run-one-benchmark.sh Complex.js
./thesis/code/benchmarks/run-all-benchmarks.sh
```

The experiment workflow uses `source/llmorpheus/.github/benchmarks.json` and runs on Ubuntu. Use `benchmarks-macos.json` only for local replay on macOS.
