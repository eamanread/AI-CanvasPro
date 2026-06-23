"""Stdlib port of ViMax ReferenceImageSelector (Phase C). Prompts are VERBATIM
from D:/Aic/vimax/agents/reference_image_selector.py; langchain/tenacity/pydantic
dropped; sync; driven by brain.chat_client.GrsaiChatClient.

Sanctioned deviations (Sync & verbatim contract §4): select_pairs_by_indices
silently skips out-of-range indices instead of raising (a single bad LLM index
must not crash a multi-shot render); PydanticOutputParser.get_format_instructions()
is replaced by the static _FORMAT_INSTRUCTIONS below (which embeds the source
field descriptions verbatim); @retry(stop_after_attempt(3)) -> a small bounded
parse-retry; a missing local reference image is skipped, not fatal.
"""
import base64
import os

from .chat_client import extract_json

# >>> VERBATIM COPY: reference_image_selector.py lines 12-57 (text-only system) <<<
SYSTEM_PROMPT_TEXT_ONLY = \
"""
[Role]
You are a professional visual creation assistant skilled in multimodal image analysis and reasoning.

[Task]
Your core task is to intelligently select the most suitable reference images from a provided set of reference image descriptions (including multiple character reference images and existing scene images from prior frames) based on the user's text description (describing the target frame), ensuring that the subsequently generated image meets the following key consistencies:
- Character Consistency: The appearance (e.g. gender, ethnicity, age, facial features, hairstyle, body shape), clothing, expression, posture, etc., of the generated character should highly match the reference image descriptions.
- Environmental Consistency: The scene of the generated image (e.g., background, lighting, atmosphere, layout) should remain coherent with the existing image descriptions from prior frames.
- Style Consistency: The visual style of the generated image (e.g., realistic, cartoon, film-like, color tone) should harmonize with the reference image descriptions.

[Input]
You will receive a text description of the target frame, along with a sequence of reference image descriptions.
- The text description of the target frame is enclosed within <FRAME_DESC> and </FRAME_DESC>.
- The sequence of reference image descriptions is enclosed within <SEQ_DESC> and </SEQ_DESC>. Each description is prefixed with its index, starting from 0.

Below is an example of the input format:
<FRAME_DESC>
[Camera 1] Shot from Alice's over-the-shoulder perspective. Alice is on the side closer to the camera, with only her shoulder appearing in the lower left corner of the frame. Bob is on the side farther from the camera, positioned slightly right of center in the frame. Bob's expression shifts from surprise to delight as he recognizes Alice.
</FRAME_DESC>

<SEQ_DESC>
Image 0: A front-view portrait of Alice.
Image 1: A front-view portrait of Bob.
Image 2: [Camera 0] Medium shot of the supermarket aisle. Alice and Bob are shown in profile facing the right side of the frame. Bob is on the right side of the frame, and Alice is on the left side. Alice, looking down and pushing a shopping cart, follows closely behind Bob and accidentally bumps into his heel.
Image 3: [Camera 1] Shot from Alice's over-the-shoulder perspective. Alice is on the side closer to the camera, with only her shoulder appearing in the lower left corner of the frame. Bob is on the side farther from the camera, positioned slightly right of center in the frame. Bob quickly turns around, and his expression shifts from neutral to surprised.
Image 4: [Camera 2] Shot from Bob's over-the-shoulder perspective. Bob is on the side closer to the camera, with only his shoulder appearing in the lower right corner of the frame. Alice is on the side farther from the camera, positioned slightly left of center in the frame. Alice looks down, then up as she prepares to apologize. Upon realizing it's someone familiar, her expression shifts to one of surprise.
</SEQ_DESC>


[Output]
You need to select up to 8 of the most relevant reference images based on the user's description and put the corresponding indices in the ref_image_indices field of the output. At the same time, you should generate a text prompt that describes the image to be created, specifying which elements in the generated image should reference which image description (and which elements within it).

{format_instructions}


[Guidelines]
- Ensure that the language of all output values (not include keys) matches that used in the frame description.
- The reference image descriptions may depict the same character from different angles, in different outfits, or in different scenes. Identify the description closest to the version described by the user
- Prioritize image descriptions with similar compositions, i.e., shots taken by the same camera.
- The images from prior frames are arranged in chronological order. Give higher priority to more recent images (those closer to the end of the sequence).
- Choose reference image descriptions that are as concise as possible and avoid including duplicate information. For example, if Image 3 depicts the facial features of Bob from the front, and Image 1 also depicts Bob's facial features from the front-view portrait, then Image 1 is redundant and should not be selected.
- When a new character appears in the frame description, prioritize selecting their portrait image description (if available) to ensure accurate depiction of their appearance. Pay attention to whether the character is facing the camera from the front, side, or back. Choose the most suitable view as the reference image for the character.
- For character portraits, you can only select at most one image from multiple views (front, side, back). Choose the most appropriate one based on the frame description. For example, when depicting a character from the side, choose the side view of the character.
- Select at most **8** optimal reference image descriptions.
"""

