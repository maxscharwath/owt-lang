# OWT benchmark results

Chromium 141.0.7390.37 (headless), Node v22.22.0, Intel(R) Xeon(R) Processor @ 2.80GHz x4, 2026-10-13 23:53 UTC.
10 runs per benchmark (5 for 10k rows) after 5 in-page warmup steps; fresh page per run; CPU throttling 4x where noted. Durations are click -> next frame painted (rAF, rAF, setTimeout 0), in ms.

## Duration (ms): median (slowdown vs fastest)

| Benchmark | vanilla | vue 3.5.44 | react 19.3.0 | owt 1.0.0-beta.1 |
|:---|---:|---:|---:|---:|
| `run` create rows: creating 1,000 rows | **111.6** (1.00) | 141.2 (1.26) | 142.6 (1.28) | 127.7 (1.14) |
| `replace` replace all rows: replacing all 1,000 rows | **122.1** (1.00) | 163.4 (1.34) | 166.8 (1.37) | 139.8 (1.15) |
| `update` partial update: updating every 10th row of 1,000 rows (4x CPU slowdown) | **56.5** (1.00) | 91.1 (1.61) | 82.6 (1.46) | 80.0 (1.42) |
| `select` select row: highlighting a selected row (4x CPU slowdown) | **36.1** (1.00) | 54.3 (1.50) | 41.9 (1.16) | 39.0 (1.08) |
| `swap` swap rows: swapping 2 rows of a 1,000-row table (4x CPU slowdown) | **72.9** (1.00) | 98.3 (1.35) | 658.7 (9.04) | 76.4 (1.05) |
| `remove` remove row: removing one row (4x CPU slowdown) | **128.6** (1.00) | 148.6 (1.16) | 137.6 (1.07) | 129.1 (1.00) |
| `runlots` create many rows: creating 10,000 rows | **1163.9** (1.00) | 1379.2 (1.18) | 1528.5 (1.31) | 1213.7 (1.04) |
| `add` append rows to large table: appending 1,000 rows to a table of 1,000 rows | **133.0** (1.00) | 168.0 (1.26) | 162.8 (1.22) | 159.3 (1.20) |
| `clear` clear rows: clearing a table with 1,000 rows | **10.0** (1.00) | 12.7 (1.27) | 17.4 (1.75) | 12.4 (1.24) |
| **geometric mean** of slowdown | **1.00** | **1.32** | **1.63** | **1.14** |

## Duration details (ms)

Columns are total click-to-paint durations; "JS" is the median time from the click to the first
animation frame callback (event handler + framework work + microtasks, before style/layout/paint).

