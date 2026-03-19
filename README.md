# LLMorpheus-Neo

Local replication of the LLMorpheus mutation testing experiments for thesis work.

## Layout

```
llmorpheus-neo/
├── source/                    # Paper artifacts (LLMorpheus, Stryker, data)
│   ├── llmorpheus/            # LLMorpheus tool (with replay fixes)
│   ├── stryker-js/            # Modified StrykerJS fork
│   └── mutation-testing-data/ # Pre-recorded runs from the paper
│
└── thesis/                    # Personal additions
    ├── code/                  # Scripts and tools
    │   └── benchmarks/        # Run scripts, clone, compare, libs
    └── docs/                  # Documentation
        ├── LOCAL_REPLICATION_LOG.md
        ├── REPLICATION_GUIDE.md
        └── EXPERIMENT_DESIGN.md
```

## Quick start

From project root:

```sh
./thesis/code/benchmarks/clone-benchmarks.sh
cd source/llmorpheus && npm install && npm run build
cd ../stryker-js && npm install && npm run build
./thesis/code/benchmarks/run-one-benchmark.sh Complex.js
```

See `thesis/docs/LOCAL_REPLICATION_LOG.md` for full replication steps.
