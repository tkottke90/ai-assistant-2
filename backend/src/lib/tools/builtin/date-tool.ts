import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const FormatEnum = z.enum(['human', 'human-date', 'iso', 'iso-date']);
type Format = z.infer<typeof FormatEnum>;

function formatDate(format: Format): string {
  const now = new Date();
  switch (format) {
    case 'human':      return now.toLocaleString();
    case 'human-date': return now.toLocaleDateString();
    case 'iso':        return now.toISOString();
    case 'iso-date':   return now.toISOString().split('T')[0];
  }
}

export function createDateTool() {
  return tool(
    async (input) => {
      const format = input.format ?? 'human';
      return JSON.stringify({
        success: true,
        date: formatDate(format),
        format,
      });
    },
    {
      name: 'get_date',
      description:
        'Get the current date and/or time. Use this whenever you need to know what the current date or time is. ' +
        'Supports multiple output formats: "human" (locale date-time), "human-date" (locale date only), ' +
        '"iso" (ISO 8601 date-time), and "iso-date" (ISO 8601 date only).',
      schema: z.object({
        format: FormatEnum.default('human').describe(
          'Output format: "human" (e.g. 10/01/2027, 9:48:00 AM), "human-date" (e.g. 10/01/2027), ' +
          '"iso" (e.g. 2027-10-01T09:48:00.000Z), "iso-date" (e.g. 2027-10-01). Defaults to "human".'
        ),
      }),
    }
  );
}
