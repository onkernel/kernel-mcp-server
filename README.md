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

For a deeper dive into why and how we built this server, see our blog post: [Introducing Kernel MCP Server](https://blog.onkernel.com/p/introducing-kernel-mcp-server).

## Setup Instructions

### General (Transports)

- Streamable HTTP (recommended): `https://mcp.onkernel.com/mcp`
- stdio via `mcp-remote` (for clients without remote MCP support): `npx -y mcp-remote https://mcp.onkernel.com/mcp`

Use the streamable HTTP endpoint where supported for increased reliability. If your client does not support remote MCP, use `mcp-remote` over stdio.

Kernel's server is a centrally hosted, authenticated remote MCP using OAuth 2.1 with dynamic client registration.

## Connect in your client

### Claude

#### Team & Enterprise (Claude.ai)

1. Go to **Settings → Connectors → Add custom connector**.
2. Enter: **Integration name:** `Kernel`, **Integration URL:** `https://mcp.onkernel.com/mcp`, then click **Add**.
3. In **Settings → Connectors**, click **Connect** next to `Kernel` to launch OAuth and approve.
4. In chat, click **Search and tools** and enable the Kernel tools if needed.

> On Claude for Work (Team/Enterprise), only Primary Owners or Owners can enable custom connectors for the org. After it's configured, each user still needs to go to **Settings → Connectors** and click **Connect** to authorize it for their account.

#### Free & Pro (Claude desktop)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` and restart Claude:

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

#### Claude Code CLI

```bash
claude mcp add --transport http kernel https://mcp.onkernel.com/mcp
# Then in the REPL run once to authenticate:
/mcp
```

### Cursor

Click [here](cursor://anysphere.cursor-deeplink/mcp/install?name=kernel&config=eyJ1cmwiOiJodHRwczovL21jcC5vbmtlcm5lbC5jb20vbWNwIn0%3D) to install Kernel on Cursor.

#### Manual setup

1. Press **⌘/Ctrl Shift J**.
2. Go to **Tools & Integrations → New MCP server**.
3. Add this configuration:

```json
{
  "mcpServers": {
    "kernel": {
      "url": "https://mcp.onkernel.com/mcp"
    }
  }
}
```

4. Save. The server will appear in Tools.

### Goose

Click [here](goose://extension?cmd=npx&arg=-y&arg=mcp-remote&arg=https%3A%2F%2Fmcp.onkernel.com%2Fmcp&timeout=300&id=kernel&name=Kernel&description=Access%20Kernel%27s%20cloud-based%20browsers%20via%20MCP) to install Kernel on Goose in one click.

#### Goose Desktop

1. Click `Extensions` in the sidebar of the Goose Desktop.
2. Click `Add custom extension`.
3. On the `Add custom extension` modal, enter:
   - **Extension Name**: `Kernel`
   - **Type**: `STDIO`
   - **Description**: `Access Kernel's cloud-based browsers via MCP`
   - **Command**: `npx -y mcp-remote https://mcp.onkernel.com/mcp`
   - **Timeout**: `300`
4. Click `Save Changes` button.

#### Goose CLI

1. Run the following command:
   ```bash
   goose configure
   ```
2. Select `Add Extension` from the menu.
3. Choose `Command-line Extension`.
4. Follow the prompts:
   - **Extension name**: `Kernel`
   - **Command**: `npx -y mcp-remote https://mcp.onkernel.com/mcp`
   - **Timeout**: `300`
   - **Description**: `Access Kernel's cloud-based browsers via MCP`

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
4. Name the server **Kernel** → Enter.
5. Activate via **MCP: List Servers → Kernel → Start Server**.

### Windsurf

1. Press **⌘/Ctrl ,** to open settings.
2. Go to **Cascade → MCP servers → Add custom server**.
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

## Tools

### Browser Automation
- `create_browser` - Launch a new browser session
- `get_browser` - Get browser session information
- `list_browsers` - List active browser sessions
- `delete_browser` - Terminate a browser session

### App Management
- `list_apps` - List apps in your Kernel organization
- `invoke_action` - Execute actions in Kernel apps
- `get_deployment` - Get deployment status and logs
- `list_deployments` - List all deployments
- `get_invocation` - Get action invocation details

### Documentation & Search
- `search_docs` - Search Kernel platform documentation and guides

## Troubleshooting

- Cursor clean reset: ⌘/Ctrl Shift P → run `Cursor: Clear All MCP Tokens` (resets all MCP servers and auth; re-enable Kernel and re-authenticate).
- Clear saved auth and retry: `rm -rf ~/.mcp-auth`
- Ensure a recent Node.js version when using `npx mcp-remote`
- If behind strict networks, try stdio via `mcp-remote`, or explicitly set the transport your client supports

## Examples

### Invoke apps from anywhere

```
Human: Run my web-scraper app to get data from reddit.com
Assistant: I'll execute your web-scraper action with reddit.com as the target.
[Uses invoke_action tool to run your deployed app in the cloud]
```

### Create persistent browser sessions

```
Human: Create a stealth browser session that I can reuse for testing login flows
Assistant: I'll create a persistent, stealth-enabled browser that maintains state between uses.
[Uses create_browser tool with persistence and stealth options]
```

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
