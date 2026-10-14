# OWT benchmark results

Chromium 141.0.7390.37 (headless), Node v22.22.0, Intel(R) Xeon(R) Processor @ 2.80GHz x4, 2026-10-14 00:24 UTC.
10 runs per benchmark (5 for 10k rows) after 5 in-page warmup steps; fresh page per run; CPU throttling 4x where noted. Durations are click -> next frame painted (rAF, rAF, setTimeout 0), in ms.

## Duration (ms): median (slowdown vs fastest)

| Benchmark | vanilla | vue 3.5.44 | react 19.3.0 | owt 1.0.0-beta.1 |
|:---|---:|---:|---:|---:|
| `run` create rows: creating 1,000 rows | **112.7** (1.00) | 144.3 (1.28) | 146.8 (1.30) | 121.5 (1.08) |
| `replace` replace all rows: replacing all 1,000 rows | **118.0** (1.00) | 159.5 (1.35) | 172.3 (1.46) | 139.8 (1.19) |
| `update` partial update: updating every 10th row of 1,000 rows (4x CPU slowdown) | **85.6** (1.00) | 112.1 (1.31) | 100.8 (1.18) | 97.2 (1.13) |
| `select` select row: highlighting a selected row (4x CPU slowdown) | **33.6** (1.00) | 60.0 (1.78) | 41.7 (1.24) | 42.5 (1.26) |
| `swap` swap rows: swapping 2 rows of a 1,000-row table (4x CPU slowdown) | **86.4** (1.00) | 109.2 (1.26) | 722.0 (8.36) | 90.7 (1.05) |
| `remove` remove row: removing one row (4x CPU slowdown) | **138.9** (1.00) | 161.4 (1.16) | 147.3 (1.06) | 150.5 (1.08) |
| `runlots` create many rows: creating 10,000 rows | **1121.8** (1.00) | 1276.5 (1.14) | 1479.9 (1.32) | 1209.0 (1.08) |
| `add` append rows to large table: appending 1,000 rows to a table of 1,000 rows | **143.4** (1.00) | 176.3 (1.23) | 170.6 (1.19) | 160.8 (1.12) |
| `clear` clear rows: clearing a table with 1,000 rows | **10.4** (1.00) | 13.1 (1.26) | 17.6 (1.69) | 12.2 (1.17) |
| **geometric mean** of slowdown | **1.00** | **1.30** | **1.59** | **1.13** |

## Duration details (ms)

Columns are total click-to-paint durations; "JS" is the median time from the click to the first
animation frame callback (event handler + framework work + microtasks, before style/layout/paint).

