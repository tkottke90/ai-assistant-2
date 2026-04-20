import { expect } from 'chai';
import { HumanMessage, AIMessage, ToolMessage } from 'langchain';
import { classifyIncrement, ClassifiedSignal } from './classifier.js';

describe('Recursive Middleware - Classifier', () => {
  describe('classifyIncrement', () => {

    it('should classify "Can you remember that I prefer..." as user-preference', () => {
      const msgs = [new HumanMessage('Can you remember that I prefer short answers')];
      const signals = classifyIncrement(msgs);
      expect(signals).to.have.length(1);
      expect(signals[0].type).to.equal('user-preference');
      expect(signals[0].source).to.equal('user');
      expect(signals[0].requiresOperation).to.be.true;
    });

    it('should classify "Please make a note that I don\'t like..." as user-preference', () => {
      const msgs = [new HumanMessage("Please make a note that I don't like verbose responses")];
      const signals = classifyIncrement(msgs);
      expect(signals).to.have.length(1);
      expect(signals[0].type).to.equal('user-preference');
      expect(signals[0].requiresOperation).to.be.true;
    });

    it('should classify "Please always respond in bullet points" as user-preference', () => {
      const msgs = [new HumanMessage('Please always respond in bullet points')];
      const signals = classifyIncrement(msgs);
      expect(signals).to.have.length(1);
      expect(signals[0].type).to.equal('user-preference');
      expect(signals[0].requiresOperation).to.be.true;
    });

    it('should classify "My project is called Lighthouse" as user-stated-fact', () => {
      const msgs = [new HumanMessage('My project is called Lighthouse')];
      const signals = classifyIncrement(msgs);
      expect(signals).to.have.length(1);
      expect(signals[0].type).to.equal('user-stated-fact');
      expect(signals[0].source).to.equal('user');
      expect(signals[0].requiresOperation).to.be.true;
    });

    it('should classify "Just so you know, we use TypeScript" as user-stated-fact', () => {
      const msgs = [new HumanMessage('Just so you know, we use TypeScript')];
      const signals = classifyIncrement(msgs);
      expect(signals).to.have.length(1);
      expect(signals[0].type).to.equal('user-stated-fact');
      expect(signals[0].requiresOperation).to.be.true;
    });

    it('should classify a ToolMessage as tool-result with requiresOperation true', () => {
      const msgs = [new ToolMessage({ content: 'Tool response data', tool_call_id: 'tc-1' })];
      const signals = classifyIncrement(msgs);
      expect(signals).to.have.length(1);
      expect(signals[0].type).to.equal('tool-result');
      expect(signals[0].source).to.equal('tool');
      expect(signals[0].requiresOperation).to.be.true;
    });

    it('should classify "Forget what I said about Lighthouse" as discard-signal', () => {
      const msgs = [new HumanMessage('Forget what I said about Lighthouse')];
      const signals = classifyIncrement(msgs);
      expect(signals).to.have.length(1);
      expect(signals[0].type).to.equal('discard-signal');
      expect(signals[0].requiresOperation).to.be.true;
    });

    it('should classify "Sounds good, thanks!" as no-content', () => {
      const msgs = [new HumanMessage('Sounds good, thanks!')];
      const signals = classifyIncrement(msgs);
      expect(signals).to.have.length(1);
      expect(signals[0].type).to.equal('no-content');
      expect(signals[0].requiresOperation).to.be.false;
    });

    it('should produce two signals for a mixed increment (preference + tool result)', () => {
      const msgs = [
        new HumanMessage('Please always respond in bullet points'),
        new ToolMessage({ content: 'Fetched data from API', tool_call_id: 'tc-2' }),
      ];
      const signals = classifyIncrement(msgs);
      expect(signals).to.have.length(2);

      const pref = signals.find((s: ClassifiedSignal) => s.type === 'user-preference');
      const tool = signals.find((s: ClassifiedSignal) => s.type === 'tool-result');
      expect(pref).to.exist;
      expect(tool).to.exist;
      expect(pref!.requiresOperation).to.be.true;
      expect(tool!.requiresOperation).to.be.true;
    });

    it('should classify an AIMessage alone as no-content', () => {
      const msgs = [new AIMessage('Sure, here is the answer.')];
      const signals = classifyIncrement(msgs);
      expect(signals).to.have.length(1);
      expect(signals[0].type).to.equal('no-content');
      expect(signals[0].source).to.equal('assistant');
      expect(signals[0].requiresOperation).to.be.false;
    });

    it('should return empty array for empty messages input', () => {
      const signals = classifyIncrement([]);
      expect(signals).to.have.length(0);
    });

  });
});