| Benchmark | Framework | n | median | mean | stddev | min | max | JS |
|:---|---:|---:|---:|---:|---:|---:|---:|---:|
| `run` | vanilla | 10 | 111.6 | 117.7 | 18.1 | 97.5 | 141.2 | 7.5 |
| `run` | vue | 10 | 141.2 | 141.9 | 13.4 | 126.9 | 173.5 | 22.5 |
| `run` | react | 10 | 142.6 | 142.0 | 10.6 | 124.8 | 160.7 | 29.4 |
| `run` | owt | 10 | 127.7 | 128.9 | 14.4 | 106.6 | 159.4 | 14.9 |
| `replace` | vanilla | 10 | 122.1 | 125.7 | 18.1 | 106.8 | 158.8 | 14.0 |
| `replace` | vue | 10 | 163.4 | 164.5 | 20.4 | 142.6 | 208.6 | 34.2 |
| `replace` | react | 10 | 166.8 | 166.8 | 10.5 | 153.9 | 183.5 | 38.1 |
| `replace` | owt | 10 | 139.8 | 140.6 | 13.9 | 115.9 | 159.6 | 25.0 |
| `update` | vanilla | 10 | 56.5 | 58.0 | 13.5 | 37.0 | 74.8 | 2.7 |
| `update` | vue | 10 | 91.1 | 93.8 | 22.7 | 66.1 | 145.0 | 29.1 |
| `update` | react | 10 | 82.6 | 83.9 | 22.8 | 61.5 | 138.0 | 16.7 |
| `update` | owt | 10 | 80.0 | 80.5 | 6.8 | 66.7 | 92.5 | 10.5 |
| `select` | vanilla | 10 | 36.1 | 38.0 | 4.9 | 33.0 | 46.9 | 2.1 |
| `select` | vue | 10 | 54.3 | 54.7 | 5.1 | 45.5 | 63.9 | 23.7 |
| `select` | react | 10 | 41.9 | 45.9 | 9.3 | 36.0 | 61.3 | 10.4 |
| `select` | owt | 10 | 39.0 | 39.8 | 4.9 | 32.4 | 46.8 | 8.2 |
| `swap` | vanilla | 10 | 72.9 | 73.9 | 12.1 | 55.8 | 96.0 | 1.9 |
| `swap` | vue | 10 | 98.3 | 99.1 | 11.2 | 82.1 | 121.9 | 24.3 |
| `swap` | react | 10 | 658.7 | 663.4 | 37.3 | 606.7 | 720.6 | 75.4 |
| `swap` | owt | 10 | 76.4 | 79.2 | 11.9 | 61.5 | 101.2 | 4.5 |
| `remove` | vanilla | 10 | 128.6 | 132.3 | 18.4 | 114.1 | 180.1 | 2.1 |
| `remove` | vue | 10 | 148.6 | 146.2 | 16.2 | 103.9 | 160.3 | 23.1 |
| `remove` | react | 10 | 137.6 | 134.2 | 15.7 | 101.9 | 162.3 | 10.4 |
| `remove` | owt | 10 | 129.1 | 127.2 | 10.8 | 101.3 | 139.5 | 5.9 |
| `runlots` | vanilla | 5 | 1163.9 | 1149.7 | 45.2 | 1080.6 | 1201.7 | 102.3 |
| `runlots` | vue | 5 | 1379.2 | 1348.6 | 68.0 | 1246.3 | 1418.1 | 234.4 |
| `runlots` | react | 5 | 1528.5 | 1549.5 | 94.1 | 1461.6 | 1702.7 | 455.4 |
| `runlots` | owt | 5 | 1213.7 | 1227.3 | 41.7 | 1192.5 | 1295.6 | 156.9 |
| `add` | vanilla | 10 | 133.0 | 134.2 | 6.5 | 123.9 | 146.5 | 6.9 |
| `add` | vue | 10 | 168.0 | 168.3 | 9.3 | 156.2 | 181.8 | 28.0 |
| `add` | react | 10 | 162.8 | 163.0 | 9.4 | 146.8 | 179.7 | 25.8 |
| `add` | owt | 10 | 159.3 | 156.1 | 12.2 | 136.1 | 175.3 | 15.7 |
| `clear` | vanilla | 10 | 10.0 | 11.8 | 2.9 | 9.3 | 17.2 | 7.6 |
| `clear` | vue | 10 | 12.7 | 13.1 | 1.2 | 12.0 | 15.9 | 10.4 |
| `clear` | react | 10 | 17.4 | 17.7 | 1.2 | 16.2 | 20.0 | 15.0 |
| `clear` | owt | 10 | 12.4 | 13.1 | 2.3 | 10.6 | 16.6 | 9.4 |

## Memory (MB, JS heap used after forced GC)

| Measurement | vanilla | vue 3.5.44 | react 19.3.0 | owt 1.0.0-beta.1 |
|:---|---:|---:|---:|---:|
| ready memory (after page load) | 1.77 | 2.02 | 2.24 | 1.82 |
| run memory (after creating 1,000 rows) | 2.12 | 4.13 | 4.37 | 2.93 |

## Production bundle size (all JS)

| Size | vanilla | vue 3.5.44 | react 19.3.0 | owt 1.0.0-beta.1 |
|:---|---:|---:|---:|---:|
| raw | 2.2 KiB | 63.9 KiB | 216.9 KiB | 16.7 KiB |
| gzip (level 9) | 1.2 KiB | 24.8 KiB | 67.0 KiB | 6.2 KiB |
