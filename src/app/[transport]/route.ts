import {
  createMcpHandler,
  experimental_withMcpAuth as withMcpAuth,
} from "@vercel/mcp-adapter";
import { verifyToken } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { Kernel } from "@onkernel/sdk";
import { z } from "zod";
import * as playwright from "playwright";
import { createContext, Script } from "node:vm";
import { createRequire } from "node:module";
import {
  ModuleKind,
  ModuleResolutionKind,
  ScriptTarget,
  transpileModule,
} from "typescript";
import { isValidJwtFormat } from "@/lib/auth-utils";

// Mintlify Assistant API types
interface MintlifySearchResult {
  content: string;
  path: string;
  metadata: Record<string, unknown>;
}

function createKernelClient(apiKey: string) {
  return new Kernel({
    apiKey,
    baseURL: process.env.API_BASE_URL,
    defaultHeaders: {
      "X-Source": "mcp-server",
      "X-Referral-Source": "mcp.onkernel.com",
    },
  });
}

export async function OPTIONS(_req: NextRequest): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// Helper function to create authentication error response
function createAuthErrorResponse(
  error: string = "invalid_token",
  description: string = "Missing or invalid access token",
): Response {
  return new Response(
    JSON.stringify({
      error,
      error_description: description,
    }),
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer realm="OAuth", error="${error}", error_description="${description}"`,
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}

// Create MCP handler with tools
const handler = createMcpHandler((server) => {
  // Register MCP resources
  server.resource("profiles", "profiles://", async (uri, extra) => {
    if (!extra.authInfo) {
      throw new Error("Authentication required");
    }

    const client = createKernelClient(extra.authInfo.token);
    const uriString = uri.toString();

    if (uriString === "profiles://") {
      // List all profiles
      const profiles = await client.profiles.list();
      return {
        contents: [
          {
            uri: "profiles://",
            mimeType: "application/json",
            text: profiles
              ? JSON.stringify(profiles, null, 2)
              : "No profiles found",
          },
        ],
      };
    } else if (uriString.startsWith("profiles://")) {
      // Get specific profile by name
      const profileName = uriString.replace("profiles://", "");
      const profile = await client.profiles.retrieve(profileName);

      if (!profile) {
        throw new Error(`Profile "${profileName}" not found`);
      }

      return {
        contents: [
          {
            uri: uriString,
            mimeType: "application/json",
            text: JSON.stringify(profile, null, 2),
          },
        ],
      };
    }

    throw new Error(`Invalid profile URI: ${uriString}`);
  });

  server.resource("browsers", "browsers://", async (uri, extra) => {
    if (!extra.authInfo) {
      throw new Error("Authentication required");
    }

    const client = createKernelClient(extra.authInfo.token);
    const uriString = uri.toString();

    if (uriString === "browsers://") {
      // List all browsers
      const browsers = await client.browsers.list();
      return {
        contents: [
          {
            uri: "browsers://",
            mimeType: "application/json",
            text: browsers
              ? JSON.stringify(browsers, null, 2)
              : "No browsers found",
          },
        ],
      };
    } else if (uriString.startsWith("browsers://")) {
      // Get specific browser by session ID
      const sessionId = uriString.replace("browsers://", "");
      const browser = await client.browsers.retrieve(sessionId);

      if (!browser) {
        throw new Error(`Browser session "${sessionId}" not found`);
      }

      return {
        contents: [
          {
            uri: uriString,
            mimeType: "application/json",
            text: JSON.stringify(browser, null, 2),
          },
        ],
      };
    }

    throw new Error(`Invalid browser URI: ${uriString}`);
  });

  server.resource("apps", "apps://", async (uri, extra) => {
    if (!extra.authInfo) {
      throw new Error("Authentication required");
    }

    const client = createKernelClient(extra.authInfo.token);
    const uriString = uri.toString();

    if (uriString === "apps://") {
      // List all apps
      const apps = await client.apps.list();
      return {
        contents: [
          {
            uri: "apps://",
            mimeType: "application/json",
            text: apps ? JSON.stringify(apps, null, 2) : "No apps found",
          },
        ],
      };
    } else if (uriString.startsWith("apps://")) {
      // Get specific app by name
      const appName = uriString.replace("apps://", "");
      const apps = await client.apps.list();
      const app = apps?.find((a) => a.app_name === appName);

      if (!app) {
        throw new Error(`App "${appName}" not found`);
      }

      return {
        contents: [
          {
            uri: uriString,
            mimeType: "application/json",
            text: JSON.stringify(app, null, 2),
          },
        ],
      };
    }

    throw new Error(`Invalid app URI: ${uriString}`);
  });

  // MCP Prompt explaining Kernel concepts
  server.prompt(
    "kernel-concepts",
    "Explain Kernel's core concepts and capabilities for AI agents working with web automation",
    {
      concept: z
        .enum(["browsers", "apps", "overview"])
        .describe(
          "The specific concept to explain: browsers (sessions), apps (code execution), profiles (browser auth), or overview (all concepts)",
        ),
    },
    async ({ concept }) => {
      const explanations = {
        browsers: `## 🌐 Browsers (Sessions)

**What they are:** Kernel provides serverless browsers-as-a-service that run in isolated cloud environments. Each browser is a complete, sandboxed instance that can automate any website.

**Key capabilities:**
- **Instant launch** - Browsers start in seconds, not minutes
- **Full isolation** - Each browser runs in its own virtual machine
- **Parallel scaling** - Run hundreds or thousands of concurrent browsers
- **Live view** - Human-in-the-loop workflows with real-time browser viewing
- **Replays** - Record and review past browser sessions as videos
- **CDP integration** - Connect with Playwright, Puppeteer, or any CDP-compatible tool
- **Profile persistence** - Save and reuse authentication cookies and login data across sessions

**Use cases:** Web scraping, form automation, testing, data extraction, user journey simulation, and any task requiring browser interaction.

**Persistence options:**
- **Session persistence** - Reuse browser state across hours/days
- **Profile persistence** - Save and reuse authentication cookies and login data`,

        apps: `## 🚀 Apps (Code Execution Platform)

**What they are:** Kernel's app platform lets you deploy, host, and invoke browser automation code in production without managing infrastructure.

**Key capabilities:**
- **Serverless execution** - Deploy automation code that runs on-demand
- **Auto-scaling** - Automatically handles traffic spikes and resource allocation
- **Seamless integration** - Apps can create and manage browsers programmatically
- **Production ready** - Built-in monitoring, logging, and error handling
- **Multiple languages** - Support for Python, TypeScript, and more

**Development workflow:**
1. Write your automation code
2. Deploy to Kernel's platform
3. Invoke via API or MCP tools
4. Monitor execution and results

**Use cases:** Scheduled web scraping, API endpoints for browser automation, complex multi-step workflows, and production automation services.`,

        overview: `## 🎯 Kernel Platform Overview

**What Kernel is:** A developer platform that provides browsers-as-a-service for AI agents to access websites. Our API and MCP server allows web agents to instantly launch browsers in the cloud and automate anything on the internet.

**Core Concepts:**

### 🌐 Browsers (Sessions)
Serverless browsers that run in isolated cloud environments. Each browser can automate any website with full CDP compatibility, live viewing, replay capabilities, and persistent profiles for authentication.

### 🚀 Apps (Code Execution)
Production-ready platform for deploying and hosting browser automation code. Handles auto-scaling, monitoring, and execution without infrastructure management.

**Why developers choose Kernel:**
- **Performance** - Crazy fast browser launch times
- **Developer experience** - Simple APIs and comprehensive tooling
- **Production ready** - Handles bot detection, authentication, scaling, and observability
- **Cost effective** - Only pay for active browser time
- **Reliable** - Built for enterprise-scale automation

**Perfect for:** AI agents, web automation, testing, scraping, form filling, and any task requiring browser interaction.`,
      };

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: explanations[concept],
            },
          },
        ],
      };
    },
  );

  // Search Docs Tool
  server.tool(
    "search_docs",
    "Fast vector search through Kernel platform documentation to find relevant information, guides, tutorials, and API references. Returns ranked documentation chunks with titles, URLs, and content snippets. Use this tool when you need to understand how Kernel features work, troubleshoot issues, or provide accurate information about the platform capabilities.",
    {
      query: z
        .string()
        .describe(
          'Search query to find relevant documentation. Use natural language like "how to deploy an app" or "browser automation examples"',
        ),
    },
    async ({ query }, extra) => {
      if (!process.env.MINTLIFY_ASSISTANT_API_TOKEN) {
        console.error(
          "MINTLIFY_ASSISTANT_API_TOKEN environment variable is not set",
        );
        return {
          content: [
            {
              type: "text",
              text: "Error: MINTLIFY_ASSISTANT_API_TOKEN environment variable is not set",
            },
          ],
        };
      }

      if (!process.env.MINTLIFY_DOMAIN) {
        console.error("MINTLIFY_DOMAIN environment variable is not set");
        return {
          content: [
            {
              type: "text",
              text: "Error: MINTLIFY_DOMAIN environment variable is not set",
            },
          ],
        };
      }

      // Check if query is provided
      if (!query) {
        console.error("No query provided to search_docs tool");
        return {
          content: [
            {
              type: "text",
              text: "Error: No query provided for documentation search",
            },
          ],
        };
      }

      const headers = {
        Authorization: `Bearer ${process.env.MINTLIFY_ASSISTANT_API_TOKEN}`,
        "Content-Type": "application/json",
      };

      const searchBody = {
        query: query,
        pageSize: 10,
      };

      try {
        const searchResponse = await fetch(
          `https://api-dsc.mintlify.com/v1/search/${process.env.MINTLIFY_DOMAIN}`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(searchBody),
          },
        );

        if (!searchResponse.ok) {
          console.error(
            `Failed to search documentation: ${searchResponse.status} ${searchResponse.statusText}`,
          );
          throw new Error(
            `Failed to search documentation: ${searchResponse.status} ${searchResponse.statusText}`,
          );
        }

        const searchResults: MintlifySearchResult[] =
          await searchResponse.json();

        // Format the search results for better readability
        let formattedResults = "# Documentation Search Results\n\n";

        if (searchResults && searchResults.length > 0) {
          searchResults.forEach(
            (result: MintlifySearchResult, index: number) => {
              formattedResults += `## ${index + 1}. ${result.path}\n\n`;
              formattedResults += `${result.content}\n\n`;
              formattedResults += "---\n\n";
            },
          );
        } else {
          formattedResults += "No results found for your query.";
        }

        return {
          content: [
            {
              type: "text",
              text: formattedResults,
            },
          ],
        };
      } catch (error) {
        console.error("Error searching documentation:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error searching documentation: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  );

  // List Apps Tool
  server.tool(
    "list_apps",
    "List all apps deployed in the Kernel platform. Use this to discover available apps, check their versions, or filter by specific criteria. Helpful for understanding what apps are available before invoking actions.",
    {
      app_name: z
        .string()
        .describe(
          'Filter results to show only apps with this exact name (e.g., "my-web-scraper")',
        )
        .optional(),
      version: z
        .string()
        .describe(
          'Filter results to show only apps with this exact version label (e.g., "v1.0.0", "latest")',
        )
        .optional(),
    },
    async ({ app_name, version }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const apps = await client.apps.list({
          ...(app_name && { app_name: app_name }),
          ...(version && { version: version }),
        });

        return {
          content: [
            {
              type: "text",
              text: apps ? JSON.stringify(apps, null, 2) : "No apps found",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching apps: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Invoke Action Tool
  server.tool(
    "invoke_action",
    "Execute a specific action within a Kernel app. This is the primary way to interact with deployed apps - use this to trigger workflows, run computations, or perform operations. The action will run asynchronously and you can track its progress with the returned invocation ID.",
    {
      app_name: z
        .string()
        .describe(
          'Name of the Kernel app (e.g., "my-web-scraper", "data-processor")',
        ),
      action_name: z
        .string()
        .describe(
          'Name of the specific action to invoke within the app (e.g., "scrape_website", "process_data")',
        ),
      payload: z
        .string()
        .describe(
          "JSON string containing parameters for the action. Format depends on the specific action being invoked.",
        )
        .optional(),
      version: z
        .string()
        .describe("Specific version of the app to use")
        .optional(),
    },
    async ({ app_name, action_name, payload, version }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        // Create the invocation
        const invocation = await client.invocations.create({
          app_name: app_name,
          action_name: action_name,
          payload: payload,
          version: version ?? "latest",
          async: true,
        });

        if (!invocation) {
          throw new Error("Failed to create invocation");
        }

        const stream = await client.invocations.follow(invocation.id);
        let finalInvocation = invocation;

        for await (const evt of stream) {
          switch (evt.event) {
            case "error":
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "error",
                        message: "An error occurred during invocation",
                        invocation_id: invocation.id,
                        error: evt,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };

            case "invocation_state":
              finalInvocation = evt.invocation || finalInvocation;

              // Break out of the loop when invocation is complete or failed
              if (
                finalInvocation.status === "succeeded" ||
                finalInvocation.status === "failed"
              ) {
                break;
              }
              break;

            case "log":
              // Ignore logs for now
              break;

            default:
              break;
          }

          // Exit the loop if invocation is in a final state
          if (
            finalInvocation.status === "succeeded" ||
            finalInvocation.status === "failed"
          ) {
            break;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(finalInvocation, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error invoking action: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Get Browser Tool
  server.tool(
    "get_browser",
    "Retrieve detailed information about a specific browser session including its current status, configuration, and metadata. Use this to check if a browser is still active, get its access URLs, or understand its current state before performing operations.",
    {
      session_id: z
        .string()
        .describe(
          "Unique identifier of the browser session to retrieve information about. You can get this from list_browsers or create_browser responses.",
        ),
    },
    async ({ session_id }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const browser = await client.browsers.retrieve(session_id);

        return {
          content: [
            {
              type: "text",
              text: browser
                ? JSON.stringify(browser, null, 2)
                : "Browser session not found",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching browser: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Create Browser Tool
  server.tool(
    "create_browser",
    "Launch a new browser session in the Kernel platform. This creates a managed browser instance that can be used for web automation, testing, or interactive browsing. The browser runs in a secure sandbox environment and can be configured with various options like headless mode, stealth mode, and session recording.",
    {
      headless: z
        .boolean()
        .describe(
          "If true, launches the browser without GUI/VNC access (faster, less resource intensive). Use false for interactive browsing or debugging.",
        )
        .optional(),
      stealth: z
        .boolean()
        .describe(
          "If true, configures browser to avoid detection by anti-bot systems. Recommended for web scraping and automation.",
        )
        .optional(),
      persistence_id: z
        .string()
        .describe(
          "Unique string identifier for browser session persistence. If a browser with this ID exists, Kernel reuses it with all saved state (cookies, authentication, cache). If not found, creates a new browser with this ID for future reuse. Can be any string to match users, environments, websites, etc.",
        )
        .optional(),
      timeout_seconds: z
        .number()
        .describe(
          "The number of seconds of inactivity before the browser session is terminated. Only applicable to non-persistent browsers. Activity includes CDP connections and live view connections. Defaults to 60 seconds.",
        )
        .optional(),
      profile_name: z
        .string()
        .describe(
          "Name of an existing profile to load into this browser session. Use list_profiles to see available profiles. The profile will load all saved cookies, logins, and session data. Cannot be used with profile_id.",
        )
        .optional(),
      profile_id: z
        .string()
        .describe(
          "ID of an existing profile to load into this browser session. The profile will load all saved cookies, logins, and session data. Cannot be used with profile_name.",
        )
        .optional(),
    },
    async (
      {
        headless,
        persistence_id,
        stealth,
        timeout_seconds,
        profile_name,
        profile_id,
      },
      extra,
    ) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      // Validate that only one of profile_name or profile_id is provided
      if (profile_name && profile_id) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Cannot specify both profile_name and profile_id. Please provide only one.",
            },
          ],
        };
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const kernelBrowser = await client.browsers.create({
          ...(headless && { headless: headless }),
          ...(persistence_id && { persistence: { id: persistence_id } }),
          ...(stealth && { stealth: stealth }),
          ...(timeout_seconds && { timeout_seconds: timeout_seconds }),
          ...((profile_name || profile_id) && {
            profile: {
              ...(profile_name && { name: profile_name }),
              ...(profile_id && { id: profile_id }),
              save_changes: false,
            },
          }),
        });

        return {
          content: [
            {
              type: "text",
              text: kernelBrowser
                ? JSON.stringify(kernelBrowser, null, 2)
                : "Failed to create browser session",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating browser: ${error}`,
            },
          ],
        };
      }
    },
  );

  // List Browsers Tool
  server.tool(
    "list_browsers",
    "Retrieve a list of all currently active browser sessions in the Kernel platform. This shows you which browsers are running, their session IDs, creation times, and basic configuration. Use this to discover existing browser sessions before creating new ones or to audit current browser usage.",
    {},
    async (_args, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const browsers = await client.browsers.list();

        if (!browsers || browsers.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No browsers found",
              },
            ],
          };
        }

        const browsersWithoutCdpWsUrl = browsers.map((browser) => {
          return { ...browser, cdp_ws_url: undefined };
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(browsersWithoutCdpWsUrl, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching browsers: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Delete Browser Tool
  server.tool(
    "delete_browser",
    "Permanently terminate and clean up a browser session. This will stop the browser instance, free up resources, and remove any associated data. Use this when you no longer need a browser session or want to clean up after completing automation tasks.",
    {
      session_id: z
        .string()
        .describe(
          "Unique string identifier for browser session. This is the same ID used when creating browsers to maintain state across sessions. You can find this value in the session_id field from list_browsers responses.",
        ),
    },
    async ({ session_id }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        await client.browsers.deleteByID(session_id);

        return {
          content: [
            {
              type: "text",
              text: "Browser session deleted successfully",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting browser: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Get Deployment Tool
  server.tool(
    "get_deployment",
    "Retrieve comprehensive information about a specific deployment including its current status, build logs, configuration, and health metrics. Use this to monitor deployment progress, troubleshoot deployment issues, or verify that an app was deployed successfully.",
    {
      deployment_id: z
        .string()
        .describe(
          "Unique identifier of the deployment to retrieve information about. You can get this from list_deployments responses.",
        ),
    },
    async ({ deployment_id }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const deployment = await client.deployments.retrieve(deployment_id);

        return {
          content: [
            {
              type: "text",
              text: deployment
                ? JSON.stringify(deployment, null, 2)
                : "Deployment not found",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching deployment: ${error}`,
            },
          ],
        };
      }
    },
  );

  // List Deployments Tool
  server.tool(
    "list_deployments",
    "Retrieve a comprehensive list of all deployments in the Kernel platform, with optional filtering by app name. This provides an overview of deployment history, current status, and allows you to track the deployment lifecycle of your apps. Use this to monitor deployment activity or find specific deployments.",
    {
      app_name: z
        .string()
        .describe(
          'Filter results to show only deployments for this specific app name (e.g., "my-web-scraper")',
        ),
    },
    async ({ app_name }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const deployments = await client.deployments.list({
          ...(app_name && { app_name: app_name }),
        });

        return {
          content: [
            {
              type: "text",
              text: deployments
                ? JSON.stringify(deployments, null, 2)
                : "No deployments found",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching deployments: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Setup Profile Tool
  server.tool(
    "setup_profile",
    "Create a new browser profile or update an existing one, and guide the user through the setup process. This tool creates a profile (or uses existing), launches a browser session with save_changes enabled, and provides a live view URL for the user to manually sign into accounts. When the user is done, use the delete_browser tool to close the session and save the profile.",
    {
      profile_name: z
        .string()
        .describe(
          "Name for the profile. Must be 1-255 characters, using letters, numbers, dots, underscores, or hyphens. This will be used to identify the profile in future browser sessions.",
        ),
      update_existing: z
        .boolean()
        .describe(
          "If true and the profile already exists, it will be updated. If false and the profile exists, an error will be returned. Defaults to false to prevent accidental overwrites.",
        )
        .optional()
        .default(false),
    },
    async ({ profile_name, update_existing }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        // Step 1: Check if profile already exists
        const existingProfiles = await client.profiles.list();
        const existingProfile = existingProfiles?.find(
          (p) => p.name === profile_name,
        );

        let profile;
        let isNewProfile = false;

        if (existingProfile) {
          if (!update_existing) {
            return {
              content: [
                {
                  type: "text",
                  text: `⚠️ **Profile "${profile_name}" already exists!**

🔧 **Existing Profile Details:**
- Profile ID: ${existingProfile.id}
- Created: ${new Date(existingProfile.created_at).toLocaleString()}
- Last Used: ${existingProfile.last_used_at ? new Date(existingProfile.last_used_at).toLocaleString() : "Never"}

**Options:**
1. **Update existing profile** - Set update_existing: true to update this profile
2. **Create new profile** - Choose a different name for a new profile

**Suggested alternative names:**
- ${profile_name}-2
- ${profile_name}-new
- ${profile_name}-${new Date().getFullYear()}

To update the existing profile, call setup_profile again with update_existing: true`,
                },
              ],
            };
          } else {
            // Use existing profile for update
            profile = existingProfile;
          }
        } else {
          // Create new profile
          profile = await client.profiles.create({ name: profile_name });
          isNewProfile = true;
        }

        // Step 2: Create a browser session with the profile and save_changes enabled
        const browser = await client.browsers.create({
          stealth: true,
          timeout_seconds: 300, // 5 minutes - enough time for manual profile setup
          profile: {
            name: profile_name,
            save_changes: true,
          },
        });

        // Step 3: Return instructions and live view URL
        const liveViewUrl = browser.browser_live_view_url;
        const sessionId = browser.session_id;

        return {
          content: [
            {
              type: "text",
              text: `Profile "${profile_name}" ${isNewProfile ? "created" : "loaded for update"} successfully!

**Setup Instructions for the user:**

1. **Open the browser session** by clicking this link: [Open Browser Session](${liveViewUrl})

2. **${isNewProfile ? "Sign into accounts" : "Update your accounts"}** - The user should navigate to any websites and sign into the accounts they want to save in this profile (Gmail, social media, work accounts, etc.)

3. **When the user is done setting up**, they should tell you: "I'm done" or "Save my profile" and you should call the delete_browser tool to close the browser session and save the profile.

4. **The profile will be automatically ${isNewProfile ? "saved" : "updated"}** when the browser session closes.

**Profile Details:**
- Profile Name: ${profile_name}
- Profile ID: ${profile.id}
- Session ID: ${sessionId}
- Live View URL: ${liveViewUrl}
${
  !isNewProfile
    ? `- Created: ${new Date(profile.created_at).toLocaleString()}
- Last Used: ${profile.last_used_at ? new Date(profile.last_used_at).toLocaleString() : "Never"}`
    : ""
}

**Future Use:**
Once ${isNewProfile ? "saved" : "updated"}, this profile can be used in any future browser session by specifying:
- Profile name: "${profile_name}" 
- With or without save_changes (read-only vs editable mode)

The profile will load all saved cookies, logins, and session data into new browser sessions!`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting up profile: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  // List Profiles Tool
  server.tool(
    "list_profiles",
    "List all available browser profiles in your Kernel account. Profiles contain saved cookies, logins, and session data that can be loaded into browser sessions.",
    {},
    async (_args, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const profiles = await client.profiles.list();

        return {
          content: [
            {
              type: "text",
              text:
                profiles && profiles.length > 0
                  ? `📋 **Available Profiles (${profiles.length}):**

${profiles
  .map(
    (profile, index) =>
      `${index + 1}. **${profile.name || "Unnamed"}**
   - ID: ${profile.id}
   - Created: ${new Date(profile.created_at).toLocaleString()}
   - Last Used: ${profile.last_used_at ? new Date(profile.last_used_at).toLocaleString() : "Never"}
   - Last Updated: ${profile.updated_at ? new Date(profile.updated_at).toLocaleString() : "Never"}
`,
  )
  .join("\n")}

💡 **Usage:**
- Use profile names in create_browser with the profile parameter
- Set save_changes: true to modify profiles, false for read-only mode`
                  : "No profiles found. Use setup_profile to create your first profile!",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing profiles: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  // Delete Profile Tool
  server.tool(
    "delete_profile",
    "Permanently delete a browser profile and all its associated authentication data. This action cannot be undone, so make sure you no longer need the profile before deleting it.",
    {
      profile_name: z
        .string()
        .describe(
          "Name of the profile to delete. Use list_profiles to see available profiles. Cannot be used with profile_id.",
        )
        .optional(),
      profile_id: z
        .string()
        .describe(
          "ID of the profile to delete. Use list_profiles to see available profiles. Cannot be used with profile_name.",
        )
        .optional(),
    },
    async ({ profile_name, profile_id }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      // Validate that exactly one of profile_name or profile_id is provided
      if (profile_name && profile_id) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Cannot specify both profile_name and profile_id. Please provide only one.",
            },
          ],
        };
      }

      if (!profile_name && !profile_id) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Must specify either profile_name or profile_id.",
            },
          ],
        };
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        // Verify profile exists first
        const existingProfiles = await client.profiles.list();
        const existingProfile = existingProfiles?.find(
          (p) =>
            (profile_name && p.name === profile_name) ||
            (profile_id && p.id === profile_id),
        );

        if (!existingProfile) {
          const identifier = profile_name || profile_id;
          return {
            content: [
              {
                type: "text",
                text: `❌ **Profile "${identifier}" not found!**

Use list_profiles to see available profiles.`,
              },
            ],
          };
        }

        // Delete the profile using either name or ID
        const identifier = profile_name || profile_id;
        if (identifier) {
          await client.profiles.delete(identifier);
        }

        return {
          content: [
            {
              type: "text",
              text: `✅ **Profile "${identifier}" deleted successfully!**

The profile and all its associated authentication data have been permanently removed.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting profile: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  // Get Invocation Tool
  server.tool(
    "get_invocation",
    "Retrieve detailed information about a specific action invocation including its execution status, output data, error messages, and runtime metrics. Use this to check if an invoked action completed successfully, get its results, or troubleshoot failed executions.",
    {
      invocation_id: z
        .string()
        .describe(
          "Unique identifier of the action invocation to retrieve information about. You get this from invoke_action responses.",
        ),
    },
    async ({ invocation_id }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const invocation = await client.invocations.retrieve(invocation_id);

        return {
          content: [
            {
              type: "text",
              text: invocation
                ? JSON.stringify(invocation, null, 2)
                : "Invocation not found",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching invocation: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Execute Playwright Code Tool
  server.tool(
    "execute_playwright_code",
    "Execute Playwright/TypeScript automation code against a fresh Kernel browser session. Creates a new browser, connects via CDP, executes your TypeScript/Playwright code with a `page` object in scope, and returns the result with a video replay. The browser is automatically cleaned up after execution. Perfect for one-off automation tasks, web scraping, testing, and rapid prototyping without deploying a full app.",
    {
      code: z
        .string()
        .describe(
          'Playwright/TypeScript code to execute. The code will have access to a Playwright `page` object and can use async/await. Example: "await page.goto(\\"https://example.com\\"); return await page.title();" Tip: Use `await page._snapshotForAI()` in return statements after other Playwright commands to get a comprehensive snapshot of the page state.',
        ),
    },
    async ({ code }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);
      let kernelBrowser;
      let browser;
      let replay;

      try {
        if (!code || typeof code !== "string") {
          throw new Error("code is required and must be a string");
        }

        // Create a new Kernel browser session
        kernelBrowser = await client.browsers.create({
          stealth: true,
        });

        if (!kernelBrowser || !kernelBrowser.cdp_ws_url) {
          throw new Error("Failed to create browser session");
        }

        // Start replay recording (only available on paid plans)
        try {
          replay = await client.browsers.replays.start(
            kernelBrowser.session_id,
          );
        } catch (replayError) {
          console.log("Replay recording unavailable:", replayError);
          replay = null;
        }

        // Connect via CDP
        browser = await playwright.chromium.connectOverCDP(
          kernelBrowser.cdp_ws_url,
        );
        const context = browser.contexts()[0] || (await browser.newContext());
        const page = context.pages()[0] || (await context.newPage());

        // Wrap user code in an async function
        const tsSource = [
          "export default async function __user_execute(page: any) {",
          code,
          "\n}",
        ].join("\n");

        // Transpile TypeScript to JavaScript
        const transpiled = transpileModule(tsSource, {
          compilerOptions: {
            module: ModuleKind.CommonJS,
            target: ScriptTarget.ES2019,
            esModuleInterop: true,
            moduleResolution: ModuleResolutionKind.Classic,
            isolatedModules: true,
            skipLibCheck: true,
            noEmitOnError: false,
          },
          reportDiagnostics: true,
        });

        if (transpiled.diagnostics && transpiled.diagnostics.length > 0) {
          const formatted = transpiled.diagnostics
            .map((d) =>
              d.messageText && typeof d.messageText === "object"
                ? `${d.code}: ${d.messageText.messageText}`
                : `${d.code}: ${String(d.messageText)}`,
            )
            .join("\n");
          throw new Error(`TypeScript transpile error(s):\n${formatted}`);
        }

        const jsCode: string = transpiled.outputText;

        // Create VM context with page and common globals
        const require = createRequire(import.meta.url);
        const sandbox: Record<string, unknown> = {
          page,
          console,
          module: { exports: {} },
          exports: {},
          require,
          process,
          setTimeout,
          setInterval,
          clearTimeout,
          clearInterval,
        };

        const vmContext = createContext(sandbox);
        const script = new Script(jsCode, {
          filename: "execute_playwright_code.user.ts",
        });
        script.runInContext(vmContext, { timeout: 60_000 });

        // Extract the exported function
        const fn =
          (sandbox.module as { exports?: { default?: unknown } })?.exports
            ?.default ||
          (sandbox.exports as { default?: unknown })?.default ||
          (sandbox.module as { exports?: unknown })?.exports;

        if (typeof fn !== "function") {
          throw new Error("Executed module did not export a callable function");
        }

        // Execute the function
        const result = await fn(page);

        // Stop replay recording
        let replayUrl = null;
        if (replay && kernelBrowser?.session_id) {
          try {
            await client.browsers.replays.stop(replay.replay_id, {
              id: kernelBrowser.session_id,
            });
            // Get the replay URL
            replayUrl = replay.replay_view_url;
          } catch (replayError) {
            console.error("Error stopping replay:", replayError);
          }
        }

        // Clean up browser connection
        if (browser) {
          await browser.close();
        }

        // Delete the Kernel browser session
        if (kernelBrowser?.session_id) {
          await client.browsers.deleteByID(kernelBrowser.session_id);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  result,
                  replay_url: replayUrl,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        // Stop replay on error if it was started
        let replayUrl = null;
        if (replay && kernelBrowser?.session_id) {
          try {
            await client.browsers.replays.stop(replay.replay_id, {
              id: kernelBrowser.session_id,
            });
            replayUrl = replay.replay_view_url;
          } catch (replayError) {
            console.error("Error stopping replay:", replayError);
          }
        }

        // Clean up on error
        try {
          if (browser) {
            await browser.close();
          }
          if (kernelBrowser?.session_id) {
            await client.browsers.deleteByID(kernelBrowser.session_id);
          }
        } catch (cleanupError) {
          console.error("Error during cleanup:", cleanupError);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined,
                  replay_url: replayUrl,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );
});

async function handleAuthenticatedRequest(req: NextRequest): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7).trim()
    : null;
  if (!token) {
    return createAuthErrorResponse(
      "invalid_token",
      "Missing or invalid access token",
    );
  }

  if (!isValidJwtFormat(token)) {
    const authHandler = withMcpAuth(
      handler,
      async () => ({
        token,
        scopes: ["apikey"],
        clientId: "mcp-server",
        extra: { userId: null, clerkToken: null },
      }),
      {
        required: true,
        resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
      },
    );
    return await authHandler(req);
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (!payload.sub) {
      return createAuthErrorResponse(
        "invalid_token",
        "Invalid token: No user ID found in token payload",
      );
    }

    // Create authenticated handler with auth info
    const authHandler = withMcpAuth(
      handler,
      async (_req, _providedToken) => {
        // Return auth info with validated user data
        return {
          token: token, // Use the validated token
          scopes: ["openid"],
          clientId: "mcp-server",
          extra: {
            userId: payload.sub,
            clerkToken: token,
          },
        };
      },
      {
        required: true,
        resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
      },
    );

    return await authHandler(req);
  } catch (authError) {
    return createAuthErrorResponse(
      "invalid_token",
      `Invalid token: ${authError instanceof Error ? authError.message : "Authentication failed"}`,
    );
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return await handleAuthenticatedRequest(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return await handleAuthenticatedRequest(req);
}
