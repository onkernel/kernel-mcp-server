# Kernel MCP Server

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.3%2B-black.svg)](https://nextjs.org/)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides AI assistants with secure access to [Kernel platform](https://onkernel.com) tools and browser automation capabilities.

![Architecture Overview](public/architecture_overview.png)

🌐 **Use instantly** at `https://mcp.onkernel.com/mcp` — no installation required!

## What is this?

The Kernel MCP Server bridges AI assistants (like Claude, Cursor, or other MCP-compatible tools) with the Kernel platform, enabling them to:

- 🚀 Deploy and manage Kernel apps in the cloud
- 🌐 Launch and control headless Chromium sessions for web automation
- 📊 Monitor deployments and track invocations
- 🔍 Search Kernel documentation and inject context
- 💻 Evaluate JavaScript and stream DOM snapshots

**Open-source & fully-managed** — the complete codebase is available here, and we run the production instance so you don't need to deploy anything.

The server uses OAuth 2.0 authentication via [Clerk](https://clerk.com) to ensure secure access to your Kernel resources.

## 🎯 First Time? Start Here!

**Ready to try Kernel but don't see any apps yet?** Perfect! Here's how to get started:

### Step 1: Install Kernel MCP Server

Install the Kernel MCP server to your favorite MCP client using the [setup instructions](#-mcp-server-setup) below.

### Step 2: Ask Your AI Assistant for Help

Once connected, simply ask in your MCP client chat:

```
"How do I get a Kernel sample app set up locally?"
```

Your AI assistant will use the `search_docs` tool to get you the latest quickstart instructions and guide you through setting up your first Kernel app!

### Step 3: Deploy & Test with MCP Tools

After you have a sample app locally, ask your assistant:

```
"Deploy my sample app to Kernel"
```

> **Note:** Be patient and wait until all tool parameters are fully generated before running the tool call.

Then test it:

```
"Run my app and get the title from onkernel.com"
```

### Why This Approach?

- ✅ **Always up-to-date** - Your AI assistant fetches the latest docs
- ✅ **Interactive guidance** - Get help customized to your setup
- ✅ **Learn MCP tools** - Experience the power of `search_docs`, `deploy_app`, and `invoke_action`
- ✅ **End-to-end workflow** - From local development to cloud deployment to execution

### What You'll Experience

Your AI assistant will help you:

- Download and understand sample apps (`search_docs`)
- Deploy your local code to the cloud (`deploy_app`)
- Run actions and see results (`invoke_action`)
- Create browser sessions in the cloud (`create_browser`)
- Monitor deployments (`list_deployments`, `get_deployment`)

## 🚀 MCP Server Setup

First, add the Kernel MCP server to your favorite MCP-compatible client using `https://mcp.onkernel.com/mcp`. Here are setup instructions for popular clients:

### Claude

#### Team & Enterprise (Claude.ai)

1. Navigate to **Settings** in the sidebar (web or desktop).
2. Scroll to **Integrations** and click **Add more**.
3. Fill in:
   - **Integration name:** `Kernel`
   - **Integration URL:** `https://mcp.onkernel.com/mcp`
4. Start a chat, enable **Tools**, and finish auth.

#### Free & Pro (Claude desktop)

Open `~/Library/Application Support/Claude/claude_desktop_config.json` and add:

```json
{
  "mcpServers": {
    "kernel": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.onkernel.com/mcp"]
    }
  }
}
```

Restart the Claude desktop app.

#### Claude Code CLI

```bash
claude mcp add --transport http kernel https://mcp.onkernel.com/mcp
# then, inside the REPL:
/mcp   # to run through auth
```

### Cursor

[Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=kernel&config=eyJ1cmwiOiJodHRwczovL21jcC5vbmtlcm5lbC5jb20vbWNwIn0%3D)

#### Manual Setup

1. Press **⌘/Ctrl Shift J** to open settings.
2. Click **Tools & Integrations**.
3. Click **New MCP server**.
4. Add the following configuration:

```json
{
  "mcpServers": {
    "kernel": {
      "url": "https://mcp.onkernel.com/mcp"
    }
  }
}
```

5. Save and the server will be available.

### Goose

[Add to Goose](goose://extension?cmd=npx&arg=-y&arg=mcp-remote&arg=https%3A%2F%2Fmcp.onkernel.com%2Fmcp&timeout=300&id=kernel&name=Kernel&description=Access%20Kernel%27s%20cloud-based%20browsers%20via%20MCP)

#### Goose Desktop

1. Click `...` in the top right corner of the Goose Desktop.
2. Select `Advanced Settings` from the menu.
3. Under `Extensions`, click `Add custom extension`.
4. On the `Add custom extension` modal, enter:
   - **Type**: `Streaming HTTP`
   - **ID**: `kernel`
   - **Name**: `Kernel`
   - **Description**: `Access Kernel's cloud-based browsers via MCP`
   - **URL**: `https://mcp.onkernel.com/mcp`
   - **Timeout**: `300`
5. Click `Add` button.

### Visual Studio Code

```json
{
  "mcpServers": {
    "kernel": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.onkernel.com/mcp"]
    }
  }
}
```

1. Press **⌘/Ctrl P** → search **MCP: Add Server**.
2. Select **Command (stdio)**.
3. Enter:
   ```bash
   npx -y mcp-remote https://mcp.onkernel.com/mcp
   ```
4. Name the server **Kernel** and press Enter.
5. Activate via **MCP: List Servers → Kernel → Start Server**.

### Windsurf

1. Press **⌘/Ctrl ,** to open settings.
2. Navigate **Cascade → MCP servers** → **Add custom server**.
3. Paste:

```json
{
  "mcpServers": {
    "kernel": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.onkernel.com/mcp"]
    }
  }
}
```

### Zed

Open `settings.json` and add:

```json
{
  "context_servers": {
    "kernel": {
      "command": {
        "path": "npx",
        "args": ["-y", "mcp-remote", "https://mcp.onkernel.com/mcp"],
        "env": {}
      },
      "settings": {}
    }
  }
}
```

### Others

Many other MCP-capable tools accept:

- **Command:** `npx`
- **Arguments:** `-y mcp-remote https://mcp.onkernel.com/mcp`
- **Environment:** _(none)_

Configure these values wherever the tool expects MCP server settings.

## 🛠️ Available MCP Tools

The server provides these tools for AI assistants:

### Application Management

- `deploy_app` - Deploy TypeScript or Python apps to Kernel
- `list_apps` - List apps in your Kernel organization
- `invoke_action` - Execute actions in Kernel apps
- `get_deployment` - Get deployment status and logs
- `list_deployments` - List all deployments
- `get_invocation` - Get action invocation details

### Browser Automation

- `create_browser` - Launch a new browser session
- `get_browser` - Get browser session information
- `delete_browser` - Terminate a browser session
- `list_browsers` - List active browser sessions

### Documentation & Search

- `search_docs` - Search Kernel platform documentation and guides

## 📚 Usage Examples

### Deploy Local Apps to the Cloud

```
Human: I have a Kernel Playwright automation script open in my editor. Can you deploy it to Kernel?
Assistant: I'll read your local files and deploy them to Kernel for you.
[Uses deploy_app tool to upload your code and create a cloud deployment]
```

### Invoke Apps from Anywhere

```
Human: Run my web-scraper app to get data from reddit.com
Assistant: I'll execute your web-scraper action with reddit.com as the target.
[Uses invoke_action tool to run your deployed app in the cloud]
```

### Create Persistent Browser Sessions

```
Human: Create a stealth browser session that I can reuse for testing login flows
Assistant: I'll create a persistent, stealth-enabled browser that maintains state between uses.
[Uses create_browser tool with persistence and stealth options]
```

## ❓ Frequently Asked Questions

**Is the server open source?**
Yes — the code lives at [github.com/onkernel/kernel-mcp-server](https://github.com/onkernel/kernel-mcp-server). You're welcome to browse the code and contribute. We provide a hosted instance at `https://mcp.onkernel.com/mcp` for convenience.

**Does Kernel store my data?**
Only encrypted refresh tokens and minimal metadata required for auth; browser state lives in your Kernel organization and never leaves your tenancy.

**What if the handshake fails?**
Restart your MCP client or disable/re-enable the Kernel server before opening a support ticket. Most connection issues resolve with a simple restart.

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. **Fork the repository** and create your feature branch
2. **Make your changes** and add tests if applicable
3. **Run the linter and formatter**:
   ```bash
   bun run lint
   bun run format
   ```
4. **Test your changes** thoroughly
5. **Submit a pull request** with a clear description

### Development Guidelines

- Follow the existing code style and formatting
- Add TypeScript types for new functions and components
- Update documentation for any API changes
- Ensure all tests pass before submitting

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol specification
- [Kernel Platform](https://onkernel.com) - The platform this server integrates with
- [Clerk](https://clerk.com) - Authentication provider
- [@onkernel/sdk](https://www.npmjs.com/package/@onkernel/sdk) - Kernel JavaScript SDK

## 💬 Support

- **Issues & Bugs**: [GitHub Issues](https://github.com/onkernel/kernel-mcp-server/issues)
- **MCP Feedback**: [github.com/kernelxyz/mcp-feedback](https://github.com/kernelxyz/mcp-feedback)
- **Documentation**: [Kernel Docs](https://docs.onkernel.com) • [MCP Setup Guide](https://docs.onkernel.com/mcp)
- **Community**: [Kernel Discord](https://discord.gg/FBrveQRcud)

---

Built with ❤️ by the [Kernel Team](https://kernel.so)
