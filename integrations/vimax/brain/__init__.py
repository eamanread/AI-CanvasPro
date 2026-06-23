"""ViMax 'brain' extracted into huanying (P3 migration, Phase A).

The valuable IP of ViMax is its prompts + decomposition schema, NOT its Python
runtime. This package ports the prompts VERBATIM (faithful to the ViMax source)
and drives them with a stdlib-only OpenAI-compatible HTTP client - no venv, no
langchain, no pydantic, no subprocess bridge. It produces the same
vimax-shotplan/v1 contract the external runner does, so the golden对账 (Phase A)
and the native orchestrator (Phase B) can run side by side with the external
runtime before it is retired (Phase C).
"""