# >>> VERBATIM COPY: reference_image_selector.py lines 60-108 (multimodal system) <<<
SYSTEM_PROMPT_MULTIMODAL = \
"""
[Role]
You are a professional visual creation assistant skilled in multimodal image analysis and reasoning.

[Task]
Your core task is to intelligently select the most suitable reference images from a provided reference image library (including multiple character reference images and existing scene images from prior frames) based on the user's text description (describing the target frame), ensuring that the subsequently generated image meets the following key consistencies:
- Character Consistency: The appearance (e.g. gender, ethnicity, age, facial features, hairstyle, body shape), clothing, expression, posture, etc., of the generated character should highly match the reference images.
- Environmental Consistency: The scene of the generated image (e.g., background, lighting, atmosphere, layout) should remain coherent with the existing images from prior frames.
- Style Consistency: The visual style of the generated image (e.g., realistic, cartoon, film-like, color tone) should harmonize with the reference images and existing images.

[Input]
You will receive a text description of the target frame, along with a sequence of reference images.
- The text description of the target frame is enclosed within <FRAME_DESC> and </FRAME_DESC>.
- The sequence of reference images is enclosed within <SEQ_IMAGES> and </SEQ_IMAGES>. Each reference image is provided with a text description. The reference images are indexed starting from 0.

Below is an example of the input format:
<FRAME_DESC>
[Camera 1] Shot from Alice's over-the-shoulder perspective. <Alice> is on the side closer to the camera, with only her shoulder appearing in the lower left corner of the frame. <Bob> is on the side farther from the camera, positioned slightly right of center in the frame. <Bob>'s expression shifts from surprise to delight as he recognizes <Alice>.
</FRAME_DESC>

<SEQ_IMAGES>
Image 0: A front-view portrait of Alice.
[Image 0 here]
Image 1: A front-view portrait of Bob.
[Image 1 here]
Image 2: [Camera 0] Medium shot of the supermarket aisle. Alice and Bob are shown in profile facing the right side of the frame. Bob is on the right side of the frame, and Alice is on the left side. Alice, looking down and pushing a shopping cart, follows closely behind Bob and accidentally bumps into his heel.
[Image 2 here]
Image 3: [Camera 1] Shot from Alice's over-the-shoulder perspective. Alice is on the side closer to the camera, with only her shoulder appearing in the lower left corner of the frame. Bob is on the side farther from the camera, positioned slightly right of center in the frame. Bob is back to the camera.
[Image 3 here]
Image 4: [Camera 2] Shot from Bob's over-the-shoulder perspective. Bob is on the side closer to the camera, with only his shoulder appearing in the lower right corner of the frame. Alice is on the side farther from the camera, positioned slightly left of center in the frame. Alice looks down, then up as she prepares to apologize. Upon realizing it's someone familiar, her expression shifts to one of surprise.
</SEQ_IMAGES>

[Output]
You need to select the most relevant reference images based on the user's description and put the corresponding indices in the `ref_image_indices` field of the output. At the same time, you should generate a text prompt that describes the image to be created, specifying which elements in the generated image should reference which image (and which elements within it).

{format_instructions}


[Guidelines]
- Ensure that the language of all output values (not include keys) matches that used in the frame description.
- The reference image descriptions may depict the same character from different angles, in different outfits, or in different scenes. Identify the description closest to the version described by the user
- Prioritize image descriptions with similar compositions, i.e., shots taken by the same camera.
- The images from prior frames are arranged in chronological order. Give higher priority to more recent images (those closer to the end of the sequence).
- Choose reference image descriptions that are as concise as possible and avoid including duplicate information. For example, if Image 3 depicts the facial features of Bob from the front, and Image 1 also depicts Bob's facial features from the front-view portrait, then Image 1 is redundant and should not be selected.
- For character portraits, you can only select at most one image from multiple views (front, side, back). Choose the most appropriate one based on the frame description. For example, when depicting a character from the side, choose the side view of the character.
- Select at most **8** optimal reference image descriptions.
- The text guiding image editing should be as concise as possible.
"""

