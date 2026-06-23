# director-suite 合入门（见 dev/01-DEV-PLAN.md §7）。Windows 无 make 时直接 `python verify.py`。
PY ?= python

verify:                 ## 合入门：任何动 _shared/ 或新增成员的 PR 必跑
	$(PY) verify.py

red:                    ## 红演示：poison case 应判 NO-GO / exit1
	$(PY) run.py baselines/cases_poison; \
	if [ $$? -eq 1 ]; then echo "OK: poison → NO-GO/exit1（秤会变红）"; else echo "FAIL: poison 未报红"; exit 1; fi

.PHONY: verify red
