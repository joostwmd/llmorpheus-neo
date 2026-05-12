#!/bin/bash
# Clone all 13 benchmark libraries at exact commits from the LLMorpheus paper.
# Run from project root: ./thesis/code/benchmarks/clone-benchmarks.sh
# Clones into ./thesis/code/benchmarks/libs/

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIBS_DIR="${SCRIPT_DIR}/libs"
mkdir -p "$LIBS_DIR"
cd "$LIBS_DIR"

clone() {
  local name="$1"
  local url="$2"
  local sha="$3"
  if [ -d "$name" ]; then
    echo "=== $name: already exists, fetching and checking out..."
    cd "$name"
    git fetch origin
    git checkout "$sha"
    cd ..
  else
    echo "=== Cloning $name..."
    git clone "$url" "$name"
    cd "$name"
    git checkout "$sha"
    cd ..
  fi
}

clone "countries-and-timezones" "https://github.com/manuelmhtr/countries-and-timezones.git" "241dd0f56dfc527bcd87779ae14ed67bd25c1c0e"
clone "Complex.js" "https://github.com/infusion/Complex.js.git" "d995ca105e8adef4c38d0ace50643daf84e0dd1c"
clone "crawler-url-parser" "https://gitlab.com/autokent/crawler-url-parser.git" "202c5b25ad693d284804261e2b3815fe66e0723e"
clone "delta" "https://github.com/quilljs/delta.git" "5ffb853d645aa5b4c93e42aa52697e2824afc869"
clone "image-downloader" "https://gitlab.com/demsking/image-downloader.git" "19a53f652824bd0c612cc5bcd3a2eb173a16f938"
clone "node-dirty" "https://github.com/felixge/node-dirty.git" "d7fb4d4ecf0cce144efa21b674965631a7955e61"
clone "node-geo-point" "https://github.com/rainder/node-geo-point.git" "c839d477ff7a48d1fc6574495cbbc6196161f494"
clone "node-jsonfile" "https://github.com/jprichardson/node-jsonfile.git" "9c6478a85899a9318547a6e9514b0403166d8c5c"
clone "plural" "https://github.com/swang/plural.git" "f0027d66ecb37ce0108c8bcb4a6a448d1bf64047"
clone "pull-stream" "https://github.com/pull-stream/pull-stream.git" "29b4868bb3864c427c3988855c5d65ad5cb2cb1c"
clone "q" "https://github.com/kriskowal/q.git" "6bc7f524eb104aca8bffde95f180b5210eb8dd4b"
clone "spacl-core" "https://gitlab.com/cptpackrat/spacl-core.git" "fcb8511a0d01bdc206582cfacb3e2b01a0288f6a"
clone "zip-a-folder" "https://github.com/maugenst/zip-a-folder.git" "d2ea465b20dc33cf8c98c58a7acaf875c586c3e1"

echo ""
echo "Done. All 13 libraries cloned to $LIBS_DIR"
