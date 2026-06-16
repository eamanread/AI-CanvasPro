"""Stdlib port of ViMax CharacterPortraitsGenerator (Phase C). Prompt templates
VERBATIM from D:/Aic/vimax/agents/character_portraits_generator.py:17-32; dead
langchain imports omitted; tenacity dropped; CharacterInScene -> dict; sync.

Tenacity @retry dropped (justified): the broker retries transient draw failures
internally and refunds a hard failure; the render-side retry is the judge reshoot
loop; a view that still fails surfaces as an error record (its failed draw is
refunded). Reference chain is load-bearing: front uses NO reference; side & back
both reference front_image_path only. Methods are sync (the brain ImageGenerator
is sync; the orchestrator runs it in a worker thread)."""

# >>> VERBATIM COPY: character_portraits_generator.py lines 17-22 <<<
PROMPT_TEMPLATE_FRONT = \
"""
Generate a full-body, front-view portrait of character {identifier} based on the following description, with a pure white background. The character should be centered in the image, occupying most of the frame. Gazing straight ahead. Standing with arms relaxed at sides. Natural expression.
Features: {features}
Style: {style}
"""

# >>> VERBATIM COPY: lines 24-27 <<<
PROMPT_TEMPLATE_SIDE = \
"""
Generate a full-body, side-view portrait of character {identifier} based on the provided front-view portrait, with a pure white background. The character should be centered in the image, occupying most of the frame. Facing left. Standing with arms relaxed at sides.
"""

# >>> VERBATIM COPY: lines 29-32 <<<
PROMPT_TEMPLATE_BACK = \
"""
Generate a full-body, back-view portrait of character {identifier} based on the provided front-view portrait, with a pure white background. The character should be centered in the image, occupying most of the frame. No facial features should be visible.
"""


def _features(character):
    # Reproduces source line 49's OUTPUT exactly: `"(static) " + static + "; (dynamic) " + dynamic`
    # (source +-concats a pydantic object; this f-string over the dict yields the identical string).
    return f"(static) {character.get('static_features', '')}; (dynamic) {character.get('dynamic_features', '')}"


class CharacterPortraitsGenerator:
    def __init__(self, image_generator):
        self.image_generator = image_generator

    def generate_front_portrait(self, character, style):
        prompt = PROMPT_TEMPLATE_FRONT.format(
            identifier=character.get("identifier_in_scene", ""),
            features=_features(character), style=style or "")
        return self.image_generator.generate_single_image(prompt=prompt)

    def generate_side_portrait(self, character, front_image_path):
        prompt = PROMPT_TEMPLATE_SIDE.format(identifier=character.get("identifier_in_scene", ""))
        return self.image_generator.generate_single_image(
            prompt=prompt, reference_image_paths=[front_image_path])

    def generate_back_portrait(self, character, front_image_path):
        prompt = PROMPT_TEMPLATE_BACK.format(identifier=character.get("identifier_in_scene", ""))
        return self.image_generator.generate_single_image(
            prompt=prompt, reference_image_paths=[front_image_path])
