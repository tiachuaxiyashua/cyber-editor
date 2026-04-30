from __future__ import annotations

import argparse
import sys
from pathlib import Path


PLACEHOLDER_MARKERS = (
    "See canonical oracle",
    "本节无额外细则时",
    "/ 层 / 方法/事件 / 输入 / 输出 / 约束 /",
)


def discover_docs_root(repo_root: Path) -> Path:
    docs_root = repo_root / "docs"
    if not docs_root.exists():
        raise FileNotFoundError("docs root not found")
    return docs_root


def discover_feature_list(docs_root: Path) -> Path:
    path = docs_root / "01-需求与PRD" / "06-功能清单.md"
    if not path.exists():
        raise FileNotFoundError(f"feature list not found: {path}")
    return path


def discover_oracle_matrix(docs_root: Path) -> Path:
    path = docs_root / "04-测试验收" / "11-MSA-test-oracle-matrix.md"
    if not path.exists():
        raise FileNotFoundError(f"oracle matrix not found: {path}")
    return path


def domain_for_id(capability_id: str) -> str:
    prefix, raw_number = capability_id.split("-", 1)
    number = int(raw_number)
    if prefix == "INF":
        return "internal"
    if (1 <= number <= 14) or (122 <= number <= 124):
        return "platform"
    if (59 <= number <= 91) or number in (114, 115):
        return "orchestration-artifacts"
    if (43 <= number <= 58) or number in (140, 141, 145, 148, 149):
        return "ai-stage"
    if 117 <= number <= 121:
        return "knowledge"
    return "other"


def allowed_domains(scope: str) -> set[str]:
    if scope == "all":
        return {"platform", "orchestration-artifacts", "ai-stage", "knowledge", "other", "internal"}
    if scope == "p037-priority":
        return {"platform", "orchestration-artifacts", "ai-stage", "knowledge"}
    raise ValueError(f"Unsupported scope: {scope}")


def parse_feature_status_map(markdown: str) -> dict[str, str]:
    rows: dict[str, str] = {}
    for line in markdown.splitlines():
        if line.startswith("| F-") or line.startswith("| INF-"):
            parts = [part.strip() for part in line.strip().split("|")[1:-1]]
            if parts[0].startswith("F-") and len(parts) > 7:
                rows[parts[0]] = parts[7]
            elif parts[0].startswith("INF-") and len(parts) > 6:
                rows[parts[0]] = parts[6]
    return rows


def parse_oracle_status_map(markdown: str) -> dict[str, str]:
    rows: dict[str, str] = {}
    for line in markdown.splitlines():
        if not line.startswith("| F-"):
            continue
        parts = [part.strip() for part in line.strip().split("|")[1:-1]]
        if len(parts) > 3:
            rows[parts[0]] = parts[3]
    return rows


def collect_placeholder_rows(markdown: str, scope: str) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    domains = allowed_domains(scope)
    for line in markdown.splitlines():
        if not (line.startswith("| F-") or line.startswith("| INF-")):
            continue
        parts = [part.strip() for part in line.strip().split("|")[1:-1]]
        if len(parts) < 11:
            continue
        capability_id = parts[0]
        if domain_for_id(capability_id) not in domains:
            continue
        if any(marker in line for marker in PLACEHOLDER_MARKERS):
            rows.append((capability_id, line))
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit Cyber Editor documentation governance.")
    parser.add_argument(
        "--scope",
        default="p037-priority",
        choices=("p037-priority", "all"),
        help="Audit scope. Default is the p037 priority domains.",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    docs_root = discover_docs_root(repo_root)
    feature_list_path = discover_feature_list(docs_root)
    oracle_matrix_path = discover_oracle_matrix(docs_root)

    feature_text = feature_list_path.read_text(encoding="utf-8")
    oracle_text = oracle_matrix_path.read_text(encoding="utf-8")

    feature_status = parse_feature_status_map(feature_text)
    oracle_status = parse_oracle_status_map(oracle_text)

    status_conflicts: list[tuple[str, str, str]] = []
    for capability_id, actual_status in oracle_status.items():
        expected_status = feature_status.get(capability_id)
        if expected_status and actual_status != expected_status:
            status_conflicts.append((capability_id, expected_status, actual_status))

    placeholder_rows = collect_placeholder_rows(oracle_text, args.scope)

    print(f"scope={args.scope}")
    print(f"feature_list={feature_list_path.relative_to(repo_root)}")
    print(f"oracle_matrix={oracle_matrix_path.relative_to(repo_root)}")
    print(f"status_conflicts={len(status_conflicts)}")
    for capability_id, expected_status, actual_status in status_conflicts[:50]:
        print(f"STATUS_CONFLICT {capability_id}: feature={expected_status} oracle={actual_status}")

    print(f"placeholder_rows={len(placeholder_rows)}")
    for capability_id, _line in placeholder_rows[:200]:
        print(f"PLACEHOLDER_ROW {capability_id}")

    return 1 if status_conflicts or placeholder_rows else 0


if __name__ == "__main__":
    sys.exit(main())
