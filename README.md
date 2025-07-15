# Kernel MCP Server

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.3%2B-black.svg)](https://nextjs.org/)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides AI assistants with secure access to [Kernel platform](https://onkernel.com) tools and browser automation capabilities.

🌐 **Use instantly** at `https://mcp.onkernel.com/mcp` — no installation required!

## What is this?

The Kernel MCP Server bridges AI assistants (like Claude, Cursor, or other MCP-compatible tools) with the Kernel platform, enabling them to:

- 🚀 Deploy and manage applications in the cloud
- 🌐 Launch and control headless Chromium sessions for web automation
- 📊 Monitor deployments and track invocations
- 🔍 Search Kernel documentation and inject context
- 💻 Evaluate JavaScript and stream DOM snapshots

**Open-source & fully-managed** — the complete codebase is available here, and we run the production instance so you don't need to deploy anything.

The server uses OAuth 2.0 authentication via [Clerk](https://clerk.com) to ensure secure access to your Kernel resources.

## 📋 Prerequisites

- **Kernel Account**: Sign up at [onkernel.com](https://onkernel.com)

## 🚀 Quick Start

The easiest way to get started is using our hosted service at `https://mcp.onkernel.com/mcp`. No installation or deployment required!

### Claude

**Team & Enterprise (Claude.ai):**

1. Go to Settings → Integrations → Add more
2. Fill in:
   - Integration name: `Kernel`
   - Integration URL: `https://mcp.onkernel.com/mcp`
3. Start a chat, enable Tools, and finish auth

**Free & Pro (Claude Desktop):**
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

Restart Claude Desktop.

**Claude Code CLI:**

```bash
claude mcp add --transport http kernel https://mcp.onkernel.com/mcp
/mcp   # run inside a REPL to start auth
```

### Cursor

Install via Cursor → MCP tools, or [click to install in Cursor](cursor://mcp-install?url=https://mcp.onkernel.com/mcp&name=kernel).

Alternatively, run:

```bash
npx -y mcp-remote https://mcp.onkernel.com/mcp
```

### Goose

Install via Goose → MCP tools, or [click to install in Goose](goose://extension?cmd=npx&arg=-y&arg=mcp-remote&arg=https%3A//mcp.onkernel.com/mcp&name=kernel&description=Kernel%20MCP%20Server).

Alternatively, run:

```bash
goose mcp add kernel https://mcp.onkernel.com/mcp
```

### Visual Studio Code

In `settings.json`:

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

Use ⌘/Ctrl+P → MCP: Add Server → Command (stdio), paste the command, name it Kernel, and start via MCP: List Servers.

### Windsurf

1. ⌘/Ctrl , → Cascade → MCP servers → Add custom server
2. Paste:

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

In `settings.json`:

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

### Other MCP Clients

Most modern MCP-capable tools accept:

- **Command**: `npx`
- **Arguments**: `-y mcp-remote https://mcp.onkernel.com/mcp`
- **Environment**: (none)

## 🛠️ Available MCP Tools

The server provides these tools for AI assistants:

### Application Management

- `list_apps` - List applications in your Kernel workspace
- `invoke_action` - Execute actions in Kernel applications
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

### Basic App Management

```
Human: List my Kernel applications
Assistant: I'll check your Kernel applications for you.
[Uses list_apps tool]
```

### Browser Automation

```
Human: Create a browser session and navigate to example.com
Assistant: I'll create a browser session for you and navigate to example.com.
[Uses create_browser and browser automation tools]
```

### Deployment Monitoring

```
Human: Check the status of my latest deployment
Assistant: Let me check your recent deployments and their status.
[Uses list_deployments and get_deployment tools]
```

## ❓ Frequently Asked Questions

**Is the server open source?**
Yes — the code lives at [github.com/onkernel/kernel-mcp-server](https://github.com/onkernel/kernel-mcp-server). You're welcome to browse the code and contribute. We provide a hosted instance at `https://mcp.onkernel.com/mcp` for convenience.

**Does Kernel store my data?**
Only encrypted refresh tokens and minimal metadata required for auth; browser state lives in your Kernel workspace and never leaves your tenancy.

**What scopes are requested?**
`browser.session`, `dom.read`, and `js.eval` by default. You can narrow scopes in your client during OAuth.

**What if the handshake fails?**
Restart your MCP client or disable/re-enable the Kernel server before opening a support ticket. Most connection issues resolve with a simple restart.

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. **Fork the repository** and create your feature branch
2. **Make your changes** and add tests if applicable
3. **Run the linter and formatter**:
   ```bash
   npm run lint
   npm run format
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
