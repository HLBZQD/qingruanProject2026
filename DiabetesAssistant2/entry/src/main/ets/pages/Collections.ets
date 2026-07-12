import { router, promptAction } from '@kit.ArkUI';
import { AuthStore } from '../stores/AuthStore';
import { CollectedArticle } from '../types/api';
import { API_ARTICLES_COLLECTIONS, API_ARTICLES_COLLECT } from '../common/constants/ApiEndpoints';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { FadeInUp } from '../components/FadeInUp';
import { PressableCard } from '../components/PressableCard';
import { ArticleCover } from '../components/ArticleCover';
import { timeAgo, imageUrl } from '../utils/Helpers';
import {
  COLOR_PAPER_50, COLOR_PAPER_100,
  COLOR_ACCENT_SAGE_500, COLOR_ACCENT_SAND_500,
  COLOR_DANGER_600,
  COLOR_INK_700, COLOR_INK_500, COLOR_INK_400, COLOR_INK_300, COLOR_INK_100,
  TYPO_SUBTITLE, TYPO_BODY, TYPO_CAPTION,
  RADIUS_MEDIA, RADIUS_TAG,
  SPACE_1, SPACE_2, SPACE_3, SPACE_4, SPACE_7, SPACE_9
} from '../common/constants/DesignTokens';

interface CollectionsWrapper {
  data: CollectedArticle[];
}

@Entry
@Component
struct CollectionsPage {
  @State collections: CollectedArticle[] = [];
  @State isLoading: boolean = true;
  @State error: string | null = null;

  aboutToAppear(): void {
    this.loadCollections();
  }

  async loadCollections(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      const client = AuthStore.getInstance().getHttpClient();
      const wrapper = await client.request<CollectionsWrapper>('GET', API_ARTICLES_COLLECTIONS, null);
      this.collections = wrapper.data ?? [];
    } catch (e) {
      this.error = (e as Error).message ?? '加载失败';
    } finally {
      this.isLoading = false;
    }
  }

  async handleUncollect(article: CollectedArticle): Promise<void> {
    try {
      const client = AuthStore.getInstance().getHttpClient();
      await client.request<Object>('DELETE', API_ARTICLES_COLLECT(article.id), null);
      this.collections = this.collections.filter((a: CollectedArticle) => a.id !== article.id);
      promptAction.showToast({ message: '已取消收藏' });
    } catch (e) {
      promptAction.showToast({ message: '取消收藏失败' });
    }
  }

  @Builder
  CollectionCard(article: CollectedArticle) {
    Row() {
      ArticleCover({ cover: article.cover, category: article.category, coverWidth: 60, coverHeight: 60, radius: RADIUS_MEDIA, iconSize: 24 })

      Column() {
        Text(article.title)
          .fontSize(TYPO_SUBTITLE.size).fontWeight(TYPO_SUBTITLE.weight)
          .fontColor(COLOR_INK_700).maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(article.summary)
          .fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_500)
          .maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis })
          .margin({ top: SPACE_1 })
        Row() {
          Text(article.category)
            .fontSize(TYPO_CAPTION.size).fontColor(COLOR_ACCENT_SAGE_500)
          Blank()
          Text(timeAgo(Date.parse(article.created_at)))
            .fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_400)
        }
        .width('100%').margin({ top: SPACE_1 })
      }
      .layoutWeight(1).margin({ left: SPACE_3 })

      Column() {
        Icon({ name: 'STAR_FILL', iconSize: 20, color: COLOR_ACCENT_SAND_500 })
      }
      .width(36).height(36)
      .justifyContent(FlexAlign.Center).alignItems(HorizontalAlign.Center)
      .onClick(() => { this.handleUncollect(article); })
    }
    .width('100%')
  }

  build() {
    Column() {
      PageHeader({ title: '我的收藏' })

      Scroll() {
        Column() {
          if (this.isLoading) {
            Column({ space: SPACE_3 }) {
              SkeletonLoader({ variant: 'lines', count: 3, lineHeight: SPACE_7 })
              SkeletonLoader({ variant: 'lines', count: 3, lineHeight: SPACE_7 })
            }
            .width('100%').padding({ left: SPACE_4, right: SPACE_4, top: SPACE_3 })
          } else if (this.error !== null) {
            Column() {
              Text(this.error)
                .fontSize(TYPO_BODY.size).fontColor(COLOR_DANGER_600)
                .textAlign(TextAlign.Center).margin({ bottom: SPACE_3 })
              Button('重试')
                .fontSize(TYPO_BODY.size).backgroundColor(COLOR_ACCENT_SAGE_500).fontColor(COLOR_PAPER_50)
                .onClick(() => { this.loadCollections(); })
            }
            .width('100%').padding(SPACE_4).margin({ top: SPACE_9 })
            .alignItems(HorizontalAlign.Center)
          } else if (this.collections.length === 0) {
            EmptyState({
              title: '暂无收藏',
              description: '你还没有收藏任何文章，去资讯页发现感兴趣的内容吧',
              iconName: 'STAR'
            })
          } else {
            Column({ space: SPACE_3 }) {
              ForEach(this.collections, (article: CollectedArticle, index: number) => {
                FadeInUp({ index: index }) {
                  PressableCard({
                    onTap: () => { router.pushUrl({ url: 'pages/ArticleDetail', params: { article_id: article.id } }); }
                  }) {
                    this.CollectionCard(article)
                  }
                }
              }, (article: CollectedArticle) => article.id.toString())
            }
            .width('100%').padding({ left: SPACE_4, right: SPACE_4, top: SPACE_3 })
          }

          Blank().height(SPACE_9)
        }
      }
      .scrollable(ScrollDirection.Vertical).scrollBar(BarState.Off)
      .layoutWeight(1)
    }
    .width('100%').height('100%').backgroundColor(COLOR_PAPER_100)
  }

  pageTransition(): void {
    PageTransitionEnter({ duration: 300, curve: Curve.EaseOut }).slide(SlideEffect.Right).opacity(0)
    PageTransitionExit({ duration: 250, curve: Curve.EaseIn }).slide(SlideEffect.Right).opacity(0)
  }
}
