# 20 Test Family Catalog

Current executable test family catalog. Detailed feature source lives under `docs/06-详细设计库/`.

| ID | Family | Minimal steps | Oracle | Preferred automation |
|---|---|---|---|---|
| LOG-01 | logic | Pick one F/INF object and execute its minimal visible path. | Validate boundaries, state changes, persistence, and recovery. | Unit + UI + Packaged |
| FUN-01 | functional | Pick one F/INF object and execute its minimal visible path. | Validate the visible user path. | Unit + UI + Packaged |
| ABU-01 | abuse | Pick one F/INF object and execute its minimal visible path. | Validate invalid input, repeated actions, conflicts, and rejection paths. | Unit + UI + Packaged |
| STR-01 | stress | Pick one F/INF object and execute its minimal visible path. | Validate large data, long tasks, and restart recovery. | Unit + UI + Packaged |
| EXP-01 | experience | Pick one F/INF object and execute its minimal visible path. | Validate hierarchy, feedback latency, and discoverability. | Unit + UI + Packaged |
| SCN-01 | scenario | Pick one F/INF object and execute its minimal visible path. | Validate cross-page and cross-runtime closure. | Unit + UI + Packaged |
