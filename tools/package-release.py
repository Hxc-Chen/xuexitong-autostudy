"""Build the public GitHub source archive from an explicit allowlist.

Standard-library only. Does not publish, call an API, or read credentials.
Run tests before this command; the archive verifier checks bytes and links,
not browser behavior. Local raw logs, question exports and keys are excluded.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from datetime import date
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    ".gitignore", "README.md", "CHANGELOG.md", "LICENSE", "version.json",
    "package.json", "package-lock.json", "学习通刷课助手.user.js",
    "docs/模块-自动答题.md", "docs/模块-练题自测.md", "docs/get-api-key.md",
    "docs/发布与验证.md", "docs/上游PR说明.md", "docs/PR正文.md",
    "tests/issues-regression.test.cjs", "tests/fork-improvements.test.cjs", "tests/fixtures/synthetic-questions.json",
    "tests/fixtures/vision-sample.png",
    "tools/自检-答题记录检查.js", "tools/诊断-视觉接口.cjs", "tools/package-release.py",
    "tools/embed-font-deps.cjs", "vendor/font-deps.js", "vendor/font-deps.lock.json", "vendor/NOTICE.md",
    "docs/fork优化实施与验证.md",
)
FORK = "https://github.com/Hxc-Chen/xuexitong-autostudy"
UPSTREAM = "https://github.com/DaRin1403/xuexitong-autostudy"
BASE_FORK = "https://github.com/ZhangYHhhhhhh/xuexitong-autostudy"
REFERENCE_FORK = "https://github.com/cq-eng/xuexitong-autostudy"
UPSTREAM_SCRIPT = "https://cdn.jsdelivr.net/gh/DaRin1403/xuexitong-autostudy@main/%E5%AD%A6%E4%B9%A0%E9%80%9A%E5%88%B7%E8%AF%BE%E5%8A%A9%E6%89%8B.user.js"
EXCLUSIONS = (
    "api key.txt / other credentials / .env files",
    "Issues.txt / raw runtime logs / personal question exports and originals",
    "tests/fixtures/issues-2026-11-17.json (real course fixture)",
    "node_modules / .npm-cache / .git / .release-check / dist",
    "chaoxingAuto-main local reference checkout",
    "xuexitong-autostudy-folk local reference snapshot and historical comparison probes",
    "docs/Issues修复记录*.md (local investigation notes; public summary is CHANGELOG.md)",
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def checked_files() -> tuple[dict, dict[str, bytes]]:
    data = {}
    text_extensions = {".md", ".json", ".js", ".cjs", ".py"}
    for relative in FILES:
        path = ROOT / relative
        if path.is_symlink() or not path.resolve().is_relative_to(ROOT):
            raise ValueError(f"Unexpected file location: {relative}")
        content = path.read_bytes()
        if path.suffix in text_extensions or path.name in {".gitignore", "LICENSE"}:
            text = content.decode("utf-8-sig")
            if re.search(r"sk-[A-Za-z0-9_-]{20,}|(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", text):
                raise ValueError(f"Possible credential found in {relative}; no package created")
            tokens = re.findall(r"[?&](?:enc|openc|cpi|clazzid)=([^&\s\"'<>)}]+)", text)
            # These exact example.test values exercise redaction; no other
            # test token or production-file token is exempted from the scan.
            fake_tokens = {"secret-token", "other-secret", "private", "private-token"}
            if any(not (relative == "tests/issues-regression.test.cjs" and token in fake_tokens) for token in tokens):
                raise ValueError(f"Possible personal course URL found in {relative}")
            if "G:\\xuexitong-autostudy-main" in text or "C:\\Users\\Administrator" in text:
                raise ValueError(f"Machine-specific path found in {relative}")
        data[relative] = content
    metadata = json.loads(data["version.json"].decode("utf-8-sig"))
    version = metadata["v"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Invalid release version")
    script = data["学习通刷课助手.user.js"].decode("utf-8-sig")
    if f"// @version      {version}" not in script or f"return '{version}';" not in script:
        raise ValueError("Userscript version mismatch")
    if metadata.get("repository") not in {FORK, UPSTREAM}:
        raise ValueError("Release repository mismatch")
    if metadata.get("upstream") != UPSTREAM or metadata.get("forkedFrom") != BASE_FORK or metadata.get("referenceFork") != REFERENCE_FORK:
        raise ValueError("Release provenance mismatch")
    package = json.loads(data["package.json"].decode("utf-8-sig"))
    lock = json.loads(data["package-lock.json"].decode("utf-8-sig"))
    if package["version"] != version or lock["version"] != version or lock["packages"][""]["version"] != version:
        raise ValueError("Package/lockfile version mismatch")
    if package["devDependencies"] != lock["packages"][""]["devDependencies"]:
        raise ValueError("Lockfile devDependencies mismatch")
    if metadata["repository"] not in script:
        raise ValueError("Userscript repository does not match source metadata")
    for relative, content in data.items():
        if not relative.endswith(".md"):
            continue
        for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", content.decode("utf-8-sig")):
            if re.match(r"[a-z]+://|#", target):
                continue
            resolved = (ROOT / PurePosixPath(relative).parent / target.split("#")[0]).resolve()
            if not resolved.is_relative_to(ROOT) or resolved.relative_to(ROOT).as_posix() not in data:
                raise ValueError(f"Broken package documentation link: {relative} -> {target}")
    return metadata, data


def target_files(metadata: dict, data: dict[str, bytes], target: str) -> tuple[dict, dict[str, bytes]]:
    repository = UPSTREAM if target == "upstream" else FORK
    source_repository = metadata["repository"]
    metadata = dict(metadata, repository=repository, upstream=UPSTREAM)
    data = dict(data)
    script = data["学习通刷课助手.user.js"].decode("utf-8-sig")
    download = UPSTREAM_SCRIPT if target == "upstream" else "https://raw.githubusercontent.com/Hxc-Chen/xuexitong-autostudy/main/学习通刷课助手.user.js"
    for tag, value in {"homepageURL": repository, "supportURL": repository + "/issues", "updateURL": download, "downloadURL": download}.items():
        script, count = re.subn(r"(?m)^// @" + tag + r"[^\S\r\n]+[^\r\n]*", "// @" + tag + " " * max(1, 13 - len(tag)) + value, script)
        if count != 1:
            raise ValueError(f"Missing or duplicate metadata: {tag}")
    data["学习通刷课助手.user.js"] = script.encode("utf-8")
    data["version.json"] = (json.dumps(metadata, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    package = json.loads(data["package.json"].decode("utf-8-sig"))
    package["repository"]["url"] = repository + ".git"
    data["package.json"] = (json.dumps(package, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if target == "upstream" and source_repository != UPSTREAM:
        readme = data["README.md"].decode("utf-8-sig").replace("\r\n", "\n")
        paragraph_start = readme.index("> **Fork 说明：**")
        paragraph_end = readme.index("\n\n", paragraph_start)
        readme = readme[:paragraph_start] + "> **贡献来源：** 本次改进由 [Hxc-Chen/xuexitong-autostudy](https://github.com/Hxc-Chen/xuexitong-autostudy) 整理，基于 [ZhangYHhhhhhh 的 fork](https://github.com/ZhangYHhhhhhh/xuexitong-autostudy)，并参考 [cq-eng 的 fork](https://github.com/cq-eng/xuexitong-autostudy)。原项目与贡献目标为 [DaRin1403/xuexitong-autostudy](https://github.com/DaRin1403/xuexitong-autostudy)。保留原作者与参考项目署名；PR 准备不表示已经合并。本贡献分支版本为 v" + metadata["v"] + "。" + readme[paragraph_end:]
        readme = readme.replace("- 当前 fork：[Hxc-Chen/xuexitong-autostudy](https://github.com/Hxc-Chen/xuexitong-autostudy)", "- 原项目仓库：[DaRin1403/xuexitong-autostudy](https://github.com/DaRin1403/xuexitong-autostudy)")
        readme = readme.replace("https://github.com/Hxc-Chen/xuexitong-autostudy/issues", UPSTREAM + "/issues")
        readme = readme.replace("以下是当前 fork 的安装/更新地址。它与原项目的发布通道独立；向上游提交 PR 时，请使用保留原项目地址的上游 PR 包。仓库文件上传到 main 分支后，可使用：", "以下保留原项目的安装/更新通道。PR 合并前，该地址仍提供上游已有代码，不代表已包含本次修复：")
        readme = readme.replace("https://raw.githubusercontent.com/Hxc-Chen/xuexitong-autostudy/main/%E5%AD%A6%E4%B9%A0%E9%80%9A%E5%88%B7%E8%AF%BE%E5%8A%A9%E6%89%8B.user.js", UPSTREAM_SCRIPT)
        data["README.md"] = readme.encode("utf-8")
    return metadata, data


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("fork", "upstream"), help="upstream preserves the original project's update channel; versions never change")
    args = parser.parse_args()
    metadata, data = checked_files()
    target = args.target or ("upstream" if metadata["repository"] == UPSTREAM else "fork")
    metadata, data = target_files(metadata, data, target)
    version = metadata["v"]
    folder = f"xuexitong-autostudy-v{version}" + ("-upstream-pr" if target == "upstream" else "")
    destination = ROOT / "dist"
    destination.mkdir(exist_ok=True)
    if destination.is_symlink() or not destination.resolve().is_relative_to(ROOT):
        raise ValueError("Unsafe output directory")
    manifest = {
        "version": version,
        "date": metadata["date"],
        "repository": metadata["repository"],
        "target": target,
        "upstream": UPSTREAM,
        "forkedFrom": metadata["forkedFrom"],
        "referenceFork": metadata["referenceFork"],
        "archiveRoot": folder,
        "contents": [{"path": relative, "bytes": len(content), "sha256": digest(content)} for relative, content in sorted(data.items())],
        "excluded": EXCLUSIONS,
        "notes": ["Manifest does not include its own hash.", "Run npm ci --ignore-scripts, npm test and npm run check after extracting.", "Synthetic fixtures replace the private course material.", "Packaging does not publish to GitHub."],
    }
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    entries = dict(data, **{"RELEASE-MANIFEST.json": manifest_bytes})
    archive = destination / f"{folder}-github.zip"
    temporary = destination / f"{folder}-github.zip.tmp"
    stamp = date.fromisoformat(metadata["date"])
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
            for relative, content in sorted(entries.items()):
                info = zipfile.ZipInfo(f"{folder}/{relative}", (stamp.year, stamp.month, stamp.day, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                output.writestr(info, content)
        with zipfile.ZipFile(temporary) as verify:
            if verify.testzip() is not None or len(verify.namelist()) != len(entries):
                raise ValueError("Archive validation failed")
            for relative, content in entries.items():
                if verify.read(f"{folder}/{relative}") != content:
                    raise ValueError(f"Archive bytes mismatch: {relative}")
        temporary.replace(archive)
    finally:
        if temporary.exists():
            temporary.unlink()
    checksum = digest(archive.read_bytes())
    (destination / f"{folder}-MANIFEST.json").write_bytes(manifest_bytes)
    (destination / f"{folder}-SHA256.txt").write_text(f"{checksum}  {archive.name}\n", encoding="utf-8")
    print(json.dumps({"archive": str(archive), "bytes": archive.stat().st_size, "files": len(entries), "sha256": checksum, "version": version, "credentialPatternScan": "passed", "archiveBytesVerified": True}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
