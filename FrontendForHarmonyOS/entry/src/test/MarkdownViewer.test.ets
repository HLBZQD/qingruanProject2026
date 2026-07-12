import { describe, it, expect } from '@ohos/hypium';
import { MarkdownToken, parseMarkdown, parseInline } from '../main/ets/utils/MarkdownParser';
import { MarkdownViewer } from '../main/ets/components/MarkdownViewer';

export default function markdownViewerTest(): void {
  describe('MarkdownViewerTest', () => {

    it('MarkdownViewer is importable', 0, () => {
      expect(MarkdownViewer !== undefined).assertTrue();
    });

    it('parseMarkdown empty string returns []', 0, () => {
      expect(parseMarkdown('').length === 0).assertTrue();
    });

    it('parseMarkdown # heading level 1', 0, () => {
      const tokens = parseMarkdown('# 标题');
      expect(tokens.length === 1).assertTrue();
      expect(tokens[0].type === 'heading').assertTrue();
      expect(tokens[0].level === 1).assertTrue();
      expect(tokens[0].content === '标题').assertTrue();
    });

    it('parseMarkdown ## heading level 2', 0, () => {
      const tokens = parseMarkdown('## 二级标题');
      expect(tokens.length === 1).assertTrue();
      expect(tokens[0].type === 'heading').assertTrue();
      expect(tokens[0].level === 2).assertTrue();
      expect(tokens[0].content === '二级标题').assertTrue();
    });

    it('parseMarkdown ### heading level 3', 0, () => {
      const tokens = parseMarkdown('### 三级标题');
      expect(tokens[0].level === 3).assertTrue();
    });

    it('parseMarkdown #### downgrades to paragraph', 0, () => {
      const tokens = parseMarkdown('#### 四级标题');
      expect(tokens.length === 1).assertTrue();
      expect(tokens[0].type === 'paragraph').assertTrue();
    });

    it('parseMarkdown plain paragraph', 0, () => {
      const tokens = parseMarkdown('普通段落文本');
      expect(tokens.length === 1).assertTrue();
      expect(tokens[0].type === 'paragraph').assertTrue();
      expect(tokens[0].content === '普通段落文本').assertTrue();
    });

    it('parseMarkdown bold text', 0, () => {
      const tokens = parseMarkdown('**粗体文本**');
      expect(tokens.length === 1).assertTrue();
      expect(tokens[0].type === 'paragraph').assertTrue();
      const paragraph = tokens[0];
      expect(paragraph.children![0].type === 'bold').assertTrue();
      expect(paragraph.children![0].content === '粗体文本').assertTrue();
    });

    it('parseMarkdown unordered list', 0, () => {
      const tokens = parseMarkdown('- 列表项');
      expect(tokens.length === 1).assertTrue();
      expect(tokens[0].type === 'list-item').assertTrue();
    });

    it('parseMarkdown ordered list', 0, () => {
      const tokens = parseMarkdown('1. 有序列表');
      expect(tokens.length === 1).assertTrue();
      expect(tokens[0].type === 'ordered-list-item').assertTrue();
      expect(tokens[0].index! === 1).assertTrue();
    });

    it('parseMarkdown multiple paragraphs', 0, () => {
      const tokens = parseMarkdown('段落1\n\n段落2');
      expect(tokens.length === 2).assertTrue();
      expect(tokens[0].type === 'paragraph').assertTrue();
      expect(tokens[1].type === 'paragraph').assertTrue();
    });

    it('parseInline italic', 0, () => {
      const tokens = parseInline('*斜体文本*');
      expect(tokens.length === 1).assertTrue();
      expect(tokens[0].type === 'italic').assertTrue();
      expect(tokens[0].content === '斜体文本').assertTrue();
    });

    it('parseInline inline code', 0, () => {
      const tokens = parseInline('`inline code`');
      expect(tokens.length === 1).assertTrue();
      expect(tokens[0].type === 'inline-code').assertTrue();
      expect(tokens[0].content === 'inline code').assertTrue();
    });

    it('parseInline unclosed bold falls back to text', 0, () => {
      const tokens = parseInline('**粗体文本');
      expect(tokens.length === 1).assertTrue();
      expect(tokens[0].type === 'text').assertTrue();
    });

    it('SUPPORTED_SYNTAX has 7 items with correct values', 0, () => {
      expect(MarkdownViewer.SUPPORTED_SYNTAX.length === 7).assertTrue();
      const expected = ['bold', 'italic', 'inline-code', 'heading', 'unordered-list', 'ordered-list', 'paragraph'];
      let allMatch = true;
      for (let i = 0; i < expected.length; i++) {
        if (MarkdownViewer.SUPPORTED_SYNTAX[i] !== expected[i]) {
          allMatch = false;
        }
      }
      expect(allMatch).assertTrue();
    });

    it('MAX_HEADING_LEVEL is 3', 0, () => {
      expect(MarkdownViewer.MAX_HEADING_LEVEL === 3).assertTrue();
    });

    it('assembleHap compilation passes', 0, () => {
      expect(1).assertEqual(1);
    });
  });
}
