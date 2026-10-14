# OWT benchmark results

Chromium 141.0.7390.37 (headless), Node v22.22.0, Intel(R) Xeon(R) Processor @ 2.80GHz x4, 2026-10-14 01:49 UTC.
10 runs per benchmark (5 for 10k rows) after 5 in-page warmup steps; fresh page per run; CPU throttling 4x where noted. Durations are click -> next frame painted (rAF, rAF, setTimeout 0), in ms.

## Duration (ms): median (slowdown vs fastest)

| Benchmark | vanilla | vue 3.5.44 | react 19.3.0 | owt 1.0.0-beta.1 |
|:---|---:|---:|---:|---:|
| `run` create rows: creating 1,000 rows | **102.6** (1.00) | 130.0 (1.27) | 129.0 (1.26) | 125.7 (1.23) |
| `replace` replace all rows: replacing all 1,000 rows | **112.6** (1.00) | 157.8 (1.40) | 161.2 (1.43) | 132.5 (1.18) |
| `update` partial update: updating every 10th row of 1,000 rows (4x CPU slowdown) | **74.5** (1.00) | 102.3 (1.37) | 88.5 (1.19) | 87.6 (1.18) |
| `select` select row: highlighting a selected row (4x CPU slowdown) | **32.7** (1.00) | 56.5 (1.73) | 40.8 (1.25) | 33.8 (1.03) |
| `swap` swap rows: swapping 2 rows of a 1,000-row table (4x CPU slowdown) | **70.7** (1.00) | 89.3 (1.26) | 656.8 (9.29) | 73.6 (1.04) |
| `remove` remove row: removing one row (4x CPU slowdown) | **124.1** (1.00) | 152.7 (1.23) | 147.2 (1.19) | 145.1 (1.17) |
| `runlots` create many rows: creating 10,000 rows | **1091.9** (1.00) | 1269.1 (1.16) | 1432.1 (1.31) | 1200.5 (1.10) |
| `add` append rows to large table: appending 1,000 rows to a table of 1,000 rows | **120.6** (1.00) | 161.9 (1.34) | 151.8 (1.26) | 151.9 (1.26) |
| `clear` clear rows: clearing a table with 1,000 rows | **9.7** (1.00) | 12.0 (1.24) | 17.0 (1.76) | 11.1 (1.15) |
| **geometric mean** of slowdown | **1.00** | **1.33** | **1.64** | **1.15** |

## Duration details (ms)

Columns are total click-to-paint durations; "JS" is the median time from the click to the first
animation frame callback (event handler + framework work + microtasks, before style/layout/paint).

