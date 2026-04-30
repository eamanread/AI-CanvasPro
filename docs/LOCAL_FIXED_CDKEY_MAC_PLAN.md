# 最简本地授权版方案

## 1. 目标

为团队小规模试用提供一版最简本地授权机制：

- 固定 CDKEY：`fcyh0012`
- 不走远端授权服务
- 激活后绑定本机 MAC
- 复制 `exe` 到另一台机器默认无效
- 继续复用现有订阅 UI、本地订阅接口、生成门禁

这版的定位是：

- 内部试用
- 小范围分发
- 控制随意复制

不是：

- 商业级强防破解方案
- 多用户、多套餐、多码本的正式授权系统

## 2. 使用边界

### 2.1 适用场景

- 团队内部使用
- 每个人在自己的电脑本地运行一份应用
- 先只发一个固定码给内部成员

### 2.2 不承诺的能力

- 不防逆向
- 不防人为伪造 MAC
- 不支持追踪谁泄露了固定码
- 不支持跨机器迁移授权
- 不支持一机多授权策略

## 3. 现有链路复用点

当前项目已有一套可复用的订阅链路，不需要重写前端。

### 3.1 前端已有能力

- 本地生成并持久化 `installId`
- 查询订阅状态
- 提交 CDKEY 激活
- 在生成被拦截时弹出订阅/激活提示

关键文件：

- `modules/subscriptionAccess.js`
- `api/subscriptionApi.js`
- `api/requester.js`

### 3.2 后端已有能力

- 本地订阅状态接口：`GET /api/v2/subscription/status`
- 本地 CDKEY 激活接口：`POST /api/v2/subscription/activate`
- 统一生成门禁：`SubscriptionGateService.check_generation_access(...)`

关键文件：

- `services/http_route_dispatcher.py`
- `services/subscription_gate_service.py`
- `server.py`

### 3.3 系统状态目录

项目已有系统级状态目录，适合放授权文件，而不是放在项目目录或 exe 同目录：

- Windows: `%LOCALAPPDATA%\\AI-CanvasPro\\`
- macOS: `~/Library/Application Support/AI-CanvasPro/`
- Linux: `~/.local/state/AI-CanvasPro/`

关键代码：

- `server.py` 中 `SYSTEM_STATE_DIR`

## 4. 核心设计

## 4.1 基本规则

- 只有一个固定 CDKEY：`fcyh0012`
- 首次激活成功后，在本机系统状态目录写入授权文件
- 授权文件记录当前机器的 MAC 指纹
- 后续状态查询和生成门禁都校验当前机器 MAC 是否与授权文件一致

## 4.2 为什么“复制 exe 默认无效”

因为授权状态不跟着 exe 走。

实际授权文件放在系统状态目录：

- 新机器只复制 exe，没有授权文件 -> 未激活
- 即使把授权文件一起复制过去，当前机器 MAC 不一致 -> 校验失败

## 4.3 授权锚点

最简版中，真正的授权锚点是：

- `machineMacFingerprint`

不是：

- 项目目录
- exe 同目录
- 仅靠 `installId`

`installId` 仍然保留，用于兼容现有前端请求与状态链路，但不作为最终授权唯一依据。

## 5. 数据文件设计

建议新增本地授权文件：

- `SYSTEM_STATE_DIR/license.json`

示例：

```json
{
  "activated": true,
  "status": "active",
  "activationSource": "cdkey",
  "cdkeyHash": "sha256:3c9f...",
  "boundMac": "AA:BB:CC:DD:EE:FF",
  "activatedAt": 1770000000,
  "lastInstallId": "aic-xxxx",
  "version": 1
}
```

说明：

- 不保存明文 `fcyh0012`
- 只保存 hash
- `lastInstallId` 仅用于调试和兼容，不作为授权唯一判定条件

## 6. MAC 绑定策略

## 6.1 最简实现

第一版直接使用 Python 标准库能力读取 MAC：

- 优先使用 `uuid.getnode()`

然后规范化为：

- `AA:BB:CC:DD:EE:FF`

## 6.2 风险说明

- 部分机器有多个网卡
- 虚拟网卡可能干扰结果
- 更换网卡后会导致授权失效

对当前内部试用版，这个风险可接受。

## 6.3 可选增强

如果后续需要更稳一点，但仍保持本地化，可升级为：

- `MAC + hostname` 的组合指纹 hash

但本次最简版先不做。

## 7. 接口行为设计

## 7.1 `POST /api/v2/subscription/activate`

输入：

```json
{
  "installId": "aic-xxxx",
  "cdkey": "fcyh0012"
}
```

处理逻辑：

1. 读取当前机器 MAC
2. 校验 `cdkey == "fcyh0012"`
3. 若不匹配，返回激活失败
4. 若匹配，写入 `license.json`
5. 返回激活成功 payload

成功返回建议保持兼容现有订阅结构：

```json
{
  "success": true,
  "status": "active",
  "activationSource": "cdkey",
  "generationScope": "all",
  "contactText": "联系管理员获取授权码",
  "contactUrl": ""
}
```

失败返回：

