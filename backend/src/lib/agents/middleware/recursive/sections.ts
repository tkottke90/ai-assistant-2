import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseError } from "@tkottke90/js-errors";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { Logger } from "winston";

export const ATTR_PREFIX = "@_";
export const TEXT_NODE_KEY = "#text";

const XML_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  textNodeName: TEXT_NODE_KEY,
}

// ─── TTL helpers ─────────────────────────────────────────────────────────────

export function computeEffectiveTTL(lastSelectedTurn: number, initialTTL: number, turnCount: number): number {
  return initialTTL - (turnCount - lastSelectedTurn);
}

export function isExpired(lastSelectedTurn: number, initialTTL: number, turnCount: number): boolean {
  return computeEffectiveTTL(lastSelectedTurn, initialTTL, turnCount) <= 0;
}

// ─── Default TTLs ─────────────────────────────────────────────────────────────

export const DEFAULT_TTL: Record<string, number> = {
  tool: 10,
  text: 5,
  ephemeral: 2,
};

// ─── BaseSection ─────────────────────────────────────────────────────────────

export class BaseSection {
  type = 'text';
  lastSelectedTurn: number;
  initialTTL: number;
  protected _sections: Map<string, BaseSection> = new Map();

  constructor(
    readonly name: string,
    public description: string,
    protected _content: string = '',
    lastSelectedTurn: number = 0,
    initialTTL: number = DEFAULT_TTL.text,
  ) {
    this.lastSelectedTurn = lastSelectedTurn;
    this.initialTTL = initialTTL;
  }

  get content() {
    return this._content;
  }

  set content(data: string) {
    this._content = data;
  }

  static fromXML(xml: Record<string, any>) {
    const parsed: Record<string, any> = {
      ...this.fromAttribute("@_type", xml, "text"),
      ...this.fromAttribute("@_name", xml),
      ...this.fromAttribute("@_description", xml, ""),
      ...this.fromAttribute("@_lastSelectedTurn", xml, 0),
      ...this.fromAttribute("@_initialTTL", xml, DEFAULT_TTL.text),
      content: this.fromTextNode(xml),
    };

    const section = new BaseSection(
      parsed.name,
      parsed.description,
      parsed.content,
      Number(parsed.lastSelectedTurn),
      Number(parsed.initialTTL),
    );

    const rawChildren = xml.section;
    if (rawChildren) {
      const childArray = Array.isArray(rawChildren) ? rawChildren : [rawChildren];
      for (const childXml of childArray) {
        const child = childXml['@_type'] === 'tool'
          ? ToolSection.fromXML(childXml)
          : BaseSection.fromXML(childXml);
        section._sections.set(child.name, child);
      }
    }

    return section;
  }

  static fromAttribute(key: string, data: Record<string, any>, defaultValue: any = null) {
    if (!key.startsWith(ATTR_PREFIX)) {
      throw new Error(`Attribute key must start with ${ATTR_PREFIX}`);
    }

    const keyPart = key.slice(ATTR_PREFIX.length);

    if (!(key in data)) {
      return { [keyPart]: defaultValue };
    }

    return {
      [keyPart]: data[key],
    };
  }

  static fromTextNode(data: Record<string, any>) {
    return data[TEXT_NODE_KEY] ?? '';
  }

  static toAttribute(key: string, value: any) {
    return { [`${ATTR_PREFIX}${key}`]: value };
  }

  static toTextNode(value: string) {
    return { [TEXT_NODE_KEY]: value };
  }

  addSection(section: BaseSection) {
    this._sections.set(section.name, section);
  }

  async decomposeSection(
    summarize: (content: string) => Promise<string>,
    split: (content: string) => Promise<BaseSection[]>,
    maxTokens: number,
    logger: Logger,
  ) {
    if (this.size < maxTokens) {
      return; // Return early if the section is already within the token limit
    }

    logger

    // Clone the original content before decomposition
    // so that we have a fallback in case something goes wrong
    const originalContent = `${this.content}`;

    try {
      logger.info('Summarizing ')
      this.content = await summarize(this.content);
  
      const childSections = await split(this.content);

      if (childSections.length === 0) {
        logger.warn('Split function returned no sections, reverting to original content');
        this.content = originalContent;
        return;
      }

      childSections.forEach(section => this.addSection(section));
    } catch (err) {
      const error = BaseError.fromCatch(err);

      logger.error(error.toString());
    }

  }

