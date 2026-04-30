export const ErrorType = {
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  DNS_ERROR: "DNS_ERROR",
  AUTH_ERROR: "AUTH_ERROR",
  FORBIDDEN: "FORBIDDEN",
  RATE_LIMIT: "RATE_LIMIT",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  INVALID_PARAMS: "INVALID_PARAMS",
  CONTENT_FILTERED: "CONTENT_FILTERED",
  MODEL_UNAVAILABLE: "MODEL_UNAVAILABLE",
  SERVER_ERROR: "SERVER_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  TASK_FAILED: "TASK_FAILED",
  TASK_TIMEOUT: "TASK_TIMEOUT",
  SUBSCRIPTION_REQUIRED: "SUBSCRIPTION_REQUIRED",
  UNKNOWN: "UNKNOWN",
};

const ERROR_MESSAGES = {
  [ErrorType.NETWORK_ERROR]: "网络连接失败，请检查网络或代理设置",
  [ErrorType.TIMEOUT]: "请求超时，请稍后重试",
  [ErrorType.DNS_ERROR]: "无法解析服务器地址，请检查网络配置",
  [ErrorType.AUTH_ERROR]: "API Key 无效或已过期，请检查配置",
  [ErrorType.FORBIDDEN]: "权限不足，无法访问该资源",
  [ErrorType.RATE_LIMIT]: "请求过于频繁，请稍后再试",
  [ErrorType.INSUFFICIENT_BALANCE]: "账户余额不足，请充值",
  [ErrorType.INVALID_PARAMS]: "请求参数错误，请检查输入",
  [ErrorType.CONTENT_FILTERED]: "生成内容被安全过滤，请修改提示词",
  [ErrorType.MODEL_UNAVAILABLE]: "当前模型不可用，请更换模型或稍后再试",
  [ErrorType.SERVER_ERROR]: "服务器内部错误，请稍后再试",
  [ErrorType.SERVICE_UNAVAILABLE]: "服务暂时不可用，请稍后再试",
  [ErrorType.TASK_FAILED]: "生成任务执行失败",
  [ErrorType.TASK_TIMEOUT]: "任务处理超时，请稍后查询结果",
  [ErrorType.SUBSCRIPTION_REQUIRED]: "请先完成授权激活后再继续生成",
  [ErrorType.UNKNOWN]: "发生未知错误，请稍后重试",
};

const PROVIDER_LABELS = {
  grsai: "GRSAI",
  ppio: "PPIO",
  apimart: "APIMart",
  runninghub: "RunningHUB",
  runninghubwf: "RunningHUB",
  gemini: "Gemini",
  openai: "OpenAI",
};

