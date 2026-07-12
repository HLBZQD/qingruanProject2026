const ICON_SYMBOL_MAP = new Map<string, Resource>([
  ['HOME', $r('sys.symbol.house')],
  ['CONSULT', $r('sys.symbol.stethoscope')],
  ['LIFEPLAN', $r('sys.symbol.list_checkmask')],
  ['NEWS', $r('sys.symbol.doc_text')],
  ['PROFILE', $r('sys.symbol.person_crop_circle_fill')],
  ['USER', $r('sys.symbol.person_crop_circle_fill')],
  ['CHAT', $r('sys.symbol.ellipsis_bubble')],
  ['CLOSE', $r('sys.symbol.xmark')],
  ['BACK', $r('sys.symbol.chevron_left')],
  ['CHEVRON_LEFT', $r('sys.symbol.chevron_left')],
  ['CHEVRON_RIGHT', $r('sys.symbol.chevron_right')],
  ['INFO', $r('sys.symbol.info_circle')],
  ['WARNING', $r('sys.symbol.exclamationmark_triangle')],
  ['REFRESH', $r('sys.symbol.arrow_clockwise')],
  ['SEND', $r('sys.symbol.paperplane')],
  ['ATTACH', $r('sys.symbol.paperclip')],
  ['SEARCH', $r('sys.symbol.magnifyingglass')],
  ['LOGOUT', $r('sys.symbol.rectangle_and_arrowshape_turn_up_right')],
  ['EDIT', $r('sys.symbol.square_and_pencil')],
  ['CHECK', $r('sys.symbol.checkmark')],
  ['FORK_KNIFE', $r('sys.symbol.fork_knife')],
  ['RUN', $r('sys.symbol.figure_run')],
  ['VIEW', $r('sys.symbol.eye')],
  ['TRASH', $r('sys.symbol.trash')],
  ['STAR', $r('sys.symbol.star')],
  ['STAR_FILL', $r('sys.symbol.star_fill')]
]);

const ICON_FALLBACK: Resource = $r('sys.symbol.questionmark_circle');

export function resolveSymbol(name: string): Resource {
  const res = ICON_SYMBOL_MAP.get(name);
  if (res !== undefined) {
    return res;
  }
  console.warn('Icon: unknown name=' + name);
  return ICON_FALLBACK;
}

@Component
export struct Icon {
  @Prop name: string;
  @Prop iconSize: number = 24;
  @Prop color: string = '#3A3D43';

  build(): void {
    SymbolGlyph(resolveSymbol(this.name))
      .fontSize(this.iconSize)
      .fontColor([this.color])
      .renderingStrategy(SymbolRenderingStrategy.SINGLE);
  }
}