  getSection(sectionName: string) {
    return this._sections.get(sectionName);
  }

  getAllSections() {
    return Array.from(this._sections.values());
  }

  get hasChildren() {
    return this._sections.size > 0;
  }

  removeSection(sectionName: string) {
    this._sections.delete(sectionName);
  }

  get size(): number {
    if (this.hasChildren) {
      return Array
        .from(this._sections.values())
        .reduce<number>((sum, section) => sum + section.size, 0);
    } else {
      return this.content.length;
    }
  }

  toXML() {
    const xml: Record<string, any> = {
      ...BaseSection.toAttribute("type", this.type),
      ...BaseSection.toAttribute("name", this.name),
      ...BaseSection.toAttribute("description", this.description),
      ...BaseSection.toAttribute("lastSelectedTurn", this.lastSelectedTurn),
      ...BaseSection.toAttribute("initialTTL", this.initialTTL),
      ...BaseSection.toTextNode(this._content),
    };

    if (this._sections.size > 0) {
      // Child TOC — lightweight summary for navigation
      xml.toc = {
        entry: Array.from(this._sections.values()).map(child => ({
          ...BaseSection.toAttribute("name", child.name),
          ...BaseSection.toAttribute("description", child.description),
        })),
      };
      // Nested sections — recursive
      xml.section = Array.from(this._sections.values()).map(child => child.toXML());
    }

    return xml;
  }
}

export class ToolSection extends BaseSection {
  type = 'tool';
  private invocations: Array<{ timestamp: string, args: Record<string, any>, result: any }> = [];

  constructor(toolName: string, description: string, lastSelectedTurn: number = 0, initialTTL: number = DEFAULT_TTL.tool) {
    super(`tool:${toolName}`, description, '', lastSelectedTurn, initialTTL);
  }

  addInvocation(timestamp: string, args: Record<string, any>, result: any) {
    this.invocations.push({ timestamp, args, result });
  }

  get content() {
    const builder = new XMLBuilder({
      ...XML_OPTIONS,
      format: true,
      suppressEmptyNode: true,
    });

    return builder.build(this.toXML());
  }

  get hasChildren() { return false; }

  set content(data: string) {
    this._content = data;
  }

  static fromXML(xml: Record<string, any>) {
    const base = super.fromXML(xml);
    const section = new ToolSection(
      base.name.replace(/^tool:/, ''),
      base.description,
      base.lastSelectedTurn,
      base.initialTTL,
    );

    if (!xml.invocations?.invocation) return section;

    const raw = xml.invocations.invocation;
    const invocationList = Array.isArray(raw) ? raw : [raw];

    invocationList.forEach((invocation: any) => {
      const args = Array.isArray(invocation.args) ? invocation.args : [invocation.args].filter(Boolean);

      console.assert(invocation["@_timestamp"], "Invocation must have a timestamp");
      console.assert(args.every((arg: any) => arg["@_name"] && arg[TEXT_NODE_KEY] !== undefined), "Each arg must have a name and content");

      section.addInvocation(
        invocation["@_timestamp"],
        Object.fromEntries(args.map((arg: any) => [arg["@_name"], BaseSection.fromTextNode(arg)])),
        invocation.result
      );
    });

    return section;
  }

  toXML() {
    const output = {
      ...super.toXML(),
      ...BaseSection.toTextNode(''),
      invocations: {
        invocation: this.invocations.map((inv, index) => ({
          ...BaseSection.toAttribute("index", index),
          ...BaseSection.toAttribute("timestamp", inv.timestamp),
          args: Object.entries(inv.args).map(([argName, argValue]) => ({
            ...BaseSection.toAttribute("name", argName),
            ...BaseSection.toTextNode(typeof argValue === 'object' && argValue !== null ? JSON.stringify(argValue) : String(argValue)),
          })),
          result: inv.result,
        }))
      },
    };

    console.assert(output.invocations.invocation.every(inv => (inv as any)["@_timestamp"]), "Each invocation must have a timestamp, args, and result");

    return output;
  }
}