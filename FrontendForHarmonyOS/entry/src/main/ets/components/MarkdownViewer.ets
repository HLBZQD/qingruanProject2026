import { MarkdownToken, MarkdownTableCell, MarkdownTableRow, parseMarkdown } from '../utils/MarkdownParser';
import {
  TYPO_BODY, TYPO_TITLE, TYPO_SUBTITLE, TYPO_DISPLAY_L, TYPO_DISPLAY_M,
  COLOR_INK_500, COLOR_INK_600, COLOR_INK_700, COLOR_INK_200, COLOR_INK_100,
  COLOR_ACCENT_SAGE_500, COLOR_ACCENT_MIST_500, COLOR_PAPER_100,
  FONT_FAMILY_MONO, RADIUS_MEDIA, STROKE_HAIRLINE,
  SPACE_1, SPACE_2, SPACE_3, SPACE_4
} from '../common/constants/DesignTokens';

interface HeadingStyle {
  size: number;
  weight: number;
}

function headingStyle(level: number): HeadingStyle {
  if (level === 1) { return { size: TYPO_DISPLAY_L.size, weight: TYPO_DISPLAY_L.weight }; }
  if (level === 2) { return { size: TYPO_DISPLAY_M.size, weight: TYPO_DISPLAY_M.weight }; }
  if (level === 3) { return { size: TYPO_TITLE.size, weight: TYPO_TITLE.weight }; }
  if (level === 4) { return { size: TYPO_SUBTITLE.size, weight: 600 }; }
  return { size: TYPO_BODY.size, weight: 600 };
}

@Component
export struct MarkdownViewer {
  @Prop markdown: string = '';
  @Prop maxLines: number = 0;
  @Prop fullWidth: boolean = true;
  @State tokens: MarkdownToken[] = [];

  aboutToAppear(): void {
    this.tokens = parseMarkdown(this.markdown);
  }

  aboutToUpdate(): void {
    this.tokens = parseMarkdown(this.markdown);
  }

  @Builder
  InlineSpans(children: MarkdownToken[]) {
    ForEach(children ?? [], (child: MarkdownToken, i: number) => {
      if (child.type === 'text') {
        Span(child.content)
      } else if (child.type === 'bold') {
        ForEach(child.children ?? [], (bc: MarkdownToken, j: number) => {
          if (bc.type === 'italic') {
            Span(bc.content).fontWeight(700).fontStyle(FontStyle.Italic).fontColor(COLOR_INK_700)
          } else {
            Span(bc.content).fontWeight(700).fontColor(COLOR_INK_700)
          }
        }, (bc: MarkdownToken, j: number) => j.toString())
      } else if (child.type === 'italic') {
        ForEach(child.children ?? [], (ic: MarkdownToken, j: number) => {
          Span(ic.content).fontStyle(FontStyle.Italic).fontColor(COLOR_INK_700)
        }, (ic: MarkdownToken, j: number) => j.toString())
      } else if (child.type === 'strike') {
        Span(child.content).decoration({ type: TextDecorationType.LineThrough }).fontColor(COLOR_INK_500)
      } else if (child.type === 'link') {
        Span(child.content).fontColor(COLOR_ACCENT_SAGE_500).decoration({ type: TextDecorationType.Underline, color: COLOR_ACCENT_SAGE_500 })
      } else if (child.type === 'inline-code') {
        Span(child.content).fontFamily(FONT_FAMILY_MONO).fontSize(TYPO_BODY.size * 0.9).fontColor(COLOR_INK_600)
      } else {
        Span(child.content)
      }
    }, (child: MarkdownToken, i: number) => i.toString())
  }

  @Builder
  TableBlock(token: MarkdownToken) {
    Column() {
      Flex({ alignItems: ItemAlign.Stretch }) {
        ForEach(token.tableHeader ?? [], (cell: MarkdownTableCell, i: number) => {
          Text() {
            this.InlineSpans(cell.tokens)
          }
          .fontSize(TYPO_BODY.size * 0.9)
          .fontWeight(FontWeight.Bold)
          .fontColor(COLOR_INK_700)
          .layoutWeight(1)
          .padding(SPACE_2)
          .border(i > 0 ? { width: { left: STROKE_HAIRLINE.width }, color: COLOR_INK_200 } : { width: 0 })
        }, (cell: MarkdownTableCell, i: number) => i.toString())
      }
      .width('100%')
      .backgroundColor(COLOR_PAPER_100)

      ForEach(token.tableRows ?? [], (row: MarkdownTableRow, r: number) => {
        Flex({ alignItems: ItemAlign.Stretch }) {
          ForEach(row.cells, (cell: MarkdownTableCell, c: number) => {
            Text() {
              this.InlineSpans(cell.tokens)
            }
            .fontSize(TYPO_BODY.size * 0.9)
            .fontColor(COLOR_INK_600)
            .lineHeight(TYPO_BODY.size * 1.5)
            .layoutWeight(1)
            .padding(SPACE_2)
            .border(c > 0 ? { width: { left: STROKE_HAIRLINE.width }, color: COLOR_INK_200 } : { width: 0 })
          }, (cell: MarkdownTableCell, c: number) => c.toString())
        }
        .width('100%')
        .border({ width: { top: STROKE_HAIRLINE.width }, color: COLOR_INK_200 })
      }, (row: MarkdownTableRow, r: number) => r.toString())
    }
    .width('100%')
    .borderRadius(RADIUS_MEDIA)
    .border({ width: STROKE_HAIRLINE.width, color: COLOR_INK_200 })
    .clip(true)
    .margin({ top: SPACE_2, bottom: SPACE_2 })
  }

