# PR 标题

完善字体识别、题目提取与答案校验，整理 v1.0.20 及项目来源

# PR 正文

## 问题与结果

本次贡献来自 Hxc-Chen/xuexitong-autostudy。项目基于 ZhangYHhhhhhh/xuexitong-autostudy 的 fork 版本继续维护，原项目为 DaRin1403/xuexitong-autostudy；本地参考 fork 来自 cq-eng/xuexitong-autostudy。README 已分别记录这些角色并加入致谢。

既有流程存在字体误判、题目材料或子题漏提取、连线题无法可靠填写，以及模型解释被误读为选项的问题。本次通过相关字体筛选、本地字形指纹与视觉识别组合、结构化题目提取和填写回读，减少错误填写；任务不完整时暂存并记录待检查项。

## 主要修改

- 保留 CSSOM、外链、相对字体 URL、Unicode 范围和动态字体适配；内置 20,902 条字形指纹，未知字回退视觉模型，识别完整后才修改原文本节点。
- 提供本地识字开关及命中计数，字体依赖离线构建并按 SHA-256 校验。
- 普通选择/判断答案采用整段校验，支持多选分隔与去重，拒绝解释、不确定文本和超出实际选项范围的字母。
- 缺少题型字段时采用受限推断；补充 ARIA/Element 等组件，按唯一精确文本定位并回读状态。
- 按真实结构拆分阅读子题，解析连线题材料和原生下拉框，填写前后检查数量、方向与结果。
- 区分暂存、提交与任务完成；保留模型截断拒绝、有限恢复和遍历结束后的待检查汇总。
- 同步版本为 1.0.20，重写 README、来源致谢、发布和贡献说明，保留原作者及第三方声明。

## 来源与致谢

- 原项目：[DaRin1403/xuexitong-autostudy](https://github.com/DaRin1403/xuexitong-autostudy)。
- 基础 fork：[ZhangYHhhhhhh/xuexitong-autostudy](https://github.com/ZhangYHhhhhhh/xuexitong-autostudy)。
- 参考 fork：[cq-eng/xuexitong-autostudy](https://github.com/cq-eng/xuexitong-autostudy)：字形指纹、严格解析、题型/控件适配、诊断与构建参考。
- [luoyu-0/chaoxingAuto](https://github.com/luoyu-0/chaoxingAuto)：文本提取、qid/qtype 和回读校验参考。
- 字体组件及其他既有贡献者详见 README 与 vendor/NOTICE.md，不把第三方资源归为本项目原创。

## 验证

- npm test：120 项离线回归测试。
- npm run check：用户脚本语法及内置字体依赖一致性检查。
- 发布打包：版本、文档链接、文件清单、常见凭据模式和压缩包字节校验。
- 测试使用合成题目、合成字体和模拟响应，不访问课程或真实模型服务。

## 边界与版本

本分支为 v1.0.20。该版本号不表示原项目已合并或发布；上游最终版本安排由维护者决定。上游 PR 包保留 DaRin1403 的更新通道，并保留基础 fork 与参考 fork 的署名。

未进行真实课程页面全覆盖验证，也未测得真实字体集的指纹命中率。连线题主要针对原生 select 与可关联材料；听力转写、自绘下拉和其他页面变体仍可能不支持。平台是否保存、提交或完成任务需以实际页面为准。
