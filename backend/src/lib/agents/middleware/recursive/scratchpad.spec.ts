import { expect } from 'chai';
import { XMLParser } from 'fast-xml-parser';
import { Scratchpad } from './scratchpad.js';
import { BaseSection, ToolSection } from './sections.js';

describe('Recursive Middleware - Scratchpad', () => {
  let scratchpad: Scratchpad;

  beforeEach(() => {
    scratchpad = new Scratchpad();
  });

  describe('addSection', () => {
    it('should add a section and return it', () => {
      const section = new BaseSection('test', 'A test section', 'hello');
      const result = scratchpad.addSection(section);
      expect(result).to.equal(scratchpad.getSection('test'));
    });
  });

  describe('appendSection', () => {
    it('should create a new section if it does not exist', () => {
      scratchpad.appendSection('notes', ' world');
      expect(scratchpad.getSection('notes')).to.exist;
    });

    it('should append to existing section content', () => {
      scratchpad.appendSection('notes', 'hello');
      scratchpad.appendSection('notes', ' world');
      expect(scratchpad.getSection('notes')?.content).to.equal('hello world');
    });
  });

  describe('toXML', () => {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

    it('should return a valid XML string for an empty scratchpad', () => {
      const xml = scratchpad.toXML();
      expect(xml).to.be.a('string').and.include('<scratchpad>');
      expect(() => parser.parse(xml)).not.to.throw();
    });

    it('should include section name and description in the TOC block', () => {
      scratchpad.addSection(new BaseSection('context', 'Background info', 'some content'));
      const xml = scratchpad.toXML();
      const tocBlock = xml.slice(0, xml.indexOf('</toc>'));
      expect(tocBlock).to.include('context');
      expect(tocBlock).to.include('Background info');
    });

    it('should include section content in the sections block', () => {
      scratchpad.addSection(new BaseSection('context', 'Background info', 'some content'));
      const xml = scratchpad.toXML();
      expect(xml).to.include('some content');
    });

    it('should not include section content in the TOC block', () => {
      scratchpad.addSection(new BaseSection('sec', 'A section', 'UNIQUE_CONTENT_MARKER'));
      const xml = scratchpad.toXML();
      const tocBlock = xml.slice(0, xml.indexOf('</toc>'));
      expect(tocBlock).not.to.include('UNIQUE_CONTENT_MARKER');
    });

    it('should list multiple sections in insertion order', () => {
      scratchpad.addSection(new BaseSection('alpha', 'First', 'content a'));
      scratchpad.addSection(new BaseSection('beta', 'Second', 'content b'));
      const xml = scratchpad.toXML();
      expect(xml.indexOf('alpha')).to.be.lessThan(xml.indexOf('beta'));
    });

    it('should include sections with empty content without dropping the element', () => {
      scratchpad.addSection(new BaseSection('empty-sec', 'Empty section', ''));
      const xml = scratchpad.toXML();
      expect(xml).to.include('name="empty-sec"');
    });

    it('should produce valid XML when section content contains special characters', () => {
      scratchpad.addSection(new BaseSection('code', 'Code block', 'if (a < b && c > 0)'));
      const xml = scratchpad.toXML();
      expect(() => parser.parse(xml)).not.to.throw();
    });

    it('should reflect the latest content after a section is overwritten', () => {
      scratchpad.addSection(new BaseSection('k', 'Old description', 'old content'));
      scratchpad.addSection(new BaseSection('k', 'New description', 'new content'));
      const xml = scratchpad.toXML();
      expect(xml).to.include('new content');
      expect(xml).not.to.include('old content');
    });

    it('should serialize a ToolSection with invocations and produce valid XML', () => {
      const tool = new ToolSection('search', 'Performs a search');
      tool.addInvocation('2026-03-20T00:00:00Z', { query: 'test' }, 'found it');
      scratchpad.addSection(tool);
      const xml = scratchpad.toXML();
      expect(() => parser.parse(xml)).not.to.throw();
      expect(xml).to.include('type="tool"');
    });
  });
});