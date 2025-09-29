import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ImageService } from './image-service.js';
import { GenerateImageParamsSchema } from './types.js';

// Server configuration from environment variables
const serverConfig = {
  cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN || '',
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
  defaultModel: process.env.DEFAULT_MODEL || '@cf/black-forest-labs/flux-1-schnell',
};

const imageService = new ImageService(serverConfig);

// Create server instance
const server = new Server(
  {
    name: 'cloudflare-image-mcp',
    version: '0.0.1',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'generate_image',
        description: `Generate an image using Cloudflare Workers AI text-to-image models (configured model: ${serverConfig.defaultModel})`,
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Text description of the image to generate',
            },
            size: {
              type: 'string',
              description: 'Image size in format "widthxheight" (e.g., "1024x1024")',
              default: '1024x1024',
            },
            negativePrompt: {
              type: 'string',
              description: 'Text describing what to avoid in the image',
              default: '',
            },
            steps: {
              type: 'number',
              description: 'Number of diffusion steps (model-dependent limits)',
              default: 4,
            },
            guidance: {
              type: 'number',
              description: 'How closely to follow the prompt (1.0-20.0)',
              default: 7.5,
            },
            seed: {
              type: 'number',
              description: 'Random seed for reproducible results',
            },
                      },
          required: ['prompt'],
        },
      },
      {
        name: 'list_models',
        description: 'List available Cloudflare Workers AI image generation models with their capabilities',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'generate_image') {
      // Validate and parse arguments
      const params = GenerateImageParamsSchema.parse(args);

      // Validate required configuration
      if (!serverConfig.cloudflareApiToken || !serverConfig.cloudflareAccountId) {
        throw new Error(
          'Cloudflare API Token and Account ID must be configured in environment variables'
        );
      }

      if (!params.prompt.trim()) {
        throw new Error('Please provide a prompt for image generation');
      }

      // Generate image
      const result = await imageService.generateImage(params);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${result.error}`,
            },
          ],
          isError: true,
        };
      }

      let responseText = `Image generated successfully for prompt: '${params.prompt}'\n\n`;
      responseText += `![Generated Image](${result.imageUrl})`;

      if (result.ignoredParams && result.ignoredParams.length > 0) {
        responseText += `\n\nNote: The following parameters were ignored because they are not supported by the configured model: ${result.ignoredParams.join(', ')}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    }

    if (name === 'list_models') {
      const modelsInfo = await imageService.listModels();
      return {
        content: [
          {
            type: 'text',
            text: modelsInfo,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Cloudflare Image MCP Server started');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});