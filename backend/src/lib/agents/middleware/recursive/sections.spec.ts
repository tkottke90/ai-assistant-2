import { expect } from 'chai';
import { ATTR_PREFIX, BaseSection, TEXT_NODE_KEY, ToolSection } from './sections.js';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

describe('Recursive Middleware - BaseSection', () => {

  describe('constructor', () => {
    it('should set name, description, and content from arguments', () => {
      // Act
      const section = new BaseSection('intro', 'Introduction section', 'Hello world');
      // Assert
      expect(section.name).to.equal('intro');
      expect(section.description).to.equal('Introduction section');
      expect(section.content).to.equal('Hello world');
    });

    it('should default content to empty string when not provided', () => {
      // Act
      const section = new BaseSection('intro', 'Introduction section');
      // Assert
      expect(section.content).to.equal('');
    });

    it('should have type set to "text"', () => {
      // Act
      const section = new BaseSection('intro', 'Description');
      // Assert
      expect(section.type).to.equal('text');
    });
  });

  describe('fromAttribute', () => {
    it('should throw when key does not start with "@_"', () => {
      // Act + Assert
      expect(() => BaseSection.fromAttribute('type', { '@_type': 'text' }))
        .to.throw(`Attribute key must start with ${ATTR_PREFIX}`);
    });

    it('should return an object with the stripped key and its value', () => {
      // Act
      const result = BaseSection.fromAttribute('@_type', { '@_type': 'text' });
      // Assert
      expect(result).to.deep.equal({ type: 'text' });
    });

    it('should apply defaultValue when the key is absent from data', () => {
      // Act
      const result = BaseSection.fromAttribute('@_type', {}, 'text');
      // Assert
      expect(result).to.deep.equal({ type: 'text' });
    });

    it('should return null when key is absent and no defaultValue is provided', () => {
      // Act
      const result = BaseSection.fromAttribute('@_name', {});
      // Assert
      expect(result).to.deep.equal({ name: null });
    });
  });

  describe('fromTextNode', () => {
    it('should return the value at the "#text" key', () => {
      // Act
      const result = BaseSection.fromTextNode({ '#text': 'Hello world' });
      // Assert
      expect(result).to.equal('Hello world');
    });

    it('should return empty string when "#text" key is absent', () => {
      // Act
      const result = BaseSection.fromTextNode({});
      // Assert
      expect(result).to.equal('');
    });

    it('should return empty string when "#text" value is null', () => {
      // Act
      const result = BaseSection.fromTextNode({ '#text': null });
      // Assert
      expect(result).to.equal('');
    });
  });

  describe('fromXML', () => {
    it('should return a BaseSection instance with the correct properties', () => {
      // Arrange
      const xml = {
        '@_type': 'text',
        '@_name': 'intro',
        '@_description': 'Introduction',
        '#text': 'Hello world',
      };
      // Act
      const section = BaseSection.fromXML(xml);
      // Assert
      expect(section).to.be.instanceOf(BaseSection);
      expect(section.name).to.equal('intro');
      expect(section.description).to.equal('Introduction');
      expect(section.content).to.equal('Hello world');
    });

    it('should default content to empty string when "#text" is absent', () => {
      // Arrange
      const xml = { '@_type': 'text', '@_name': 'intro', '@_description': 'Introduction' };
      // Act
      const section = BaseSection.fromXML(xml);
      // Assert
      expect(section.content).to.equal('');
    });

    it('should default description to empty string when "@_description" is absent', () => {
      // Arrange
      const xml = { '@_type': 'text', '@_name': 'intro', '#text': 'content' };
      // Act
      const section = BaseSection.fromXML(xml);
      // Assert
      expect(section.description).to.equal('');
    });
  });

  describe('toAttribute', () => {
    it('should return an object with "@_"-prefixed key for a string value', () => {
      // Act + Assert
      expect(BaseSection.toAttribute('type', 'text')).to.deep.equal({ '@_type': 'text' });
    });

    it('should return an object with "@_"-prefixed key for a numeric value', () => {
      // Act + Assert
      expect(BaseSection.toAttribute('index', 0)).to.deep.equal({ '@_index': 0 });
    });

    it('should return an object with "@_"-prefixed key for a boolean value', () => {
      // Act + Assert
      expect(BaseSection.toAttribute('active', true)).to.deep.equal({ '@_active': true });
    });
  });

  describe('toTextNode', () => {
    it('should return an object with "#text" key for a given string', () => {
      // Act + Assert
      expect(BaseSection.toTextNode('Hello')).to.deep.equal({ '#text': 'Hello' });
    });

    it('should return an object with "#text" key for an empty string', () => {
      // Act + Assert
      expect(BaseSection.toTextNode('')).to.deep.equal({ '#text': '' });
    });
  });

  describe('toXML', () => {
    let section: BaseSection;

    beforeEach(() => {
      section = new BaseSection('intro', 'Introduction', 'Hello world');
    });

    it('should include @_type set to "text"', () => {
      // Act
      const xml: any = section.toXML();
      // Assert
      expect(xml['@_type']).to.equal('text');
    });

    it('should include @_name matching the instance name', () => {
      // Act
      const xml: any = section.toXML();
      // Assert
      expect(xml['@_name']).to.equal('intro');
    });

    it('should include @_description matching the instance description', () => {
      // Act
      const xml: any = section.toXML();
      // Assert
      expect(xml['@_description']).to.equal('Introduction');
    });

    it('should include #text matching the instance content', () => {
      // Act
      const xml = section.toXML();
      // Assert
      expect(xml['#text']).to.equal('Hello world');
    });

    it('should produce output compatible with fromXML (round-trip)', () => {
      // Act
      const xml = section.toXML();
      const restored = BaseSection.fromXML(xml);
      // Assert
      expect(restored.name).to.equal(section.name);
      expect(restored.description).to.equal(section.description);
      expect(restored.content).to.equal(section.content);
    });
  });
});

