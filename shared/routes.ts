import { z } from 'zod';
import { searchServiceSchema, createServiceSchema } from './schema';

export const api = {
  services: {
    search: {
      method: 'POST' as const,
      path: '/api/services/search' as const,
      input: searchServiceSchema,
      responses: {
        200: z.any(), // Passes through WipTool response
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/services' as const,
      input: createServiceSchema,
      responses: {
        201: z.any(),
        400: z.any()
      }
    }
  },
  businessUnits: {
    list: {
      method: 'GET' as const,
      path: '/api/business-units' as const,
      responses: {
        200: z.any()
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
