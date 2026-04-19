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

  // ─── Layer 1a: TTL, pruning, credits ───────────────────────────────────────

  describe('prune', () => {
    it('should move an expired section to the graveyard', () => {
      // lastSelectedTurn=0, initialTTL=5 → expires at turnCount=5
      scratchpad.addSection(new BaseSection('old-notes', 'some notes', 'content', 0, 5));
      const { pruned, tombstonesPruned } = scratchpad.prune(5, 30);
      expect(pruned).to.equal(1);
      expect(tombstonesPruned).to.equal(0);
      expect(scratchpad.getSection('old-notes')).to.be.undefined;
      const graves = scratchpad.graveyardList();
      expect(graves).to.have.lengthOf(1);
      expect(graves[0].name).to.equal('old-notes');
      expect(graves[0].description).to.equal('some notes');
      expect(graves[0].createdAtTurn).to.equal(5);
    });

    it('should not prune sections that are still alive', () => {
      scratchpad.addSection(new BaseSection('alive', 'stays', 'content', 5, 10));
      const { pruned } = scratchpad.prune(10, 30); // effectiveTTL = 10-(10-5) = 5 → alive
      expect(pruned).to.equal(0);
      expect(scratchpad.getSection('alive')).to.exist;
    });

    it('should prune tombstones that have exceeded graveyardTTL', () => {
      scratchpad.addSection(new BaseSection('stale', 'old', 'content', 0, 1));
      scratchpad.prune(1, 2); // moves to graveyard, createdAtTurn=1
      // At turnCount=4, tombstoneEffectiveTTL = 2 - (4-1) = -1 → prune
      const { tombstonesPruned } = scratchpad.prune(4, 2);
      expect(tombstonesPruned).to.equal(1);
      expect(scratchpad.graveyardList()).to.have.lengthOf(0);
    });

    it('should keep tombstones that have not yet exceeded graveyardTTL', () => {
      scratchpad.addSection(new BaseSection('fresh', 'recent', 'content', 0, 1));
      scratchpad.prune(1, 10); // createdAtTurn=1, graveyardTTL=10
      const { tombstonesPruned } = scratchpad.prune(5, 10); // tombstoneEffectiveTTL = 10-(5-1) = 6 → keep
      expect(tombstonesPruned).to.equal(0);
      expect(scratchpad.graveyardList()).to.have.lengthOf(1);
    });
  });

  describe('applySelectionCredits', () => {
    it('should increment lastSelectedTurn by selectionCredit for all live sections', () => {
      const section = new BaseSection('s', 'desc', 'content', 5, 10);
      scratchpad.addSection(section);
      scratchpad.applySelectionCredits(7, 2, 10);
      expect(section.lastSelectedTurn).to.equal(7);
    });

    it('should cap lastSelectedTurn at turnCount + creditCap', () => {
      const section = new BaseSection('s', 'desc', 'content', 10, 10);
      scratchpad.addSection(section);
      // turnCount=7, credit=5, cap=3 → max = 7+3=10, 10+5=15 → capped at 10
      scratchpad.applySelectionCredits(7, 5, 3);
      expect(section.lastSelectedTurn).to.equal(10);
    });
  });

  describe('graveyard XML round-trip', () => {
    it('should serialize and restore graveyard entries via toXML/fromXML', () => {
      scratchpad.addSection(new BaseSection('early-section', 'An early note', 'data', 0, 1));
      scratchpad.prune(1, 30); // moves early-section to graveyard with createdAtTurn=1
      const xml = scratchpad.toXML();
      const restored = Scratchpad.fromXML(xml);
      const graves = restored.graveyardList();
      expect(graves).to.have.lengthOf(1);
      expect(graves[0].name).to.equal('early-section');
      expect(graves[0].description).to.equal('An early note');
      expect(graves[0].createdAtTurn).to.equal(1);
    });

    it('should not include a graveyard block in XML when the graveyard is empty', () => {
      scratchpad.addSection(new BaseSection('live', 'desc', 'content', 0, 10));
      const xml = scratchpad.toXML();
      expect(xml).not.to.include('graveyard');
    });
  });
});