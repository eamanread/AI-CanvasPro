# 模型无关能力契约（Capability Contract）· D3

> 把"分镜要喂模型什么"抽象成与具体模型无关的 **7 个能力位**。各适配层声明自己支不支持；\
> 上游分镜只面向本契约写，不绑某个模型。换模型 = 改 `model_registry.json` 一处。\
> 落地：能力矩阵在 `model_registry.json` 的 `video.adapters.<name>.capabilities`；审计见 `audits/audit_model_adapters.py`。

## 7 个能力位（capability_keys）

| 能力位 | 含义 | Seedance 2.0 语法（参考实现） |
|---|---|---|
| `dialogue` | 对白注入（口型同步） | `{语言:台词}` |
| `sfx` | 音效注入 | `<音效描述>` |
| `bgm` | 背景音乐注入 | `(配乐描述)` |
| `title_card` | 屏幕字卡/标题 | `【标题】` |
| `reference_image` | 参考图占位绑定 | `<<<image_n>>>` |
| `first_last_frame` | 首/尾帧承接 | `start_frame` / `end_frame` |
| `multi_shot_incut` | 一条 prompt 内多机位镜内分切 | 节拍语序 + 切镜方式串联 |

## 适配层必须实现

- 声明全部 7 个能力位（true/false，缺位 = 审计 FAIL）。
- 声明 `duration_window_s = [lo, hi]`（生成单元时长窗口）。
- `bgm=false` 的模型：BGM 走 audio_layer 后期混音（不进生成 prompt）。
- `multi_shot_incut=false` 的模型：镜头组拆成单镜逐次生成（成本上升，由 D11 成本层提示）。
- `title_card=false` 的模型：字卡后期烧录（生成 prompt 不写）。

## 路由与降级（registry）

- `video.default` = 缺省视频模型（**全套件唯一定义点**）。
- `fallback[]` = 同族降级链（`from→to`，`trigger`）；**禁跨族静默替代**（视频→视频，不可视频→图像）。
- 图像分级 `image.tier`：material→Seedream4.5 / draft→NanoBanana2 / text_render→GPT-Image-2；缺省 NanoBananaPro。
- 音色 `voice`：zh→豆包 / en→ElevenLabs；音乐 `music`：Suno-5（`ban_named_artist=true` 禁名人名）。

## 上游怎么用（铁律）

- 分镜/成员**不写模型名**；要落模型时调 `harness/registry.py`（`video_default()`/`image_default()`/`voice_for(lang)`）。
- `continuity-quality.md` 等知识文件凡提"默认模型"一律指向 registry，不硬编码。
- 一个能力位若目标模型不支持 → 上游据 capabilities 自动改走后期（见上"适配层必须实现"）。