export class ApiError extends Error {
  constructor(options = {}) {
    const {
      type,
      message,
      provider,
      code,
      retryable,
      raw,
      status,
      requiredModelId,
      reasonCode,
      contactText,
      contactUrl,
      subscriptionStatus,
      activationSource,
      generationScope,
      nodeType,
    } = options;
    super(message || ERROR_MESSAGES[type] || ERROR_MESSAGES[ErrorType.UNKNOWN]);
    this.name = "ApiError";
    this.type = type || ErrorType.UNKNOWN;
    this.provider = provider || "unknown";
    this.code = code;
    this.retryable = retryable ?? this._isRetryable(this.type);
    this.raw = raw;
    this.status = status;
    this.requiredModelId = requiredModelId || "";
    this.reasonCode = reasonCode || "";
    this.contactText = contactText || "";
    this.contactUrl = contactUrl || "";
    this.subscriptionStatus = subscriptionStatus || "";
    this.activationSource = activationSource || "";
    this.generationScope = generationScope || "";
    this.nodeType = nodeType || "";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  _isRetryable(type) {
    return [
      ErrorType.TIMEOUT,
      ErrorType.RATE_LIMIT,
      ErrorType.SERVER_ERROR,
      ErrorType.SERVICE_UNAVAILABLE,
      ErrorType.NETWORK_ERROR,
    ].includes(type);
  }

  getUserMessage(includeProvider = true) {
    let userMessage = this.message;
    if (includeProvider && this.provider && this.provider !== "unknown") {
      const label = PROVIDER_LABELS[this.provider] || this.provider;
      userMessage = `[${label}] ${userMessage}`;
    }
    if (this.code) {
      userMessage += ` (错误码: ${this.code})`;
    }
    return userMessage;
  }

  toLogString() {
    return `[${this.provider}] ${this.type}(${this.code || "N/A"}): ${this.message}`;
  }

  static networkError(provider, error) {
    return new ApiError({
      type: ErrorType.NETWORK_ERROR,
      provider,
      message: `网络请求失败: ${error?.message || "未知网络错误"}`,
      raw: error,
      retryable: true,
    });
  }

  static timeout(provider, timeoutMs) {
    const timeoutLabel = timeoutMs ? `${Math.round(timeoutMs / 1000)}秒` : "未知";
    return new ApiError({
      type: ErrorType.TIMEOUT,
      provider,
      message: `请求超时（${timeoutLabel}），请检查网络连接或稍后重试`,
      retryable: true,
    });
  }

  static insufficientBalance(provider, code) {
    return new ApiError({
      type: ErrorType.INSUFFICIENT_BALANCE,
      provider,
      code,
      message: "账户余额不足，请充值或更换 API Key",
      retryable: false,
    });
  }

  static authError(provider, code, message) {
    return new ApiError({
      type: ErrorType.AUTH_ERROR,
      provider,
      code,
      message: message || "API Key 无效或已过期",
      retryable: false,
    });
  }

  static rateLimit(provider, code) {
    return new ApiError({
      type: ErrorType.RATE_LIMIT,
      provider,
      code,
      message: "请求过于频繁，请稍后再试",
      retryable: true,
    });
  }

  static contentFiltered(provider, message) {
    return new ApiError({
      type: ErrorType.CONTENT_FILTERED,
      provider,
      message: message || "生成内容被安全过滤，请修改提示词后重试",
      retryable: false,
    });
  }

  static taskFailed(provider, message) {
    return new ApiError({
      type: ErrorType.TASK_FAILED,
      provider,
      message: `生成任务失败: ${message || "未知原因"}`,
      retryable: false,
    });
  }

  static taskTimeout(provider) {
    return new ApiError({
      type: ErrorType.TASK_TIMEOUT,
      provider,
      message: "任务处理超时，请稍后查询结果",
      retryable: false,
    });
  }

  // This error represents unified generation access denial, not a legacy VIP-model-only failure.
  static subscriptionRequired(provider, payload = {}, status = 200) {
    const data = payload && typeof payload === "object" ? payload : {};
    const resolvedProvider = String(data.provider || "").trim() || String(provider || "").trim();
    return new ApiError({
      type: ErrorType.SUBSCRIPTION_REQUIRED,
      provider: resolvedProvider,
      code: String(data.code || data.errorCode || "SUBSCRIPTION_REQUIRED"),
      message: String(data.message || ERROR_MESSAGES[ErrorType.SUBSCRIPTION_REQUIRED]),
      status,
      raw: payload,
      retryable: false,
      requiredModelId: String(data.requiredModelId || ""),
      reasonCode: String(data.reasonCode || ""),
      contactText: String(data.contactText || data.contact_text || ""),
      contactUrl: String(data.contactUrl || data.contact_url || ""),
      subscriptionStatus: String(data.subscriptionStatus || data.status || ""),
      activationSource: String(data.activationSource || data.activation_source || ""),
      generationScope: String(data.generationScope || data.generation_scope || ""),
      nodeType: String(data.nodeType || data.node_type || ""),
    });
  }

  static fromHttpStatus(status, provider, message) {
    let type = ErrorType.UNKNOWN;
    switch (status) {
      case 400:
        type = ErrorType.INVALID_PARAMS;
        break;
      case 401:
        type = ErrorType.AUTH_ERROR;
        break;
      case 403:
        type = ErrorType.FORBIDDEN;
        break;
      case 429:
        type = ErrorType.RATE_LIMIT;
        break;
      case 500:
        type = ErrorType.SERVER_ERROR;
        break;
      case 503:
        type = ErrorType.SERVICE_UNAVAILABLE;
        break;
      default:
        type = ErrorType.UNKNOWN;
        break;
    }
    return new ApiError({
      type,
      provider,
      status,
      message: message || ERROR_MESSAGES[type],
      retryable: status >= 500 || status === 429,
    });
  }
}

export default ApiError;
