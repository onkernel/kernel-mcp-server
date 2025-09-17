import {
  createMcpHandler,
  experimental_withMcpAuth as withMcpAuth,
} from "@vercel/mcp-adapter";
import { verifyToken } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { Kernel } from "@onkernel/sdk";
import { z } from "zod";

// Mintlify Search API types
interface MintlifyChunkMetadata {
  title?: string;
  breadcrumbs?: string[];
  hash?: string;
  [key: string]: unknown;
}

interface MintlifyChunk {
  id: string;
  link: string;
  created_at: string;
  updated_at: string;
  chunk_html?: string;
  metadata?: MintlifyChunkMetadata;
  tracking_id: string;
  time_stamp?: string;
  dataset_id: string;
  weight: number;
  location?: Record<string, unknown>;
  image_urls?: string[];
  tag_set: string[];
  num_value?: number;
}

interface MintlifyChunkWrapper {
  chunk: MintlifyChunk;
  highlights?: string[];
  score: number;
}

interface MintlifyGroup {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  dataset_id: string;
  tracking_id: string;
  metadata: Record<string, unknown>;
  tag_set: string[];
}

interface MintlifySearchResult {
  group: MintlifyGroup;
  chunks: MintlifyChunkWrapper[];
  file_id?: string;
}

interface MintlifySearchResponse {
  id: string;
  results: MintlifySearchResult[];
  corrected_query?: string;
  total_pages: number;
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
  server.resource(
    "profiles",
    "profiles://",
    async (uri, extra) => {
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
              text: profiles ? JSON.stringify(profiles, null, 2) : "No profiles found",
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
    }
  );

  server.resource(
    "browsers",
    "browsers://",
    async (uri, extra) => {
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
              text: browsers ? JSON.stringify(browsers, null, 2) : "No browsers found",
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
    }
  );

  server.resource(
    "apps",
    "apps://",
    async (uri, extra) => {
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
        const app = apps?.find(a => a.app_name === appName);
        
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
    }
  );