describe('Recursive Middleware - ToolSection', () => {

  describe('constructor', () => {
    it('should prefix name with "tool:"', () => {
      // Act
      const section = new ToolSection('search', 'Searches the web');
      // Assert
      expect(section.name).to.equal('tool:search');
    });

    it('should set description', () => {
      // Act
      const section = new ToolSection('search', 'Searches the web');
      // Assert
      expect(section.description).to.equal('Searches the web');
    });

    it('should have type set to "tool"', () => {
      // Act
      const section = new ToolSection('search', 'Searches the web');
      // Assert
      expect(section.type).to.equal('tool');
    });

    it('should initialise with no invocations', () => {
      // Act
      const section = new ToolSection('search', 'desc');
      // Assert
      expect(section.toXML().invocations).to.deep.equal([]);
    });
  });

  describe('addInvocation', () => {
    it('should add a single invocation', () => {
      // Arrange
      const section = new ToolSection('search', 'desc');
      // Act
      section.addInvocation('2026-01-01T00:00:00Z', { query: 'hello' }, 'result-1');
      const xml: any = section.toXML();
      // Assert
      expect(xml.invocations).to.have.length(1);
    });

    it('should accumulate multiple invocations in insertion order', () => {
      // Arrange
      const section = new ToolSection('search', 'desc');
      // Act
      section.addInvocation('2026-01-01T00:00:00Z', { query: 'a' }, 'r1');
      section.addInvocation('2026-01-01T00:01:00Z', { query: 'b' }, 'r2');
      const xml: any = section.toXML();
      // Assert
      expect(xml.invocations).to.have.length(2);
      expect(xml.invocations[0]['@_index']).to.equal(0);
      expect(xml.invocations[1]['@_index']).to.equal(1);
    });

    it('should store args and result on the invocation', () => {
      // Arrange
      const section = new ToolSection('search', 'desc');
      // Act
      section.addInvocation('ts', { query: 'hello', limit: '5' }, 'my-result');
      const xml: any = section.toXML();
      // Assert
      expect(xml.invocations[0].result).to.equal('my-result');
      expect(xml.invocations[0].args).to.have.length(2);
    });
  });

  describe('fromXML', () => {
    describe('array invocations', () => {
      it('should return a ToolSection instance', () => {
        // Arrange
        const xml = {
          '@_type': 'tool',
          '@_name': 'tool:search',
          '@_description': 'desc',
          invocations: [{ '@_timestamp': 'ts1', args: [{ '@_name': 'query', value: 'hello' }], result: 'ok' }],
        };
        // Act + Assert
        expect(ToolSection.fromXML(xml)).to.be.instanceOf(ToolSection);
      });

      it('should preserve the "tool:" prefix on name', () => {
        // Arrange
        const xml = { '@_name': 'tool:search', '@_description': 'desc', invocations: [] };
        // Act
        const section = ToolSection.fromXML(xml);
        // Assert
        expect(section.name).to.equal('tool:search');
      });

      it('should parse timestamp from @_timestamp attribute', () => {
        // Arrange
        const xml = {
          '@_name': 'tool:search',
          '@_description': 'desc',
          invocations: [{ '@_timestamp': '2026-01-01T00:00:00Z', args: [], result: null }],
        };
        // Act
        const section = ToolSection.fromXML(xml);
        const out: any = section.toXML();
        // Assert
        expect(out.invocations[0]['@_timestamp']).to.equal('2026-01-01T00:00:00Z');
      });

      it('should reconstruct args map from @_name and value', () => {
        // Arrange
        const xml = {
          '@_name': 'tool:search',
          '@_description': 'desc',
          invocations: [{ '@_timestamp': 'ts', args: [{ '@_name': 'q', value: 'hello' }], result: null }],
        };
        // Act
        const section = ToolSection.fromXML(xml);
        const out: any = section.toXML();
        // Assert
        expect(out.invocations[0].args[0]).to.deep.include({ '@_name': 'q', value: 'hello' });
      });

      it('should parse multiple invocations from array', () => {
        // Arrange
        const xml = {
          '@_name': 'tool:search',
          '@_description': 'desc',
          invocations: [
            { '@_timestamp': 'ts1', args: [], result: 'r1' },
            { '@_timestamp': 'ts2', args: [], result: 'r2' },
          ],
        };
        // Act
        const section = ToolSection.fromXML(xml);
        // Assert
        expect(section.toXML().invocations).to.have.length(2);
      });
    });

    describe('single (non-array) invocation', () => {
      it('should parse a single non-array invocation object', () => {
        // Arrange
        const xml = {
          '@_name': 'tool:search',
          '@_description': 'desc',
          invocations: { '@_timestamp': 'ts1', args: [{ '@_name': 'q', value: 'v' }], result: 'r' },
        };
        // Act
        const section = ToolSection.fromXML(xml);
        // Assert
        expect(section.toXML().invocations).to.have.length(1);
      });

      it('should produce no invocations when invocations is undefined', () => {
        // Arrange
        const xml = { '@_name': 'tool:search', '@_description': 'desc' };
        // Act
        const section = ToolSection.fromXML(xml);
        // Assert
        expect(section.toXML().invocations).to.have.length(0);
      });

      it('should produce no invocations when invocations is null', () => {
        // Arrange
        const xml = { '@_name': 'tool:search', '@_description': 'desc', invocations: null };
        // Act
        const section = ToolSection.fromXML(xml);
        // Assert
        expect(section.toXML().invocations).to.have.length(0);
      });
    });
  });

  describe('toXML', () => {
    it('should set @_type to "tool"', () => {
      // Arrange
      const section = new ToolSection('search', 'desc');
      // Act
      const xml: any = section.toXML();
      // Assert
      expect(xml['@_type']).to.equal('tool');
    });

    it('should set @_name to "tool:{toolName}"', () => {
      // Arrange
      const section = new ToolSection('search', 'desc');
      // Act
      const xml: any = section.toXML();
      // Assert
      expect(xml['@_name']).to.equal('tool:search');
    });

    it('should set @_description to the provided description', () => {
      // Arrange
      const section = new ToolSection('search', 'Searches the web');
      // Act
      const xml: any = section.toXML();
      // Assert
      expect(xml['@_description']).to.equal('Searches the web');
    });

    it('should assign sequential @_index values to invocations', () => {
      // Arrange
      const section = new ToolSection('search', 'desc');
      section.addInvocation('t1', {}, 'r1');
      section.addInvocation('t2', {}, 'r2');
      // Act
      const out: any = section.toXML();
      // Assert
      expect(out.invocations[0]['@_index']).to.equal(0);
      expect(out.invocations[1]['@_index']).to.equal(1);
    });

    it('should coerce numeric arg values to strings', () => {
      // Arrange
      const section = new ToolSection('calc', 'desc');
      section.addInvocation('ts', { num: 42 }, null);
      // Act
      const out: any = section.toXML();
      // Assert
      expect(out.invocations[0].args[0].value).to.equal('42');
    });

    it('should coerce boolean arg values to strings', () => {
      // Arrange
      const section = new ToolSection('calc', 'desc');
      section.addInvocation('ts', { flag: true }, null);
      // Act
      const out: any = section.toXML();
      // Assert
      expect(out.invocations[0].args[0].value).to.equal('true');
    });

    it('should pass result through without coercion', () => {
      // Arrange
      const section = new ToolSection('search', 'desc');
      section.addInvocation('ts', {}, { status: 'ok' });
      // Act
      const out: any = section.toXML();
      // Assert
      expect(out.invocations[0].result).to.deep.equal({ status: 'ok' });
    });

    it('should return an empty invocations array when no invocations added', () => {
      // Arrange
      const section = new ToolSection('search', 'desc');
      // Act
      const xml = section.toXML();
      // Assert
      expect(xml.invocations).to.deep.equal([]);
    });
  });

  describe('round-trip (toXML → fromXML)', () => {
    it('should preserve all invocations through serialisation and deserialisation', () => {
      // Arrange
      const original = new ToolSection('search', 'desc');
      original.addInvocation('2026-01-01T00:00:00Z', { query: 'hello', limit: '10' }, 'some-result');
      // Act
      const restored: any = ToolSection.fromXML(original.toXML());
      // Assert
      expect(restored.name).to.equal(original.name);
      expect(restored.toXML().invocations).to.have.length(1);
      expect(restored.toXML().invocations[0]['@_timestamp']).to.equal('2026-01-01T00:00:00Z');
    });

    it('should preserve multiple invocations in order', () => {
      // Arrange
      const original = new ToolSection('search', 'desc');
      original.addInvocation('ts1', { q: 'a' }, 'r1');
      original.addInvocation('ts2', { q: 'b' }, 'r2');
      // Act
      const restored = ToolSection.fromXML(original.toXML());
      const out: any = restored.toXML();
      // Assert
      expect(out.invocations).to.have.length(2);
      expect(out.invocations[0]['@_timestamp']).to.equal('ts1');
      expect(out.invocations[1]['@_timestamp']).to.equal('ts2');
    });

    it('should produce no invocations for an empty ToolSection round-trip', () => {
      // Arrange
      const original = new ToolSection('noop', 'desc');
      // Act
      const restored = ToolSection.fromXML(original.toXML());
      // Assert
      expect(restored.toXML().invocations).to.have.length(0);
    });
  });
});