| Benchmark | Framework | n | median | mean | stddev | min | max | JS |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|
| `run` | vanilla | 10 | 112.7 | 112.1 | 4.4 | 105.0 | 118.1 | 7.0 |
| `run` | vue | 10 | 144.3 | 152.0 | 21.1 | 131.9 | 199.8 | 21.5 |
| `run` | react | 10 | 146.8 | 149.2 | 16.3 | 131.1 | 182.5 | 25.7 |
| `run` | owt | 10 | 121.5 | 124.6 | 8.1 | 116.7 | 138.3 | 16.3 |
| `replace` | vanilla | 10 | 118.0 | 124.0 | 20.2 | 111.4 | 180.3 | 14.3 |
| `replace` | vue | 10 | 159.5 | 164.4 | 16.0 | 139.5 | 195.4 | 31.1 |
| `replace` | react | 10 | 172.3 | 175.2 | 15.0 | 157.0 | 204.4 | 39.5 |
| `replace` | owt | 10 | 139.8 | 138.7 | 10.2 | 123.1 | 151.3 | 23.7 |
| `update` | vanilla | 10 | 85.6 | 87.4 | 9.7 | 71.3 | 105.2 | 3.6 |
| `update` | vue | 10 | 112.1 | 113.1 | 10.7 | 100.3 | 131.6 | 29.1 |
| `update` | react | 10 | 100.8 | 101.6 | 11.2 | 86.6 | 128.9 | 19.9 |
| `update` | owt | 10 | 97.2 | 100.5 | 13.6 | 85.7 | 128.8 | 9.6 |
| `select` | vanilla | 10 | 33.6 | 33.9 | 7.4 | 22.5 | 45.8 | 1.5 |
| `select` | vue | 10 | 60.0 | 60.3 | 8.2 | 49.5 | 77.6 | 24.5 |
| `select` | react | 10 | 41.7 | 43.5 | 4.0 | 37.7 | 50.3 | 10.4 |
| `select` | owt | 10 | 42.5 | 41.3 | 6.9 | 25.8 | 48.1 | 7.6 |
| `swap` | vanilla | 10 | 86.4 | 87.6 | 9.4 | 73.7 | 104.1 | 2.0 |
| `swap` | vue | 10 | 109.2 | 114.0 | 12.7 | 99.9 | 135.4 | 25.1 |
| `swap` | react | 10 | 722.0 | 716.9 | 25.4 | 673.1 | 750.0 | 79.6 |
| `swap` | owt | 10 | 90.7 | 90.7 | 9.7 | 69.7 | 105.6 | 5.0 |
| `remove` | vanilla | 10 | 138.9 | 141.9 | 10.6 | 127.3 | 162.0 | 1.8 |
| `remove` | vue | 10 | 161.4 | 165.9 | 13.9 | 152.2 | 198.7 | 27.0 |
| `remove` | react | 10 | 147.3 | 149.7 | 12.1 | 133.8 | 173.9 | 10.9 |
| `remove` | owt | 10 | 150.5 | 148.6 | 15.3 | 122.9 | 177.2 | 5.9 |
| `runlots` | vanilla | 5 | 1121.8 | 1114.1 | 43.9 | 1046.5 | 1158.9 | 92.6 |
| `runlots` | vue | 5 | 1276.5 | 1258.2 | 44.8 | 1205.2 | 1297.9 | 203.7 |
| `runlots` | react | 5 | 1479.9 | 1478.1 | 33.9 | 1439.1 | 1527.1 | 420.3 |
| `runlots` | owt | 5 | 1209.0 | 1215.7 | 43.6 | 1160.0 | 1260.5 | 137.3 |
| `add` | vanilla | 10 | 143.4 | 143.5 | 9.8 | 125.8 | 157.8 | 6.7 |
| `add` | vue | 10 | 176.3 | 175.0 | 11.2 | 160.1 | 199.1 | 28.7 |
| `add` | react | 10 | 170.6 | 168.8 | 9.4 | 155.8 | 180.5 | 25.6 |
| `add` | owt | 10 | 160.8 | 158.9 | 7.8 | 144.7 | 171.8 | 16.1 |
| `clear` | vanilla | 10 | 10.4 | 10.5 | 0.6 | 9.8 | 11.9 | 7.9 |
| `clear` | vue | 10 | 13.1 | 13.1 | 0.6 | 12.3 | 14.1 | 10.8 |
| `clear` | react | 10 | 17.6 | 17.7 | 0.6 | 17.0 | 18.7 | 15.2 |
| `clear` | owt | 10 | 12.2 | 13.2 | 2.7 | 11.3 | 18.5 | 9.3 |

## Memory (MB, JS heap used after forced GC)

| Measurement | vanilla | vue 3.5.44 | react 19.3.0 | owt 1.0.0-beta.1 |
|:---|---:|---:|---:|---:|
| ready memory (after page load) | 1.77 | 2.02 | 2.24 | 1.82 |
| run memory (after creating 1,000 rows) | 2.12 | 4.12 | 4.36 | 2.95 |

## Production bundle size (all JS)

| Size | vanilla | vue 3.5.44 | react 19.3.0 | owt 1.0.0-beta.1 |
|:---|---:|---:|---:|---:|
| raw | 2.2 KiB | 63.9 KiB | 216.9 KiB | 18.6 KiB |
| gzip (level 9) | 1.2 KiB | 24.8 KiB | 67.0 KiB | 6.9 KiB |