  // MCP Prompt explaining Kernel concepts
  server.prompt(
    "kernel-concepts",
    "Explain Kernel's core concepts and capabilities for AI agents working with web automation",
    {
      concept: z
        .enum(["browsers", "apps", "overview"])
        .describe("The specific concept to explain: browsers (sessions), apps (code execution), profiles (browser auth), or overview (all concepts)"),
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

**Perfect for:** AI agents, web automation, testing, scraping, form filling, and any task requiring browser interaction.`
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
    }
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
      if (!process.env.MINTLIFY_API_TOKEN) {
        console.error("MINTLIFY_API_TOKEN environment variable is not set");
        return {
          content: [
            {
              type: "text",
              text: "Error: MINTLIFY_API_TOKEN environment variable is not set",
            },
          ],
        };
      }

      if (!process.env.MINTLIFY_DATASET_ID) {
        console.error("MINTLIFY_DATASET_ID environment variable is not set");
        return {
          content: [
            {
              type: "text",
              text: "Error: MINTLIFY_DATASET_ID environment variable is not set",
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
        accept: "*/*",
        "accept-language": "en-US,en;q=0.6",
        authorization: process.env.MINTLIFY_API_TOKEN,
        "tr-dataset": process.env.MINTLIFY_DATASET_ID,
        "x-api-version": "V2",
        "Content-Type": "application/json",
      };

      const searchBody = {
        query: query,
        search_type: "fulltext",
        extend_results: true,
        highlight_options: {
          highlight_window: 10,
          highlight_max_num: 3,
          highlight_max_length: 5,
          highlight_strategy: "exactmatch",
          highlight_delimiters: ["?", ",", ".", "!", "\n", " "],
          highlight_results: true,
        },
        score_threshold: 0.1, // Lower threshold for broader results
        filters: {
          must_not: [
            {
              field: "tag_set",
              match: ["code"], // Exclude code blocks as suggested
            },
          ],
        },
        page_size: 10,
        group_size: 5, // More chunks per group for comprehensive results
        get_total_pages: true,
        remove_stop_words: true,
        slim_chunks: false, // Get full chunk data
        use_quote_negated_terms: true,
        scoring_options: {
          semantic_boost: {
            phrase: query,
            distance_factor: 1.2,
          },
        },
        sort_options: {
          use_weights: true,
        },
        typo_options: {
          correct_typos: true,
          prioritize_domain_specifc_words: true,
          one_typo_word_range: {
            min: 4,
            max: 8,
          },
          two_typo_word_range: {
            min: 8,
            max: 12,
          },
        },
      };

      try {
        const searchResponse = await fetch(
          "https://api.mintlifytrieve.com/api/chunk_group/group_oriented_search",
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

        const searchResults: MintlifySearchResponse =
          await searchResponse.json();

        // Format the search results for better readability
        let formattedResults = "# Documentation Search Results\n\n";

        if (searchResults.results && searchResults.results.length > 0) {
          searchResults.results.forEach(
            (result: MintlifySearchResult, resultIndex: number) => {
              if (result.chunks && result.chunks.length > 0) {
                const groupName =
                  result.group?.name || `Result Group ${resultIndex + 1}`;
                formattedResults += `## ${groupName}\n\n`;

                result.chunks.forEach(
                  (chunkWrapper: MintlifyChunkWrapper, chunkIndex: number) => {
                    const chunk = chunkWrapper.chunk;
                    const title = chunk.metadata?.title || "Untitled";
                    formattedResults += `### ${chunkIndex + 1}. ${title}\n\n`;

                    // Add breadcrumb navigation if available
                    if (
                      chunk.metadata?.breadcrumbs &&
                      chunk.metadata.breadcrumbs.length > 0
                    ) {
                      formattedResults += `**Navigation:** ${chunk.metadata.breadcrumbs.join(" > ")}\n\n`;
                    }

                    // Add score for relevance indication
                    formattedResults += `**Relevance Score:** ${chunkWrapper.score.toFixed(3)}\n\n`;

                    if (chunk.chunk_html) {
                      // Remove HTML tags for cleaner text
                      const cleanText = chunk.chunk_html.replace(
                        /<[^>]*>/g,
                        "",
                      );
                      formattedResults += `${cleanText}\n\n`;
                    }

                    if (
                      chunkWrapper.highlights &&
                      chunkWrapper.highlights.length > 0
                    ) {
                      formattedResults += `**Highlights:** ${chunkWrapper.highlights.join(", ")}\n\n`;
                    }

                    formattedResults += "---\n\n";
                  },
                );
              }
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
              text: apps
                ? JSON.stringify(apps, null, 2)
                : "No apps found",
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
          "Name of an existing profile to load into this browser session. Use list_profiles to see available profiles. The profile will load all saved cookies, logins, and session data.",
        )
        .optional(),
    },
    async (
      { headless, persistence_id, stealth, timeout_seconds, profile_name },
      extra,
    ) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        const kernelBrowser = await client.browsers.create({
          ...(headless && { headless: headless }),
          ...(persistence_id && { persistence: { id: persistence_id } }),
          ...(stealth && { stealth: stealth }),
          ...(timeout_seconds && { timeout_seconds: timeout_seconds }),
          ...(profile_name && { profile: { name: profile_name, save_changes: false } }),
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

        const browsersWithoutCdpWsUrl = browsers.map((browser) => {
          return { ...browser, cdp_ws_url: undefined };
        });

        return {
          content: [
            {
              type: "text",
              text: browsersWithoutCdpWsUrl
                ? JSON.stringify(browsersWithoutCdpWsUrl, null, 2)
                : "No browsers found",
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
        .describe("If true and the profile already exists, it will be updated. If false and the profile exists, an error will be returned. Defaults to false to prevent accidental overwrites.")
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
        const existingProfile = existingProfiles?.find(p => p.name === profile_name);

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
- Last Used: ${existingProfile.last_used_at ? new Date(existingProfile.last_used_at).toLocaleString() : 'Never'}

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
              text: `Profile "${profile_name}" ${isNewProfile ? 'created' : 'loaded for update'} successfully!

**Setup Instructions for the user:**

1. **Open the browser session** by clicking this link: [Open Browser Session](${liveViewUrl})

2. **${isNewProfile ? 'Sign into accounts' : 'Update your accounts'}** - The user should navigate to any websites and sign into the accounts they want to save in this profile (Gmail, social media, work accounts, etc.)

3. **When the user is done setting up**, they should tell you: "I'm done" or "Save my profile" and you should call the delete_browser tool to close the browser session and save the profile.

4. **The profile will be automatically ${isNewProfile ? 'saved' : 'updated'}** when the browser session closes.

**Profile Details:**
- Profile Name: ${profile_name}
- Profile ID: ${profile.id}
- Session ID: ${sessionId}
- Live View URL: ${liveViewUrl}
${!isNewProfile ? `- Created: ${new Date(profile.created_at).toLocaleString()}
- Last Used: ${profile.last_used_at ? new Date(profile.last_used_at).toLocaleString() : 'Never'}` : ''}

**Future Use:**
Once ${isNewProfile ? 'saved' : 'updated'}, this profile can be used in any future browser session by specifying:
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
              text: profiles && profiles.length > 0
                ? `📋 **Available Profiles (${profiles.length}):**

${profiles.map((profile, index) => 
  `${index + 1}. **${profile.name || 'Unnamed'}**
   - ID: ${profile.id}
   - Created: ${new Date(profile.created_at).toLocaleString()}
   - Last Used: ${profile.last_used_at ? new Date(profile.last_used_at).toLocaleString() : 'Never'}
   - Last Updated: ${profile.updated_at ? new Date(profile.updated_at).toLocaleString() : 'Never'}
`).join('\n')}

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
          "Name of the profile to delete. Use list_profiles to see available profiles.",
        ),
    },
    async ({ profile_name }, extra) => {
      if (!extra.authInfo) {
        throw new Error("Authentication required");
      }

      const client = createKernelClient(extra.authInfo.token);

      try {
        // Verify profile exists first
        const existingProfiles = await client.profiles.list();
        const existingProfile = existingProfiles?.find(p => p.name === profile_name);

        if (!existingProfile) {
          return {
            content: [
              {
                type: "text",
                text: `❌ **Profile "${profile_name}" not found!**

Use list_profiles to see available profiles.`,
              },
            ],
          };
        }

        // Delete the profile
        await client.profiles.delete(profile_name);

        return {
          content: [
            {
              type: "text",
              text: `✅ **Profile "${profile_name}" deleted successfully!**

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
});

async function handleAuthenticatedRequest(req: NextRequest): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  let token: string | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  }

  if (!token) {
    return createAuthErrorResponse(
      "invalid_token",
      "Missing or invalid access token",
    );
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
