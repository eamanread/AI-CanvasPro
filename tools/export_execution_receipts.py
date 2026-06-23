# -*- coding: utf-8 -*-
"""File-bridge exporter: writes huanying-execution-receipts/v1 to disk so
QMAI can consume execution receipts read-only (symmetric counterpart of the
QMAI->Huanying director-memory bridge; nothing is written into QMAI).

Usage:
  python tools/export_execution_receipts.py --out <file.json> [--project <id>] [--base http://127.0.0.1:8777]
"""
import argparse
import json
import sys
import urllib.request


def main():
    parser = argparse.ArgumentParser(description="Export execution receipts for the QMAI flywheel")
    parser.add_argument("--out", required=True, help="output JSON file path")
    parser.add_argument("--project", default="", help="optional projectId filter")
    parser.add_argument("--base", default="http://127.0.0.1:8777", help="canvas agent base URL")
    args = parser.parse_args()

    url = f"{args.base}/api/v2/canvas-agent/receipts"
    if args.project:
        url += f"?projectId={urllib.parse.quote(args.project)}"
    with urllib.request.urlopen(url, timeout=15) as response:
        payload = json.loads(response.read().decode("utf-8"))
    receipts = payload.get("receipts")
    if not isinstance(receipts, dict) or receipts.get("schemaVersion") != "huanying-execution-receipts/v1":
        print("unexpected receipts payload", file=sys.stderr)
        return 1
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(receipts, handle, ensure_ascii=False, indent=2)
    print(f"wrote {args.out}: {len(receipts.get('executions', []))} executions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
