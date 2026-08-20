# 🌟 Welcome to yukiBlogs!

This is a personal blog system built with Next.js, featuring a Glassmorphism design. This project includes a frontend display and an independent local backend console. It supports Markdown writing, draft management, and image hosting configuration.

This guide will take you from scratch to deploy and use yukiBlogs.

> **Deployment architecture:** `myBlogs` contains server routes for AI, weather, music, and OAuth, so it requires Vercel or another Next.js server runtime. GitHub hosts the source repository; this project does not publish a GitHub Pages static site.

---

## Language

[![English](https://img.shields.io/badge/Language-English-blue.svg)](README_en.md)
[![中文](https://img.shields.io/badge/语言-中文-red.svg)](README.md)

## Privacy and repository safety

This repository tracks reusable source code only. Personal configuration, deployment paths, posts, chatter, albums, friend links, project data, uploads, and custom domains are generated locally and ignored by Git. Run `node scripts/checkPublicRepo.mjs` before publishing, and keep API keys, OAuth client secrets, and statistics credentials in local or deployment environment variables.

## Preface

### Update Summary (2026-08-19)

#### 1. Added Persistent Traffic Statistics

> Upstash Redis stores cumulative visitors and view counts for posts, chatter, and moments. Migration, daily deduplication, and increments now run atomically in Redis Lua; legacy article-view totals migrate on first read.

#### 2. Added Owner-browser Exclusion and Bot Filtering

> After configuring `STATS_OWNER_KEY`, visit `/stats-owner` to mark the current browser as the owner. Owner traffic and common crawlers create no new records; totals recorded before exclusion are preserved.

#### 3. Fixed Manager-to-frontend Synchronization

> Runtime configuration loading now keeps friend links, profile data, footer technology badges, site start time, AI settings, projects, albums, and chatter content consistent after saving. Delete, retry, and generated-file write flows were also hardened.

#### 4. Improved Windows Startup, Deployment, and Secret Handling

> `Start.bat` now prefers the uv-managed `.venv`. GitHub OAuth, Gemini, weather, and statistics secrets are supplied through server-side environment variables. The current frontend stack is Next.js 16, React 19, and Tailwind CSS 4.

## I. Quick Start Deployment

### 1. Environment Configuration

Before starting, please ensure your computer has the following runtime environments installed; otherwise, the program will not start properly:

* **Node.js** (v20.9.0 minimum; current LTS recommended)
* **Package Manager** (npm)
* **Git** (for pulling code and version control)
* **Python** (v3.10 or above recommended; tested under v3.10)
* *Optional: Cloud storage/Image hosting service (detailed configuration instructions provided later)*

### 2. Blog Source Code Update

To easily keep up with the latest features, please use the updater to update the source code!
By using the updater, you no longer need to manually compare code, worry about pull conflicts, or fear that your articles and configuration files will be overwritten.

🛠️ Update Steps:

Step 1: Obtain the lossless updater (only required for the first time)

#### 1. Download the update.bat and update.py files from the project's root directory.

#### 2. Move the downloaded update.bat and update.py to the outermost root directory of your local blog project (i.e., alongside the my-blog-manager and myBlogs folders).

As shown below:


#### 3. Double-click the update.bat file to update. If it crashes, please run the update.py file using CMD.

### 3. Quick Start

#### ① Startup Script

Once you have completed the environment configuration above, the basic preparation is done.
First, enter the `my-blog-manager` folder (**⚠️ Note: Do not rename this folder under any circumstances, or environment path resolution will fail!**)

Create and synchronize the recommended uv environment first:

```powershell
cd my-blog-manager
uv sync --python 3.12
uv run python run_me.py
```

Afterwards, you can also double-click `Start.bat`; it now prefers `.venv\Scripts\python.exe`.

Double-click to run the startup script in the folder:
`Start.bat`
The script will automatically detect and install the required dependencies. Once the environment configuration is complete, the program will launch the backend console.

#### ② Deploy Your Blog to Vercel

> **Tip**: This tutorial primarily demonstrates how to deploy the project to Vercel, as Vercel provides native support for the Next.js framework.
> **Prerequisite**: Please ensure Git is installed and you have a GitHub account. **Be sure to follow the upcoming steps in order!**

> **Please ensure you have completed the following operations**:
> **Step 1: Local Global Configuration**

Set username

`git config --global user.name "Your_GitHub_Username"`

Set email (must be the email associated with your GitHub)

`git config --global user.email "your_email_linked_to_github@example.com"`

> **Step 2: Initialize Local Repository**
> Enter your project folder and execute the following CMD commands: (the frontend deployment folder, which is myBlogs here)

1. Initialize Git repository to generate the hidden .git folder
`git init`
2. Add all files to the staging area (note the period at the end)
`git add .`
3. Commit to the local repository and add a remark
`git commit -m "first commit"`

**1. Configure Local Physical Path**
Open the "Settings" page in the console.
The pulled source code contains two core folders: `my-blog-manager` and `myBlogs`. Please specify the local physical path of `myBlogs` in the console.

![选择物理路径](picture/Pasted%20image%2020260427111646.png)

Example: `D:\Sites\yukiBlogs`

![填入本地BLOG物理路径](picture/Pasted%20image%2020260427112311.png)

> **Crucial Step**: After entering the path, you must click **[Test Path]** to verify connectivity! Once verified, click **[Save Deployment Configuration]** below.

**2. Create a Private Repository on GitHub**
Log in to GitHub and create a new repository to host your blog's source code (it is recommended to set it as a **Private repository** to protect data privacy).

![创建仓库](picture/Pasted%20image%2020260427112905.png)

The repository name can be customized.

![仓库命名](picture/Pasted%20image%2020260427113030.png)

Obtain the SSH address of the repository and paste it into the "Line B" configuration in the console:

![复制SSH](picture/Pasted%20image%2020260427113120.png)

Enter `main` for the source code branch. After confirming it is correct, click **[Save Deployment Configuration]** again.

**3. Obtain and Configure Deployment Key**
Click the **[Get Line B Exclusive Key]** button in the console:

Go to your GitHub repository page and navigate to the `Settings` -> `Deploy keys` interface:

![Deploy Keys](picture/Pasted%20image%2020260427113705.png)

Paste the copied key into the `Key` box. The `Title` can be anything (e.g., `myBlogs-Deploy-Key`).

> **🚨 Critical Warning**: The **Allow write access** option below MUST be checked!
> After setting it up, click **Add key** to save.

**4. Initialize and Push Source Code**
Return to the local console, click **[Initialize Source Deployment]**, and wait for the program to finish executing.
Once completed, click the **[Sync Source Code Only]** button:

![同步源码到 Vercel](picture/Pasted%20image%2020260427121539.png)

The program will begin pushing code to GitHub. **During this time, please do not switch pages or close the window:**

![同步进度](picture/Pasted%20image%2020260427121702.png)

Once the progress bar is complete, the frontend static page source code has been successfully hosted on GitHub.

> **A push failure bug may occur here**:
> **Please try**:
> Change the SSH repository address as shown below before initializing and syncing the source code.
> 

**5. Deploy to the Vercel Platform**
Visit the Vercel website, register an account, and bind your GitHub authorization.

![绑定账号](picture/Pasted%20image%2020260427121844.png)

Click `Add New...` to add a new Project, and select the repository you just pushed to GitHub from the Import list:

![导入项目](picture/Pasted%20image%2020260427121939.png)

For example, I selected `myBlogS2`:

![选择项目](picture/Pasted%20image%2020260427122034.png)

Select **Next.js** in Framework Preset, then click the **Deploy** button to start deployment:

![点击Deploy](picture/Pasted%20image%2020260427122141.png)

Wait for the Vercel server to build your blog.

![部署中](picture/Pasted%20image%2020260427122245.png)

Deployment successful! Click the preview image to visit your website directly.

![部署成功](picture/Pasted%20image%2020260427122338.png)

In the project Dashboard, you can check the deployment status and detailed logs at any time:

![查看详情](picture/Pasted%20image%2020260427122453.png)

Vercel will assign you a free subdomain by default:

![分配域名](picture/Pasted%20image%2020260427122553.png)

---

### Question 1: How do I bind my custom domain name?

**Answer:** Here is an example using a domain purchased from "Alibaba Cloud" (the operation logic for other providers like Tencent Cloud, Cloudflare, etc., is similar).

First, log in to the Alibaba Cloud console and enter the [Domain Name Management] page:

![域名管理](picture/Pasted%20image%2020260427123636.png)

Click the [DNS Resolution] button on the right side of the corresponding domain:

![点击解析](picture/Pasted%20image%2020260427123737.png)

Then return to Vercel, enter your project dashboard, and click **Settings** (or directly click the plus sign next to the domain name):

![点击加号](picture/Pasted%20image%2020260427123156.png)

![进入设置](picture/Pasted%20image%2020260427123838.png)

In the Domains tab, enter the domain you purchased (for example, mine is `xinghuisama.top`), and click **Add** to save:

After adding it, Vercel will provide the configuration parameters for the `A` record and `CNAME` record. Please add these parameters completely to your Alibaba Cloud DNS resolution settings:

![添加记录](picture/Pasted%20image%2020260427124533.png)

> **Note**: When adding records, be sure to carefully check the record type and Value!

After configuration is complete, wait a few minutes (DNS propagation takes time), and click **Refresh** on the Vercel page to update the status.

![Refresh](picture/Pasted%20image%2020260427124625.png)

Once the status shows as normal, you can access the blog via your custom domain name! (For example: `www.xinghuisama.top`).

---

## II. Update Settings and File Upload

To protect data safety, this console uses an **"Operation Staging Area"** mechanism. **Please pay special attention!** Many settings must be actively "Updated to Local" after modification to be truly saved. When this operation is required, there is usually a highlighted prompt at the top of the interface.

**Operation Example: Modifying Personal Profile**

![修改简介](picture/Pasted%20image%2020260427125314.png)

After modifying the content, click **[Stage to Operation Queue]**:

![暂存队列](picture/Pasted%20image%2020260427125430.png)

At this point, the top toolbox will prompt pending operations. You can undo at any time (clear all), or click **[Update Local]**.

> ⚠️ Note: After clicking "Update Local," the data is only saved in your local console environment.

If you want these modifications to take effect on the frontend blog page, you must continue by clicking **[Sync Blog]** (assuming the physical path of the frontend blog is configured correctly):

![同步Blog](picture/Pasted%20image%2020260427125800.png)

The publishing and modification of all content, such as blog posts, moments, and talks, follow this process.

> **💡 Golden Rule**: Staging Queue -> Update Local -> Sync Blog

---

## III. How to Push Your Modifications to the Live Webpage?

When you have completed satisfactory creations or settings adjustments locally and want to publish them to the public network for everyone to see:

Please remember, after making any substantial modifications and clicking **[Sync Blog]**, open the synchronous deployment page in the console:

![打开同步](picture/Pasted%20image%2020260427130216.png)

Confirm that the "Line B" address is correct, and click **[Sync Source Code Only]**.
Wait for GitHub Actions or Vercel to automatically capture the update. In a short time, you will see the latest content on the live page.

---

## IV. Image Hosting Configuration

To optimize the writing experience, the console integrates image hosting upload functionality. This guide uses "7bu Image Hosting" ([https://7bu.top]()) as a reference.
If you prefer using direct external links, the console also supports direct insertion of image URLs. If you want to connect other image hosting services that support standard APIs, you can attempt to do so.

**Configuration Process:**

![图床配置](picture/Pasted%20image%2020260427124930.png)

After filling in the corresponding API Token and other information, you can click **[Send Probe to Test Token]** to verify in real-time whether the image hosting interface is functional.

---

## V. AI Cat Assistant Settings

The blog system has a built-in AI Cat Assistant (connected to the Gemini model by default). Users can also modify the source code to connect other large language models.

First, you need to apply for a Gemini API Key. After obtaining the API Key, configure it in the console as follows:

![猫猫设置](picture/Pasted%20image%2020260427134211.png)

After setting the exclusive system prompt (personality) for the cat locally, we need to give the online environment the ability to call the AI. Please log in to Vercel:

![Vercel环境](picture/Pasted%20image%2020260427134538.png)

Find `Environment Variables` in the project settings:

![搜索变量](picture/Pasted%20image%2020260427134633.png)

Enter your blog project details:

![项目工程](picture/Pasted%20image%2020260427134703.png)

Ensure the scope (environment) includes the online environment, and click **Add Environment Variables**:

![添加变量](picture/Pasted%20image%2020260427135004.png)

Input your key:

Required production variables:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | AI Cat Assistant |
| `QWEATHER_KEY` | Weather widget server route |
| `GITHUB_OAUTH_CLIENT_SECRET` | Server-side GitHub comment OAuth exchange |
| `KV_REST_API_URL` | Upstash Redis REST endpoint for traffic statistics |
| `KV_REST_API_TOKEN` | Upstash Redis write token; keep it server-side only |
| `STATS_OWNER_KEY` | Random secret used to exclude the owner's browser |

![输入API](picture/Pasted%20image%2020260427135044.png)

Click save. The next time you redeploy, the Cat Assistant will be active online.

---

## VI. Comment System Configuration

The comment system of this blog is based on GitHub Issues (Gitalk or similar solutions). You need to create a **Public** repository on GitHub specifically to store comments from visitors.

In the console's comment settings, enter your GitHub username and the name of this public repository:


**Next, configure OAuth authorization to allow visitors to log in and leave comments:**

1. Log in to GitHub, click on your profile picture in the top right corner, and go to **Settings**.
2. Scroll to the bottom of the left menu bar and click **Developer settings**.
3. Select **OAuth Apps** on the left, and click **New OAuth App** in the top right corner.

**Key Application Information Filling Guide:**

| Field Name | Suggestion |
| --- | --- |
| **Application name** | Custom name, e.g., `My-Blog-Comments` |
| **Homepage URL** | The **complete address of your blog's homepage** (e.g., `[https://www.xinghuisama.top](https://www.xinghuisama.top)`) |
| **Application description** | Optional |
| **Authorization callback URL** | Use `http://127.0.0.1:3210/` for the local manager; use the Vercel blog domain for the production OAuth App |

**Extract Core Keys:**

1. Submit registration (Register application).
2. You will see the **Client ID** on the redirected page, which is the first required piece of data.
3. Click **Generate a new client secret** below to generate the secret.
4. **🚨 Immediately copy and securely save this secret!** Due to security mechanisms, this secret will be permanently hidden once you leave this page.

For the local manager, enter the Client ID, Client Secret, repository, owner, and administrator account. Click **Save**, then **Update Local**, and finally **Check OAuth Configuration**. For Vercel, store the secret as `GITHUB_OAUTH_CLIENT_SECRET`; synchronization removes it from the public `siteConfig.ts`.

---

## VII. NetEase Cloud Music Widget Settings

![歌单设置](picture/Pasted%20image%2020260427141049.png)

Want to add BGM to your blog?
Open the **NetEase Cloud Music Web Version** via your computer browser. Search for and enter the detail page of a song you like. Observe the browser's address bar; the number in the URL is the song's specific ID:

![网易云ID](picture/Pasted%20image%2020260427141235.png)

Copy and paste this ID into the search box in the console to add the song to your blog's playlist library!

![添加歌曲](picture/Pasted%20image%2020260427141356.png)

---

## VIII. Traffic Statistics Setup

The cumulative visitor total and article view counts are persisted in Upstash Redis, so the local manager does not need to stay running.

1. Connect Upstash Redis from the Vercel project's **Storage** page.
2. In **Environment Variables**, confirm that `KV_REST_API_URL` and `KV_REST_API_TOKEN` exist. The compatible aliases `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are also supported.
3. Add a private random long string as `STATS_OWNER_KEY`, then redeploy Production.
4. Open `https://your-blog-domain/stats-owner`, enter the same `STATS_OWNER_KEY`, and choose **Exclude this browser**. The browser's existing visitor record is removed and later owner visits are ignored.

Counting rules: visitors are deduplicated by browser and Shanghai calendar day. Post, chatter, and moment views are deduplicated by content, browser, and day, so the same browser adds at most one view per item each day. Legacy article views migrate on first read. Common bots are ignored; owner exclusion prevents new records without rolling back earlier totals. Never commit Redis tokens or `STATS_OWNER_KEY` to Git.

---

## Conclusion

### Developer Verification

```powershell
cd myBlogs
npm ci
npm run lint
npm run typecheck
npm run build

cd ..\my-blog-manager
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run build` no longer skips TypeScript validation; type errors block the production build.

yukiBlogs has detailed features waiting to be explored during actual use. This project aims to provide an out-of-the-box frontend application and backend management solution. If you are a developer and feel the console operations can be optimized, you can do secondary development based on the Next.js source code, or write Markdown manually for deployment!

**If you find this project helpful, please give me a ⭐ Star on GitHub! Every star is a driving force for continued maintenance and updates. Thank you!**

## License

> This project is licensed under the [CC BY-NC 4.0]() license. Free learning, sharing, and republication after secondary modification are allowed (secondary open-source publication must mention the original author), but **any commercial use is strictly prohibited**.

## Previous Update Logs (Version 0.1.1)

#### 1. Title Page and Icon Update

> Implemented custom webpage titles and icon buttons. See the personal card settings in the configuration for details.

#### 2. Article Support for LaTeX Format

> Implemented LaTeX formula rendering. Usage example:
> Input formula like $E=mc^2$. Underscores require an escape character "\_".
> Thanks to @inWunsch for assisting with the LaTeX formula rendering update.

#### 3. Comment System Bug Fix

> Fixed the bug where the comment system failed to fetch properly.

#### 4. New siteconfig Settings

> Added multiple items such as faviconUrl and navTitle. Please make sure to save previous information when pulling code updates!

#### 5. Environment Variables

> Required environment variables have increased, please take note.
