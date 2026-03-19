# Benchmark Libraries — Clone Targets

Source: `source/llmorpheus/.github/benchmarks.json` (or `thesis/code/benchmarks/benchmarks-macos.json` for macOS)

## Quick start (local replay)

```sh
./thesis/code/benchmarks/clone-benchmarks.sh          # Clone all at exact commits
cd source/llmorpheus && npm run build                 # Build LLMorpheus once
./thesis/code/benchmarks/run-one-benchmark.sh Complex.js   # Single benchmark
./thesis/code/benchmarks/run-all-benchmarks.sh             # All benchmarks
```

| # | Name | Host | Clone URL | Commit SHA |
|---|------|------|-----------|------------|
| 1 | countries-and-timezones | GitHub | https://github.com/manuelmhtr/countries-and-timezones.git | `241dd0f56dfc527bcd87779ae14ed67bd25c1c0e` |
| 2 | Complex.js | GitHub | https://github.com/infusion/Complex.js.git | `d995ca105e8adef4c38d0ace50643daf84e0dd1c` |
| 3 | crawler-url-parser | GitLab | https://gitlab.com/autokent/crawler-url-parser.git | `202c5b25ad693d284804261e2b3815fe66e0723e` |
| 4 | delta | GitHub | https://github.com/quilljs/delta.git | `5ffb853d645aa5b4c93e42aa52697e2824afc869` |
| 5 | image-downloader | GitLab | https://gitlab.com/demsking/image-downloader.git | `19a53f652824bd0c612cc5bcd3a2eb173a16f938` |
| 6 | node-dirty | GitHub | https://github.com/felixge/node-dirty.git | `d7fb4d4ecf0cce144efa21b674965631a7955e61` |
| 7 | node-geo-point | GitHub | https://github.com/rainder/node-geo-point.git | `c839d477ff7a48d1fc6574495cbbc6196161f494` |
| 8 | node-jsonfile | GitHub | https://github.com/jprichardson/node-jsonfile.git | `9c6478a85899a9318547a6e9514b0403166d8c5c` |
| 9 | plural | GitHub | https://github.com/swang/plural.git | `f0027d66ecb37ce0108c8bcb4a6a448d1bf64047` |
| 10 | pull-stream | GitHub | https://github.com/pull-stream/pull-stream.git | `29b4868bb3864c427c3988855c5d65ad5cb2cb1c` |
| 11 | q | GitHub | https://github.com/kriskowal/q.git | `6bc7f524eb104aca8bffde95f180b5210eb8dd4b` |
| 12 | spacl-core | GitLab | https://gitlab.com/cptpackrat/spacl-core.git | `fcb8511a0d01bdc206582cfacb3e2b01a0288f6a` |
| 13 | zip-a-folder | GitHub | https://github.com/maugenst/zip-a-folder.git | `d2ea465b20dc33cf8c98c58a7acaf875c586c3e1` |

## Files to mutate (per project)

| Name | Files |
|------|-------|
| countries-and-timezones | `src/**.js` |
| Complex.js | `complex.js` |
| crawler-url-parser | `./crawler-url-parser.js` |
| delta | `./src/*.ts` |
| image-downloader | `./{index,lib/*}.js` |
| node-dirty | `./lib/**/*.js` |
| node-geo-point | `src/{geo-point,index}.ts` |
| node-jsonfile | `./*.js` |
| plural | `./index.js` |
| pull-stream | `{index,pull,throughs/*,sources/*,sinks/*,util/*}.js` |
| q | `./{q,queue}.js` |
| spacl-core | `./src/*.ts` |
| zip-a-folder | `lib/*.ts` |
