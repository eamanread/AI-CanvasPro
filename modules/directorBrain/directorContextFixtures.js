export const rainHouseDirectorContext = {
  schemaVersion: "director-context/v1",
  contextId: "ctx_rain_house_001",
  createdAt: "2026-06-06T10:00:00Z",
  mode: "storyboard_plan",
  project: {
    id: "qmai_project_rain_house",
    name: "雨夜旧宅",
    genre: "悬疑短片",
    visualStyle: "冷绿色调、低照度、胶片颗粒",
    aspectRatio: "16:9",
  },
  styleBible: {
    tone: "克制、压抑、现实主义",
    cameraLanguage: "固定机位、缓慢推镜、少用夸张广角",
    lighting: "实景光、雨夜背光、低对比",
    forbidden: ["广告棚拍感", "过度磨皮", "夸张表情", "现代智能家居"],
  },
  characters: [
    {
      id: "char_linche",
      name: "林澈",
      visualDNA: "28岁，黑色短发，左眉浅疤，眼神克制",
      costumeState: "米色风衣，湿发，深色内搭",
      performance: "少笑，短句，压抑情绪",
      forbiddenDrift: ["长卷发", "红色外套", "夸张惊恐表情"],
      continuityAnchors: ["黑色短发", "左眉浅疤", "米色风衣"],
    },
  ],
  locations: [
    {
      id: "loc_old_house",
      name: "1990年代南方老宅",
      visualRules: "旧木门、潮湿墙面、昏黄壁灯",
      forbidden: ["现代家具", "智能门锁"],
    },
  ],
  props: [
    {
      id: "prop_childhood_photo",
      name: "童年照片",
      description: "边缘发黄，背面写着：别相信父亲",
      ageAndWear: "发黄、潮湿、手写字迹",
      storyFunction: "触发女主怀疑父亲的线索",
      continuity: "照片必须保持旧、潮湿、手写字迹",
    },
  ],
  shots: [],
  retrieval: {
    query: "女主雨夜回旧宅",
    strategy: "hybrid",
    sources: [
      {
        id: "src_char_linche",
        title: "林澈人物设定",
        type: "character",
        snippet: "黑色短发，左眉浅疤，米色风衣，克制表演",
        citationDisplay: "QMAI: 林澈人物设定",
        confidence: 0.91,
      },
    ],
  },
  constraints: {
    positive: ["cinematic still frame", "rain night", "cold green-blue tone"],
    negative: ["no red coat", "no modern furniture", "no exaggerated facial expression"],
    mustKeep: ["米色风衣", "左眉浅疤", "旧木门", "童年照片发黄"],
    mustAvoid: ["红色外套", "现代公寓", "智能门锁", "广告棚拍感"],
  },
  warnings: [],
  sourcePolicy: {
    readOnly: true,
    redactedLocalPaths: true,
    writeBackAllowed: false,
    videoGenerationRequiresConfirmation: true,
  },
};
