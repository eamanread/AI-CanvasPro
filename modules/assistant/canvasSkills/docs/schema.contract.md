# Canvas Skills Schema Contract

Schemas are the Agent's source of truth for node parameters. The validator accepts only supported, writable fields and returns a safe patch plus warnings.

## Field Shape

Each field includes:

- `key`
- `label`
- `type`
- `status`
- `nodeTypes`
- `aliases`
- `mapsTo`
- `agentWritable`
- `uiReusable`
- `redaction`
- optional `min`, `max`, `defaultValue`
- `description`

## Field States

- `supported`: Agent may write the field.
- `planned`: Agent may recognize the field but must not write it.
- `deprecated`: readable compatibility state; Agent should not generate new writes.
- `internal`: never writable by the Agent.

Secret-like field names are blocked even if an action tries to pass them under unknown keys.

## Model Validation

`model`, `modelName`, and `modelDisplayName` are aliases for `modelId`. A model write is accepted only when the configured model registry says the model is usable for that node type. The patch writes `modelId` and, when known, `provider`.

## Supported Fields

Image node `ai-image`:

- Supported: `prompt`, `modelId`, `provider`, `aspectRatio`, `imageSize`, `quality`, `batchSize`, `references`, `presetId`, `presetName`, `template`, `inputs`.
- Planned: `negativePrompt`, `seed`, `steps`, `guidanceScale`, `sampler`, `style`, `lora`, `controlNet`, `referenceWeights`, `background`, `safetyLevel`.

Text node `ai-text`:

- Supported: `prompt`, `modelId`, `provider`, `references`, `presetId`, `presetName`, `template`, `inputs`.
- Planned: `temperature`, `topP`, `maxTokens`, `systemPrompt`, `responseFormat`, `tools`, `memoryPolicy`.

Video node `ai-video`:

- Supported: `prompt`, `modelId`, `provider`, `duration`, `fps`, `resolution`, `references`, `presetId`, `presetName`, `template`, `inputs`.
- Planned: `cameraMotion`, `motionStrength`, `firstFrame`, `lastFrame`, `negativePrompt`, `seed`, `aspectRatio`, `style`, `audio`, `loop`, `transition`.

## Validation Tests

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\canvasSkills\schemas\schemaValidator.test.js modules\assistant\canvasSkills\schemas\schemaIntrospection.test.js modules\assistant\assistantCanvasParameterMapper.test.js
```

The tests cover supported writes, planned/unknown/secret rejection, node-type model compatibility, and schema drift checks.