  build(): void {
    Column({ space: 0 }) {
      ForEach(this.maxLines > 0 ? this.tokens.slice(0, this.maxLines * 2) : this.tokens, (token: MarkdownToken, index: number) => {
        if (token.type === 'heading') {
          Text() {
            this.InlineSpans(token.children ?? [])
          }
          .fontSize(headingStyle(token.level!).size)
          .fontWeight(headingStyle(token.level!).weight)
          .fontColor(COLOR_INK_700)
          .width('100%')
          .maxLines(10)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          Blank().height(SPACE_2)
        } else if (token.type === 'paragraph') {
          Text() {
            this.InlineSpans(token.children ?? [])
          }
          .fontSize(TYPO_BODY.size)
          .fontWeight(TYPO_BODY.weight)
          .fontColor(COLOR_INK_500)
          .lineHeight(TYPO_BODY.size * 1.6)
          Blank().height(SPACE_1)
        } else if (token.type === 'code-block') {
          Column() {
            if (token.language !== undefined && token.language.length > 0) {
              Text(token.language)
                .fontSize(TYPO_BODY.size * 0.8)
                .fontFamily(FONT_FAMILY_MONO)
                .fontColor(COLOR_ACCENT_MIST_500)
                .width('100%')
                .margin({ bottom: SPACE_1 })
            }
            Text(token.content)
              .fontFamily(FONT_FAMILY_MONO)
              .fontSize(TYPO_BODY.size * 0.9)
              .fontColor(COLOR_INK_700)
              .width('100%')
          }
          .width('100%')
          .backgroundColor(COLOR_INK_100)
          .borderRadius(RADIUS_MEDIA)
          .padding(SPACE_3)
          .margin({ top: SPACE_1, bottom: SPACE_2 })
        } else if (token.type === 'quote') {
          Row() {
            Text() {
              this.InlineSpans(token.children ?? [])
            }
            .fontSize(TYPO_BODY.size)
            .fontColor(COLOR_INK_600)
            .lineHeight(TYPO_BODY.size * 1.6)
            .layoutWeight(1)
          }
          .width('100%')
          .padding({ left: SPACE_3, right: SPACE_3, top: SPACE_2, bottom: SPACE_2 })
          .backgroundColor(COLOR_PAPER_100)
          .borderRadius({ topRight: RADIUS_MEDIA, bottomRight: RADIUS_MEDIA })
          .border({ width: { left: 3 }, color: COLOR_ACCENT_SAGE_500 })
          .margin({ top: SPACE_2, bottom: SPACE_2 })
        } else if (token.type === 'divider') {
          Divider()
            .strokeWidth(STROKE_HAIRLINE.width)
            .color(COLOR_INK_200)
            .margin({ top: SPACE_3, bottom: SPACE_3 })
        } else if (token.type === 'table') {
          this.TableBlock(token)
        } else if (token.type === 'list-item' || token.type === 'ordered-list-item') {
          Row() {
            Text(token.type === 'list-item' ? '• ' : `${token.index}. `)
              .fontSize(TYPO_BODY.size)
              .fontColor(COLOR_ACCENT_SAGE_500)
            Text() {
              this.InlineSpans(token.children ?? [])
            }
            .fontSize(TYPO_BODY.size)
            .fontWeight(TYPO_BODY.weight)
            .fontColor(COLOR_INK_500)
            .lineHeight(TYPO_BODY.size * 1.6)
            .layoutWeight(1)
          }
          .width('100%')
          .alignItems(VerticalAlign.Top)
          .padding({ left: SPACE_3 })
          Blank().height(SPACE_1)
        }
      }, (token: MarkdownToken, index: number) => index.toString());
    }
    .width(this.fullWidth ? '100%' : undefined)
    .padding({ left: SPACE_4, right: SPACE_4, top: SPACE_3, bottom: SPACE_3 })
  }
}
