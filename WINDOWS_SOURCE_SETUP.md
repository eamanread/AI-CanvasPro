# Windows 源码包说明

这个源码包适合在另一台 Windows 电脑上继续运行和二次开发。

## 运行前准备

1. 把压缩包解压到不带中文和空格的路径，例如 `D:\AI-CanvasPro-source`。
2. 安装 Python 3.12 或更高版本，并确保 `python` 或 `py -3.12` 可用。
3. 安装 `ffmpeg` 并加入系统 `PATH`。
4. 如果要跑前端测试，再额外安装 Node.js 20+。

## 最快启动方式

直接双击项目根目录的 `start_windows_dev.bat`。

这个脚本会自动：

- 创建 `venv`
- 安装 `requirements.txt` 里的 Python 依赖
- 启动 `server.py`
- 自动打开 `http://127.0.0.1:8777/`

首次启动会慢一些，因为需要创建虚拟环境和安装依赖。

## 手动启动方式

```bat
python -m venv venv
venv\Scripts\activate.bat
pip install -r requirements.txt
python server.py
```

然后打开：

```text
http://127.0.0.1:8777/
```

## 二次开发

Python 侧：

```bat
venv\Scripts\activate.bat
python -m pytest
```

Node 侧测试工具链：

```bat
npm install
npm test
```

## 已知事项

- `node_modules/`、`venv/`、`venv-clean/`、`output/`、`release/` 都不应从当前 macOS 机器直接拷到 Windows 继续用，应该在 Windows 本机重新生成。
- 本次源码包保留了完整业务源码和文档，但排除了本机缓存、虚拟环境、构建产物和临时日志。
- 当前仓库有一个前端测试文件 `components/AIGenAudioNode.test.js` 存在测试进程清理问题；已验证业务断言通过，但它可能影响 `npm test` 的稳定退出。这不影响 `server.py` 启动和日常源码运行。
