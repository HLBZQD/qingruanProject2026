import { router, promptAction } from '@kit.ArkUI';
import { AuthStore } from '../stores/AuthStore';
import { API_ARTICLES_ID, API_ARTICLES_COLLECT } from '../common/constants/ApiEndpoints';
import {
  COLOR_PAPER_50, COLOR_PAPER_100, COLOR_INK_700, COLOR_INK_500, COLOR_INK_400,
  COLOR_ACCENT_SAND_500, COLOR_ACCENT_SAGE_500,
  TYPO_TITLE, TYPO_BODY, TYPO_CAPTION, RADIUS_TAG, SPACE_1, SPACE_2, SPACE_3, SPACE_4
} from '../common/constants/DesignTokens';
import { imageUrl } from '../utils/Helpers';
import { MarkdownViewer } from '../components/MarkdownViewer';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';

interface ArticleData {
  id: number;
  title: string;
  cover: string | null;
  author: string;
  category: string;
  tags: string[];
  summary: string;
  content: string;
  views: number;
  created_at: string;
  is_collected: boolean;
}

interface ArticleDetailWrapper {
  data: ArticleData;
}

@Entry
@Component
struct ArticleDetailPage {
  @State article: ArticleData | null = null;
  @State isLoading: boolean = true;
  @State isCollected: boolean = false;
  @State isToggling: boolean = false;
  private articleId: number = 0;

  aboutToAppear(): void {
    const params = router.getParams() as Record<string, Object> | undefined;
    if (params !== undefined && params['article_id'] !== undefined) {
      this.articleId = params['article_id'] as number;
      this.loadArticle();
    }
  }

  private async loadArticle(): Promise<void> {
    this.isLoading = true;
    try {
      const client = AuthStore.getInstance().getHttpClient();
      const wrapper = await client.request<ArticleDetailWrapper>('GET', API_ARTICLES_ID(this.articleId), null);
      this.article = wrapper.data;
      this.isCollected = wrapper.data.is_collected;
    } catch (e) {
      this.article = null;
    } finally {
      this.isLoading = false;
    }
  }

  private async toggleCollect(): Promise<void> {
    if (this.isToggling) {
      return;
    }
    this.isToggling = true;
    const target: boolean = !this.isCollected;
    try {
      const client = AuthStore.getInstance().getHttpClient();
      if (target) {
        await client.request<Object>('POST', API_ARTICLES_COLLECT(this.articleId), null);
      } else {
        await client.request<Object>('DELETE', API_ARTICLES_COLLECT(this.articleId), null);
      }
      this.isCollected = target;
      promptAction.showToast({ message: target ? '已收藏' : '已取消收藏' });
    } catch (e) {
      promptAction.showToast({ message: '操作失败，请稍后重试' });
    } finally {
      this.isToggling = false;
    }
  }

  @Builder
  CollectButton() {
    if (this.article !== null) {
      Column() {
        Icon({
          name: this.isCollected ? 'STAR_FILL' : 'STAR',
          iconSize: 22,
          color: this.isCollected ? COLOR_ACCENT_SAND_500 : COLOR_INK_400
        })
      }
      .width(40).height(40)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .onClick(() => { this.toggleCollect(); })
    }
  }

  build() {
    Column() {
      PageHeader({ title: '文章详情', trailing: (): void => { this.CollectButton() } })

      if (this.isLoading) {
        Text('加载中...').fontSize(TYPO_BODY.size).textAlign(TextAlign.Center).layoutWeight(1)
      } else if (this.article !== null) {
        Scroll() {
          Column({ space: SPACE_3 }) {
            if (this.article.cover !== null) {
              Image(imageUrl(this.article.cover))
                .width('100%').height(200).objectFit(ImageFit.Cover)
            }
            Text(this.article.title)
              .fontSize(TYPO_TITLE.size).fontWeight(700).fontColor(COLOR_INK_700)
              .padding({ left: SPACE_4, right: SPACE_4 })
            Row() {
              Text(this.article.author).fontSize(TYPO_BODY.size).fontColor(COLOR_INK_500)
              Blank()
              Icon({ name: 'VIEW', iconSize: 14, color: COLOR_INK_400 })
              Text(this.article.views.toString()).fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_400).margin({ left: SPACE_1, right: SPACE_3 })
              Text(this.article.category).fontSize(TYPO_BODY.size).fontColor(COLOR_INK_400)
            }
            .width('100%').padding({ left: SPACE_4, right: SPACE_4 })
            if (this.article.tags.length > 0) {
              Row({ space: SPACE_2 }) {
                ForEach(this.article.tags, (tag: string) => {
                  Text('# ' + tag)
                    .fontSize(TYPO_CAPTION.size).fontColor(COLOR_ACCENT_SAGE_500)
                    .backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_TAG)
                    .padding({ left: SPACE_2, right: SPACE_2, top: 2, bottom: 2 })
                }, (tag: string) => tag)
              }
              .width('100%').padding({ left: SPACE_4, right: SPACE_4 })
            }
            MarkdownViewer({ markdown: this.article.content })
          }
        }
        .layoutWeight(1)
      } else {
        Text('文章加载失败').fontSize(TYPO_BODY.size).textAlign(TextAlign.Center).layoutWeight(1)
        Button('重试').onClick(() => { this.loadArticle() }).margin(SPACE_4)
      }
    }
    .width('100%').height('100%').backgroundColor(COLOR_PAPER_50)
  }

  pageTransition(): void {
    PageTransitionEnter({ duration: 300, curve: Curve.EaseOut }).slide(SlideEffect.Right).opacity(0)
    PageTransitionExit({ duration: 250, curve: Curve.EaseIn }).slide(SlideEffect.Right).opacity(0)
  }
}
