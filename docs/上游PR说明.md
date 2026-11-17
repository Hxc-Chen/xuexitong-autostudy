# 向原项目贡献 v1.0.20

## 来源与贡献目标

当前维护仓库为 [Hxc-Chen/xuexitong-autostudy](https://github.com/Hxc-Chen/xuexitong-autostudy)。本项目在 [ZhangYHhhhhhh/xuexitong-autostudy](https://github.com/ZhangYHhhhhhh/xuexitong-autostudy) 的 fork 版本基础上继续维护，原项目为 [DaRin1403/xuexitong-autostudy](https://github.com/DaRin1403/xuexitong-autostudy)。本地参考目录 xuexitong-autostudy-folk 来源为 [cq-eng/xuexitong-autostudy](https://github.com/cq-eng/xuexitong-autostudy)，其中部分改进经验证后移植到当前项目。

以上来源按维护者提供的信息记录，角色分别为原项目、基础 fork、参考 fork 和当前维护仓库。不能将参考来源等同于所有实现的原创作者；字体等第三方资源另见 [vendor/NOTICE.md](../vendor/NOTICE.md)。

计划向原项目贡献时，明确选择 DaRin1403/xuexitong-autostudy 作为 base repository。使用 [PR正文.md](PR正文.md) 作为审阅说明，不把 GitHub 默认选择的 fork 目标当作既定贡献目标。

## 版本与更新通道

当前版本统一为 **1.0.20**：用户脚本头、运行版本、version.json、package.json 和 package-lock.json 保持一致。该编号属于当前维护分支，不表示上游已发布该版本；上游是否合并及如何发版由其维护者决定。

普通 fork 包继续使用 Hxc-Chen 的主页、反馈与更新通道。上游 PR 包保留 DaRin1403 的主页、反馈和 jsDelivr 更新/下载地址，避免将上游用户切换到个人 fork 通道。ZhangYHhhhhhh 与 cq-eng 的来源说明和致谢在两个包中均保留。

## 本地准备

    npm ci --ignore-scripts
    npm test
    npm run check
    python tools/package-release.py --target fork
    python tools/package-release.py --target upstream

对应输出：

- 个人 fork：dist/xuexitong-autostudy-v1.0.20-github.zip
- 上游 PR：dist/xuexitong-autostudy-v1.0.20-upstream-pr-github.zip

包内包含公开源码、文档、合成测试和锁定字体资源，不包含个人密钥、真实题文、运行日志、缓存或完整参考仓库。

## 提交步骤

1. 同步目标仓库代码，在自己的 fork 建立用于贡献的分支。
2. 将上游 PR 包内的项目内容放到该分支根目录，检查与已有代码的冲突，不把 ZIP 当成源码改动。
3. 保留原作者署名、ZhangYHhhhhhh 和 cq-eng 的来源信息，以及第三方资源声明。
4. 执行测试和构建检查后，按正常 Git 流程提交并推送。
5. 创建 PR，明确 base repository 为 DaRin1403/xuexitong-autostudy；分支以目标仓库实际设置为准。
6. 根据最终差异调整 PR 标题与正文，如实保留真实页面与字体覆盖尚未全面验证的边界。

本工作目录没有 Git 提交历史；生成这些文件和本地包不代表已提交、推送或创建远程 PR。
