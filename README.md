# 学习通（超星）刷课助手

面向学习通网页版课程的 Tampermonkey 用户脚本，提供视频/音频、文档与图片任务处理、章节测验辅助填写、字体识别和章节遍历。

**当前版本：v1.0.20 · 更新日期：2026-11-17**

## 项目来源

> **贡献来源：** 本次改进由 [Hxc-Chen/xuexitong-autostudy](https://github.com/Hxc-Chen/xuexitong-autostudy) 整理，基于 [ZhangYHhhhhhh 的 fork](https://github.com/ZhangYHhhhhhh/xuexitong-autostudy)，并参考 [cq-eng 的 fork](https://github.com/cq-eng/xuexitong-autostudy)。原项目与贡献目标为 [DaRin1403/xuexitong-autostudy](https://github.com/DaRin1403/xuexitong-autostudy)。保留原作者与参考项目署名；PR 准备不表示已经合并。本贡献分支版本为 v1.0.20。

- 原项目仓库：[DaRin1403/xuexitong-autostudy](https://github.com/DaRin1403/xuexitong-autostudy)
- 原始项目 / PR 目标：[DaRin1403/xuexitong-autostudy](https://github.com/DaRin1403/xuexitong-autostudy)
- 问题反馈：[GitHub Issues](https://github.com/DaRin1403/xuexitong-autostudy/issues)
- 版本变化：[CHANGELOG.md](CHANGELOG.md)

| 来源 | 本项目中的角色 |
| --- | --- |
| DaRin1403/xuexitong-autostudy | 原项目，提供项目基础与原始实现 |
| ZhangYHhhhhhh/xuexitong-autostudy | 本项目继续维护所基于的 fork 来源 |
| cq-eng/xuexitong-autostudy | 本地参考 fork，提供字形指纹、答案解析与控件适配等参考 |
| Hxc-Chen/xuexitong-autostudy | 当前维护仓库，整合修复、测试和发布文档 |

本分支的版本与更新通道独立；v1.0.20 不表示原项目或其他 fork 已发布或合并这些改动。向原项目贡献见 [上游贡献说明](docs/上游PR说明.md)。

## v1.0.20 更新

- **答案解析更严格**：单选只接受明确的单个字母；多选支持分隔、去重和选项范围验证；判断题拒绝含糊或矛盾结果。避免把英文解释误读为选项，或将“不确定”默认判成错误。
- **补充题型与选项适配**：缺少字段时参考本题标题和一致的控件结构；支持 ARIA、Element 风格等组件，按唯一精确文本定位并回读状态。
- **本地字形识别优先**：内置 20,902 条指纹，未知字再交给视觉模型；全部识别完成后才修改文本节点，保留输入框与事件。可在设置中关闭。
- **增强诊断与构建**：导出本地/视觉识字计数及本题编辑器摘要；字体依赖按 SHA-256 固定，构建不联网下载。
- **完善来源与致谢**：明确 ZhangYHhhhhhh 的 fork 来源、cq-eng 的参考版本及 DaRin1403 原项目地址。

实现细节与验证边界见 [fork 优化实施与验证](docs/fork优化实施与验证.md)。

## 功能与边界

| 模块 | 当前行为 |
| --- | --- |
| 视频 / 音频 | 自动播放、静音及任务状态检查；视频默认 2 倍速，拖进度默认关闭 |
| 文档 / 图片 | 自动滚动或停留，并检查页面任务状态 |
| 章节遍历 | 遍历同小节标签页、尝试进入下一节，汇总待检查任务 |
| 普通题目 | 单选、多选、判断、填空及部分文本题的提取、填写与回读 |
| 阅读理解 | 按子题容器、qid/qtype、控件分组或连续标题拆分，关联共享材料 |
| 连线题 | 两组数据和原生 select 结构，按第一组顺序映射第二组字母 |
| 字体识别 | 检查实际字体及 Unicode 范围，本地字形指纹优先、视觉识字补充 |
| 模型请求 | Chat Completions 兼容接口，答案与视觉模型可分别配置 |
| 异常处理 | 截断/缺失最终答案/格式不完整时最多恢复一次；未完成时尝试暂存 |
| 诊断导出 | 题文、选项、结果、结构、字体与模型请求摘要 |

不支持考试页或通用听力转写。连线题依赖可识别的原文、两组数据和原生下拉框；自绘下拉、图片材料、多字体、跨域 iframe 或页面改版可能需要另行适配。材料缺失、结构不明确、识字或回读失败时，不猜测填写。

**作答覆盖率不是正确率。** 暂存调用成功不等于服务器保存成功，触发提交不等于平台任务点完成。请遵守课程与平台规则，并核对页面结果；脚本不保证答案正确率、任务完成或规避检测。

## 安装与配置

### 1. 安装脚本

在浏览器官方扩展商店安装 Tampermonkey，按扩展提示允许用户脚本运行。当前主要面向桌面 Chromium 浏览器，其他浏览器需自行验证。

以下保留原项目的安装/更新通道。PR 合并前，该地址仍提供上游已有代码，不代表已包含本次修复：

**[安装 / 更新 学习通刷课助手.user.js](https://cdn.jsdelivr.net/gh/DaRin1403/xuexitong-autostudy@main/%E5%AD%A6%E4%B9%A0%E9%80%9A%E5%88%B7%E8%AF%BE%E5%8A%A9%E6%89%8B.user.js)**

也可下载仓库中的用户脚本，在 Tampermonkey 中新建脚本、粘贴完整内容并保存。运行时只需单个 .user.js 文件，无需安装 Node.js。

更新由 Tampermonkey 根据脚本元数据检查；脚本不轮询 version.json，也不强制刷新页面。**更新后请刷新课程页面，并确认面板日志显示 v1.0.20。** 本地文件版本变化不代表远端安装地址已同步。

### 2. 配置模型

打开课程章节页 → 面板 ⚙ → 开启 AI 答题 → 填写自己的 API 地址、模型和 Key → 保存。初次使用可关闭自动提交，核对提取与填写结果。

| 接口输入 | 处理方式 |
| --- | --- |
| https://api.example.com | 补为 /v1/chat/completions |
| https://api.example.com/v1 | 补为 /v1/chat/completions |
| 完整 /chat/completions 地址 | 保留，避免重复拼接 |
| 其他基础路径 | 在该路径后补 /chat/completions，请核对服务商文档 |

答案模型不一定支持图片输入。需要视觉识字时，可单独配置支持图片的模型、地址与 Key；每项留空分别沿用答案配置。模型可用性与费用以所选服务商为准。

### 3. 常用设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| AI 答题 | 关闭 | 开启并配置 Key 后才请求答案 |
| 答题模型 / 接口 | deepseek-chat / DeepSeek 兼容地址 | 可更换为自己的 Chat Completions 服务 |
| 思考模式 | 自动适配 | 默认仅对 DeepSeek 官方接口传关闭思考参数，第三方保留服务端默认 |
| 输出预算 / 超时 | 8192 tokens / 60 秒 | 可调 1024–32768 tokens、30–180 秒 |
| 本地字形识别优先 | 开启 | 未命中字回退视觉模型；关闭并刷新可仅用视觉识字 |
| 视觉模型 / 地址 / Key | 留空 | 分别沿用答案配置，也可独立填写 |
| 自动提交 / 自动切章 | 开启 / 开启 | 不完整或关闭提交时尝试暂存，继续后续任务并记录待检查项 |
| 视频倍速 / 拖进度 | 2 / 关闭 | 倍速上限 2，实际行为取决于页面限制 |
| 答题与提交等待 | 0 | 可按需要调整 |
| 故意答错率 / 每日时长上限 | 0 / 不限 | 历史可选设置，不构成规避检测保证 |
| 免费题库 | 关闭 | 默认使用自己配置的模型服务 |
| 状态上报 | 空，关闭 | 启用后向填写的地址发送页面状态和近期日志 |

## 作答与恢复流程

1. 检查字体、材料、题型和选项；只对需要的字进行识别，解密不完整时保留原页面。
2. 拆分阅读子题、解析连线结构，生成可验证的题目任务。
3. 只接受完整最终 content；reasoning_content 不作为答案，finish_reason=length 一律拒绝。
4. 无最终答案、截断或格式不完整时最多恢复一次，预算最多翻倍到 32768 tokens。
5. 填写后回读控件；漏题、非法字母或未写入成功时不提交。
6. 自动提交关闭或任务未完成时尝试暂存，继续后续任务，结束后汇总待检查章节。

认证失败、网络/超时、明确拒绝/过滤及工具调用不会触发内容恢复。同一道题失败计一次；连续三道失败进入十分钟冷却。暂停或修改答案模型配置后，旧请求响应会被丢弃。

## 排错

- **识字不符**：关闭“本地字形识别优先”并刷新，检查视觉模型配置。已修改的 DOM 不会因关开关自动还原。
- **只有思考，没有答案**：查看 finish_reason、最终内容长度和输出预算；不要将思考片段直接填入答案框。
- **返回 HTML / 非 JSON**：检查 API 路径是否为聊天接口，而非网站首页。
- **题目被跳过**：导出题目数据，查看 blockedReason、structure、fontDiagnostics 和 aiDiagnostics。
- **填写了但任务未完成**：分别核对暂存、提交和平台任务点状态。

反馈前移除个人信息、密钥、Cookie 和带令牌的 URL；不要公开完整个人题库或运行配置。

## 数据与隐私

- Key 保存在用户脚本配置或浏览器本地存储中，这些存储不是加密保险箱。
- 答案请求会将题干、选项和认证信息发送到配置的服务。视觉识字会发送字形图片；本地指纹匹配本身不发送网络请求。字体资源读取和答案请求仍可能联网。
- 导出包含题文、选项和答案；AI 诊断只保存摘要，不保存密钥、思考正文或原始响应。
- 状态上报默认关闭，启用后数据仅按配置发往指定地址。
- 公开包采用明确白名单，排除密钥、真实题目、日志、缓存及本地参考项目副本。

## 开发、验证与打包

开发测试使用 Node.js 20+ 和 npm；打包使用 Python 3.10+。

    npm ci --ignore-scripts
    npm test
    npm run check
    npm run pack:release

现有 **120 项离线回归测试**，覆盖字体、模型恢复、题型与控件、阅读/连线题、暂存及待检查汇总。测试使用合成题目、合成字体和模拟模型，不访问课程页面、不提交测验、不消耗 API 额度；通过不代表真实字体覆盖率或所有页面均已验证。

字体资源固定在 vendor，按 SHA-256 校验；需要重建时执行 npm run build:fonts。npm run check 同时检查脚本语法与内置字体块一致性。来源和已有许可声明见 [vendor/NOTICE.md](vendor/NOTICE.md)。

打包输出位于 dist，包含源码 ZIP、清单和 SHA-256。解压后应将包内项目目录的内容放入仓库根目录；上传 ZIP 本身不会更新脚本安装地址。详见 [发布与验证](docs/发布与验证.md)。

## 文档

- [自动答题模块](docs/模块-自动答题.md)：题目提取、识字、模型协议与填写校验。
- [练题自测](docs/模块-练题自测.md)：人工检查与答题记录自检。
- [API Key 配置参考](docs/get-api-key.md)：平台配置背景资料，具体模型和资费需核对服务商。
- [v1.0.20 优化实施与验证](docs/fork优化实施与验证.md)：移植范围、测试边界与回退。
- [上游贡献说明](docs/上游PR说明.md) / [PR 正文](docs/PR正文.md)：来源、贡献目标与提交准备。

## 致谢

感谢以下项目、作者和贡献者提供的基础实现、改进思路与反馈：

- [DaRin1403/xuexitong-autostudy](https://github.com/DaRin1403/xuexitong-autostudy)：原项目来源，提供用户脚本框架和课程任务处理基础。
- [ZhangYHhhhhhh/xuexitong-autostudy](https://github.com/ZhangYHhhhhhh/xuexitong-autostudy)：本项目继续维护所基于的 fork 版本来源。
- [cq-eng/xuexitong-autostudy](https://github.com/cq-eng/xuexitong-autostudy)：本地 xuexitong-autostudy-folk 参考版本来源；本轮选择性吸收其本地字形指纹、严格答案解析、题型与控件适配、诊断和依赖构建思路。
- [luoyu-0/chaoxingAuto](https://github.com/luoyu-0/chaoxingAuto)：题目文本提取、qid/qtype 定位、回读校验与模型请求处理参考。
- [ocsjs（OCS 网课助手）](https://greasyfork.org/cs/scripts/457151)、字形表作者 wyn665817、Typr 兼容组件及 blueimp-md5 作者和贡献者：字体识别方案与资源参考，详见 vendor 来源说明。
- [pang-qin/chaoxing-toolkit](https://github.com/pang-qin/chaoxing-toolkit)。
- [sheshuyu/fuckCourse](https://github.com/sheshuyu/fuckCourse) / [Samueli924/chaoxing](https://github.com/Samueli924/chaoxing)。

## 许可

项目保留 [MIT License](LICENSE) 与原作者版权声明。第三方组件来源及已有许可声明见 [vendor/NOTICE.md](vendor/NOTICE.md)。开源许可不代表课程平台对自动化使用的授权。
