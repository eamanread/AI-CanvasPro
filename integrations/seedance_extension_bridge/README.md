# 海外版 Seedance 扩展桥

这个目录是海外版 Dreamina/Seedance 的独立接入层。

- 国内版即梦继续使用 `services/dreamina_cli_service.py` 和 `/api/v2/dreamina/*`。
- 海外版只通过 `/api/v2/seedance-web/*` 进入这里。
- 浏览器登录态保存在 `user_data/seedance_web/profile/`，不依赖用户默认 Chrome profile。
- 内置 Chrome 扩展放在 `extension/`，后续替换扩展或改成纯 Playwright 时，只改这个目录内的实现。

当前第一阶段只提供登录入口、状态查询和退出状态复位。任务队列和页面自动化在后续阶段继续补齐。