| Benchmark | Framework | n | median | mean | stddev | min | max | JS |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|
| `run` | vanilla | 10 | 102.6 | 108.5 | 20.3 | 95.5 | 165.4 | 6.7 |
| `run` | vue | 10 | 130.0 | 131.8 | 7.0 | 120.7 | 144.2 | 20.4 |
| `run` | react | 10 | 129.0 | 128.8 | 5.1 | 120.2 | 137.3 | 24.3 |
| `run` | owt | 10 | 125.7 | 126.4 | 13.2 | 108.6 | 146.9 | 16.0 |
| `replace` | vanilla | 10 | 112.6 | 117.6 | 10.0 | 108.8 | 140.8 | 13.9 |
| `replace` | vue | 10 | 157.8 | 168.6 | 26.6 | 141.5 | 214.6 | 29.9 |
| `replace` | react | 10 | 161.2 | 165.4 | 21.0 | 143.0 | 212.3 | 37.1 |
| `replace` | owt | 10 | 132.5 | 135.6 | 12.1 | 121.5 | 156.3 | 24.1 |
| `update` | vanilla | 10 | 74.5 | 79.2 | 18.2 | 65.9 | 127.1 | 3.2 |
| `update` | vue | 10 | 102.3 | 103.6 | 10.0 | 90.1 | 126.4 | 27.1 |
| `update` | react | 10 | 88.5 | 91.0 | 7.9 | 82.7 | 108.8 | 17.1 |
| `update` | owt | 10 | 87.6 | 89.0 | 10.0 | 77.5 | 110.8 | 9.6 |
| `select` | vanilla | 10 | 32.7 | 36.1 | 9.4 | 26.3 | 53.1 | 1.6 |
| `select` | vue | 10 | 56.5 | 57.2 | 8.4 | 47.1 | 71.1 | 23.0 |
| `select` | react | 10 | 40.8 | 42.3 | 5.7 | 34.2 | 52.2 | 10.9 |
| `select` | owt | 10 | 33.8 | 34.0 | 3.3 | 30.1 | 41.6 | 2.5 |
| `swap` | vanilla | 10 | 70.7 | 69.4 | 6.4 | 58.2 | 78.7 | 1.8 |
| `swap` | vue | 10 | 89.3 | 92.8 | 11.4 | 80.7 | 108.3 | 23.0 |
| `swap` | react | 10 | 656.8 | 655.2 | 52.9 | 584.0 | 748.8 | 77.0 |
| `swap` | owt | 10 | 73.6 | 77.5 | 13.4 | 61.1 | 107.7 | 4.1 |
| `remove` | vanilla | 10 | 124.1 | 123.6 | 13.7 | 97.6 | 153.0 | 1.6 |
| `remove` | vue | 10 | 152.7 | 163.0 | 21.1 | 146.4 | 206.4 | 25.7 |
| `remove` | react | 10 | 147.2 | 149.6 | 10.9 | 138.0 | 172.2 | 11.5 |
| `remove` | owt | 10 | 145.1 | 140.9 | 11.7 | 124.0 | 159.8 | 6.1 |
| `runlots` | vanilla | 5 | 1091.9 | 1094.4 | 32.7 | 1050.2 | 1139.7 | 85.6 |
| `runlots` | vue | 5 | 1269.1 | 1286.3 | 33.8 | 1266.7 | 1345.7 | 199.8 |
| `runlots` | react | 5 | 1432.1 | 1444.4 | 52.3 | 1392.0 | 1526.3 | 435.5 |
| `runlots` | owt | 5 | 1200.5 | 1220.8 | 116.5 | 1100.7 | 1402.7 | 146.5 |
| `add` | vanilla | 10 | 120.6 | 123.8 | 6.1 | 118.4 | 135.2 | 6.4 |
| `add` | vue | 10 | 161.9 | 162.2 | 11.2 | 150.1 | 180.6 | 27.6 |
| `add` | react | 10 | 151.8 | 158.4 | 16.4 | 143.3 | 193.0 | 24.5 |
| `add` | owt | 10 | 151.9 | 151.3 | 10.6 | 135.1 | 170.1 | 15.3 |
| `clear` | vanilla | 10 | 9.7 | 9.9 | 1.3 | 8.7 | 13.5 | 7.3 |
| `clear` | vue | 10 | 12.0 | 13.2 | 2.5 | 10.8 | 17.7 | 9.8 |
| `clear` | react | 10 | 17.0 | 16.9 | 0.9 | 15.6 | 18.7 | 14.7 |
| `clear` | owt | 10 | 11.1 | 12.2 | 2.4 | 10.0 | 17.6 | 9.0 |

## Memory (MB, JS heap used after forced GC)

| Measurement | vanilla | vue 3.5.44 | react 19.3.0 | owt 1.0.0-beta.1 |
|:---|---:|---:|---:|---:|
| ready memory (after page load) | 1.77 | 2.02 | 2.24 | 1.82 |
| run memory (after creating 1,000 rows) | 2.12 | 4.13 | 4.36 | 3.12 |

## Production bundle size (all JS)

| Size | vanilla | vue 3.5.44 | react 19.3.0 | owt 1.0.0-beta.1 |
|:---|---:|---:|---:|---:|
| raw | 2.2 KiB | 63.9 KiB | 216.9 KiB | 20.7 KiB |
| gzip (level 9) | 1.2 KiB | 24.8 KiB | 67.0 KiB | 7.5 KiB |
