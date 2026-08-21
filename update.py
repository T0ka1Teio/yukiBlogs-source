import os
import sys
import subprocess
import shutil

# 强制切换到脚本所在目录
os.chdir(os.path.dirname(os.path.abspath(__file__)))


def print_step(msg):
    print(f"\n{'=' * 55}\n🐱 {msg}\n{'=' * 55}")


def run_cmd(cmd, cwd=None):
    try:
        subprocess.run(cmd, check=True, cwd=cwd)
        return True
    except subprocess.CalledProcessError:
        print(f"❌ 命令执行失败: {cmd}")
        return False


def main():
    print_step("yukiBlogs 升级程序 (Python 稳定版)")

    # 1. 环境自检
    git_exe = shutil.which("git")
    node_exe = shutil.which("node")
    npm_exe = shutil.which("npm")
    if not git_exe:
        print("❌ 致命错误：未找到 Git！请前往 git-scm.com 下载安装。")
        sys.exit(1)
    if not node_exe or not npm_exe:
        print("❌ 致命错误：未找到 Node.js/npm！请先安装 Node.js。")
        sys.exit(1)

    # 2. Git 仓库修复
    custom_upstream = os.environ.get("YUKIBLOGS_UPDATE_REMOTE")
    upstream = custom_upstream or "https://github.com/T0ka1Teio/yukiBlogs-source.git"
    if not os.path.exists(".git"):
        print("🪄 初始化 Git 环境...")
        if not run_cmd([git_exe, "init"]):
            sys.exit(1)

    remotes = subprocess.run(
        [git_exe, "remote"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.split()
    if "origin" not in remotes:
        if not run_cmd([git_exe, "remote", "add", "origin", upstream]):
            sys.exit(1)

    # 3. 拉取更新
    print_step("[1/4] 连接云端获取最新代码...")
    fetch_source = upstream if custom_upstream else "origin"
    if not run_cmd([git_exe, "fetch", fetch_source, "main"]):
        sys.exit(1)
    update_ref = "FETCH_HEAD" if custom_upstream else "origin/main"

    # 4. 精准替换文件（再也不怕空格和换行符了！）
    print_step("[2/4] 执行核心文件精准替换...")
    files_to_update = [
        "update.py", "update.bat", ".gitignore",
        "LICENSE", "README.md", "README_en.md", "SECURITY.md",
        "scripts/checkConfig.mjs", "scripts/checkPublicRepo.mjs",
        "scripts/siteConfig.defaults.json", "scripts/templates",

        # 前端文件
        "myBlogs/app/about/page.tsx", "myBlogs/app/api", "myBlogs/app/chatter",
        "myBlogs/app/friends", "myBlogs/app/moments", "myBlogs/app/music",
        "myBlogs/app/photowall", "myBlogs/app/posts", "myBlogs/app/projects",
        "myBlogs/app/timeline", "myBlogs/app/globals.css", "myBlogs/app/layout.tsx",
        "myBlogs/app/page.tsx", "myBlogs/components", "myBlogs/public", "myBlogs/app/tree",
        "myBlogs/.gitignore", "myBlogs/package.json", "myBlogs/package-lock.json",
        "myBlogs/postcss.config.mjs", "myBlogs/tsconfig.json", "myBlogs/next.config.ts",

        # 后台文件
        "my-blog-manager/app/about/page.tsx", "my-blog-manager/app/admin",
        "my-blog-manager/app/api", "my-blog-manager/app/chatter",
        "my-blog-manager/app/drafts", "my-blog-manager/app/editor",
        "my-blog-manager/app/friends", "my-blog-manager/app/moments",
        "my-blog-manager/app/music", "my-blog-manager/app/photowall",
        "my-blog-manager/app/posts", "my-blog-manager/app/projects",
        "my-blog-manager/app/settings", "my-blog-manager/app/timeline",
        "my-blog-manager/app/globals.css", "my-blog-manager/app/layout.tsx",
        "my-blog-manager/app/page.tsx", "my-blog-manager/cms_core",
        "my-blog-manager/components", "my-blog-manager/context", "my-blog-manager/app/tree",
        "my-blog-manager/.gitignore", "my-blog-manager/launcher.py", "my-blog-manager/public",
        "my-blog-manager/data/deploy_config.example.json",
        "my-blog-manager/package.json", "my-blog-manager/package-lock.json",
        "my-blog-manager/postcss.config.mjs", "my-blog-manager/run_me.py",
        "my-blog-manager/Start.bat", "my-blog-manager/tsconfig.json", "my-blog-manager/tests",
        "my-blog-manager/next.config.ts"
    ]

    if not run_cmd([git_exe, "checkout", update_ref, "--", *files_to_update]):
        sys.exit(1)

    # 5. 安装依赖
    print_step("[3/4] 同步依赖包...")
    if os.path.exists("myBlogs"):
        run_cmd([npm_exe, "install"], cwd="myBlogs")
    if os.path.exists("my-blog-manager"):
        run_cmd([npm_exe, "install"], cwd="my-blog-manager")

    # 6. 修补配置
    print_step("[4/4] 智能修补 siteConfig 配置文件...")
    if os.path.exists(os.path.join("scripts", "checkConfig.mjs")):
        run_cmd([node_exe, "scripts/checkConfig.mjs"])

    print_step("✨ 升级完毕！如果有遗漏，请再次启动本程序！")


if __name__ == "__main__":
    main()