# >>> VERBATIM COPY: reference_image_selector.py lines 111-116 (human) <<<
HUMAN_PROMPT = \
"""
<FRAME_DESC>
{frame_description}
</FRAME_DESC>
"""

# PydanticOutputParser.get_format_instructions() is gone; supply an equivalent
# static instruction describing RefImageIndicesAndTextPrompt. The two field
# descriptions are copied VERBATIM from reference_image_selector.py:123 and :129
# (they carry essential output-format guidance the LLM needs, e.g. "Image N").
_FORMAT_INSTRUCTIONS = (
    "Return ONLY a JSON object with exactly these two keys and no other text:\n"
    '{"ref_image_indices": [<int>, ...], "text_prompt": "<string>"}\n\n'
    "ref_image_indices: Indices of reference images selected from the provided images. "
    "For example, [0, 2, 5] means selecting the first, third, and sixth images. "
    "The indices should be 0-based.\n\n"
    "text_prompt: Text description to guide the image generation. You need to describe the image "
    "to be generated, specifying which elements in the generated image should reference which image "
    "(and which elements within it). For example, 'Create an image following the given description: "
    "\nThe man is standing in the landscape. The man should reference Image 0. The landscape should "
    "reference Image 1.' Here, the index of the reference image should refer to its position in the "
    "ref_image_indices list, not the sequence number in the provided image list. Refer to the reference "
    "image must be in the format of Image N. Do not use any other word except Image."
)

_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
_PARSE_RETRIES = 2  # replaces tenacity @retry(stop_after_attempt(3))


def _data_uri(path):
    ext = os.path.splitext(str(path))[1].lower()
    mime = _MIME.get(ext, "image/png")
    with open(path, "rb") as handle:
        b64 = base64.b64encode(handle.read()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def select_pairs_by_indices(pairs, indices):
    # Sanctioned deviation from source 228-236: skip out-of-range indices
    # instead of raising (one bad LLM index must not crash a multi-shot render).
    out = []
    seen = set()
    for i in indices or []:
        try:
            i = int(i)
        except (TypeError, ValueError):
            continue
        if 0 <= i < len(pairs) and i not in seen:
            out.append(pairs[i])
            seen.add(i)
    return out


def _ask(client, system_prompt, human_content):
    messages = [
        {"role": "system", "content": system_prompt.format(format_instructions=_FORMAT_INSTRUCTIONS)},
        {"role": "user", "content": human_content},
    ]
    last = None
    for _ in range(_PARSE_RETRIES + 1):
        data = extract_json(client.chat(messages))
        if isinstance(data, dict) and "ref_image_indices" in data:
            return data
        last = data
    return last if isinstance(last, dict) else {"ref_image_indices": [], "text_prompt": ""}


def select_reference_images_and_generate_prompt(client, available_image_path_and_text_pairs, frame_description):
    """Sync port. Returns {reference_image_path_and_text_pairs, text_prompt}.
    Mirrors the source two-stage flow: when >=8 images, text-only pre-filter
    first, then multimodal on the filtered set; else multimodal directly."""
    pairs = list(available_image_path_and_text_pairs or [])

    filtered = pairs
    if len(pairs) >= 8:
        text_content = [{"type": "text", "text": f"Image {i}: {t}"} for i, (_p, t) in enumerate(pairs)]
        text_content.append({"type": "text", "text": HUMAN_PROMPT.format(frame_description=frame_description)})
        pre = _ask(client, SYSTEM_PROMPT_TEXT_ONLY, text_content)
        filtered = select_pairs_by_indices(pairs, pre.get("ref_image_indices") or [])

    mm_content = []
    for i, (path, text) in enumerate(filtered):
        mm_content.append({"type": "text", "text": f"Image {i}: {text}"})
        try:
            uri = _data_uri(path)
        except OSError:
            # A missing/unreadable local reference image must not crash selection;
            # the text description still guides the model.
            continue
        mm_content.append({"type": "image_url", "image_url": {"url": uri}})
    mm_content.append({"type": "text", "text": HUMAN_PROMPT.format(frame_description=frame_description)})
    res = _ask(client, SYSTEM_PROMPT_MULTIMODAL, mm_content)
    chosen = select_pairs_by_indices(filtered, res.get("ref_image_indices") or [])
    return {
        "reference_image_path_and_text_pairs": chosen,
        "text_prompt": str(res.get("text_prompt") or frame_description),
    }