```json
{
  "success": false,
  "status": "none",
  "errorCode": "INVALID_CDKEY",
  "message": "授权码错误",
  "contactText": "联系管理员获取授权码",
  "contactUrl": ""
}
```

## 7.2 `GET /api/v2/subscription/status`

处理逻辑：

1. 读取 `license.json`
2. 如果文件不存在，返回未激活
3. 如果文件存在但 `boundMac != 当前机器 MAC`，返回未激活
4. 如果匹配，返回 `active`

建议返回：

```json
{
  "success": true,
  "status": "active",
  "activationSource": "cdkey",
  "generationScope": "all",
  "contactText": "联系管理员获取授权码",
  "contactUrl": ""
}
```

未激活时：

```json
{
  "success": false,
  "status": "none",
  "errorCode": "SUBSCRIPTION_REQUIRED",
  "message": "请先激活授权码",
  "contactText": "联系管理员获取授权码",
  "contactUrl": ""
}
```

## 8. 代码改造建议

## 8.1 新增本地授权服务

建议新增：

- `services/local_subscription_client.py`

职责：

- 读取当前机器 MAC
- 校验固定 CDKEY
- 读写 `license.json`
- 输出与现有订阅链路兼容的 payload
- 提供与 `SubscriptionRemoteClient` 兼容的最小方法集

建议兼容这些方法：

- `normalize_install_id(...)`
- `extract_install_id_from_request(...)`
- `fetch_subscription_status(...)`
- `activate_cdkey(...)`
- `evaluate_install_active(...)`
- `extract_activation_source(...)`
- `extract_generation_scope(...)`
- `extract_entitled_node_types(...)`
- `extract_entitled_providers(...)`

这样可以最大化复用：

- `HttpRouteDispatcher`
- `SubscriptionGateService`

## 8.2 `server.py`

建议在 `server.py` 中把当前订阅客户端实例切换为本地版：

- 当前：`SubscriptionRemoteClient`
- 目标：`LocalSubscriptionClient`

本次最简版不需要远端基址，也不需要覆盖环境变量。

固定 CDKEY 可先直接写在服务实现中：

```python
FIXED_LOCAL_CDKEY = "fcyh0012"
```

## 8.3 `services/http_route_dispatcher.py`

理论上无需改动接口协议，只需要保证底层 client 来源已切到本地实现。

保留现有接口：

- `GET /api/v2/subscription/status`
- `POST /api/v2/subscription/activate`

## 8.4 `services/subscription_gate_service.py`

尽量不改业务逻辑。

因为只要本地 client 的 `evaluate_install_active()` 返回兼容结构，现有生成门禁就能直接复用。

## 9. 最小实现策略

为了让 diff 最小、风险最低，推荐采用：

### 方案 A：替换订阅客户端实例

- 新增 `LocalSubscriptionClient`
- `SUBSCRIPTION_CLIENT` 改为本地实现
- `SubscriptionGateService` 和 `HttpRouteDispatcher` 不改接口

这是本次最推荐的实现方式。

### 不推荐方案

- 把 MAC 校验逻辑散落写进多个路由
- 把授权状态写在项目目录
- 把授权状态写在 exe 同目录
- 只在前端做授权判断

## 10. 验收标准

至少验证以下场景：

1. 首次启动，未激活
   - `GET /api/v2/subscription/status` 返回 `none`
   - 生成被门禁拦截

2. 输入错误 CDKEY
   - `POST /api/v2/subscription/activate` 返回失败
   - 不生成 `license.json`

3. 输入正确 CDKEY `fcyh0012`
   - 激活成功
   - 生成 `license.json`
   - 再查状态返回 `active`

4. 同机器重启应用
   - 仍然保持激活

5. 复制 exe 到另一台机器
   - 因无授权文件或 MAC 不一致，状态仍为未激活

6. 强制复制 `license.json` 到另一台机器
   - 因 `boundMac` 校验失败，状态为未激活

## 11. 测试建议

建议补两类测试：

### 11.1 Python 单测

- `local_subscription_client_test.py`

覆盖：

- 正确码激活
- 错误码拒绝
- MAC 匹配返回 active
- MAC 不匹配返回 none

### 11.2 路由层测试

- 扩展 `http_route_dispatcher_test.py`

覆盖：

- 本地 status 返回
- 本地 activate 返回
- 激活后生成门禁是否放行

## 12. 风险与后续升级方向

### 当前风险

- 固定码泄露后无法追踪来源
- MAC 可被高级用户伪造
- 更换网卡会导致授权失效

### 后续可升级方向

- 升级为多 CDKEY 本地码本
- 从固定码升级为 hash 码表
- 从 MAC 升级为机器指纹
- 增加开发者专用的本地授权管理页

## 13. 本次建议结论

如果你的目标是：

- 先给团队内少量成员使用
- 不想先上远端授权
- 先控制“随便复制 exe 到别的机器就能用”

那么这版“固定码 `fcyh0012` + 本机 MAC 绑定 + 系统状态目录授权文件”的方案是合适的。

它不是终局方案，但作为当前阶段的最简闭环，足够实用。
