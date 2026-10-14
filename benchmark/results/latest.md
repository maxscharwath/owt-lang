# OWT benchmark results

Chromium 141.0.7390.37 (headless), Node v22.22.0, Intel(R) Xeon(R) Processor @ 2.80GHz x4, 2026-10-14 01:11 UTC.
10 runs per benchmark (5 for 10k rows) after 5 in-page warmup steps; fresh page per run; CPU throttling 4x where noted. Durations are click -> next frame painted (rAF, rAF, setTimeout 0), in ms.

## Duration (ms): median (slowdown vs fastest)

| Benchmark | react 19.3.0 | owt 1.0.0-beta.1 |
|:---|---:|---:|
| `select` select row: highlighting a selected row (4x CPU slowdown) | 42.8 (1.23) | **34.9** (1.00) |
| **geometric mean** of slowdown | **1.23** | **1.00** |

## Duration details (ms)

Columns are total click-to-paint durations; "JS" is the median time from the click to the first
animation frame callback (event handler + framework work + microtasks, before style/layout/paint).

| Benchmark | Framework | n | median | mean | stddev | min | max | JS |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|
| `select` | react | 10 | 42.8 | 43.2 | 5.0 | 36.3 | 53.7 | 10.8 |
| `select` | owt | 10 | 34.9 | 34.5 | 2.5 | 29.8 | 37.2 | 2.5 |

## Memory (MB, JS heap used after forced GC)

| Measurement | react 19.3.0 | owt 1.0.0-beta.1 |
|:---|---:|---:|
| ready memory (after page load) | 2.24 | 1.82 |
| run memory (after creating 1,000 rows) | 4.36 | 3.13 |

## Production bundle size (all JS)

| Size | react 19.3.0 | owt 1.0.0-beta.1 |
|:---|---:|---:|
| raw | 216.9 KiB | 20.7 KiB |
| gzip (level 9) | 67.0 KiB | 7.5 KiB |
