import { router, promptAction } from '@kit.ArkUI';
import { HomeStore, HomeData } from '../../stores/HomeStore';
import { AuthStore } from '../../stores/AuthStore';
import { UiStore } from '../../stores/UiStore';
import { Article } from '../../types/models';
import { ArticleGenerateCategorySelection, ArticleGenerateCategoryItem } from '../../types/api';
import { API_ARTICLES_GENERATE } from '../../common/constants/ApiEndpoints';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { ErrorRetry } from '../../components/ErrorRetry';
import { EmptyState, EMPTY_MESSAGES } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { timeAgo, imageUrl } from '../../utils/Helpers';
import { PressableCard } from '../../components/PressableCard';
import { FadeInUp } from '../../components/FadeInUp';
import { ArticleCover } from '../../components/ArticleCover';
import {
  COLOR_PAPER_50, COLOR_PAPER_100,
  COLOR_ACCENT_SAGE_500, COLOR_ACCENT_SAGE_300, COLOR_ACCENT_CLAY_500, COLOR_ACCENT_CLAY_300,
  COLOR_ACCENT_MIST_500, COLOR_ACCENT_SAND_500,
  COLOR_INK_700, COLOR_INK_600, COLOR_INK_500, COLOR_INK_400,
  COLOR_INK_300, COLOR_INK_100,
  TYPO_HEADLINE, TYPO_TITLE, TYPO_SUBTITLE, TYPO_BODY, TYPO_LABEL, TYPO_CAPTION,
  RADIUS_CARD_OUTER, RADIUS_CELL, RADIUS_MEDIA, RADIUS_TAG, RADIUS_PILL,
  STROKE_HAIRLINE,
  SHADOW_AMBIENT_E2,
  SPACE_1, SPACE_2, SPACE_3, SPACE_4, SPACE_7, SPACE_9, SPACE_12
} from '../../common/constants/DesignTokens';

interface BannerItem {
  color: string;
}

const NEWS_CATEGORIES: string[] = ['全部', '饮食指导', '运动指南', '生活习惯', '知识科普'];

interface GenerateWrapper {
  data: ArticleGenerateCategorySelection;
}

interface GenerateArticleWrapper {
  data: Article;
}

interface GenerateRequestBody {
  category: string;
}

export function filterArticles(articles: Article[], query: string): Article[] {
  if (query === '') {
    return [...articles];
  }
  const normalizedQuery: string = query.toLowerCase();
  return articles.filter((a: Article) =>
    a.title.toLowerCase().includes(normalizedQuery) ||
    a.category.toLowerCase().includes(normalizedQuery)
  );
}

@Component
export struct NewsPage {
  private homeStore: HomeStore = HomeStore.getInstance();
  @State homeData: HomeData = this.homeStore.getHomeData();
  @State searchQuery: string = '';
  @State filteredArticles: Article[] = [];
  @State currentCategory: string = '全部';
  @State isGenerating: boolean = false;
  @State showCategoryPicker: boolean = false;
  @State categoryOptions: ArticleGenerateCategoryItem[] = [];
  private banners: BannerItem[] = [
    { color: COLOR_ACCENT_SAGE_500 },
    { color: COLOR_ACCENT_CLAY_500 },
    { color: COLOR_ACCENT_MIST_500 }
  ];

  aboutToAppear(): void {
    try { this.homeStore.refreshArticles(true).then(() => { this.homeData = this.homeStore.getHomeDataSnapshot(); }); } catch (_e) { /* ignore */ }
  }

  private isLoadingContent(): boolean {
    return this.homeData.isLoadingArticles && this.homeData.articles.length === 0;
  }

  private async startGenerate(): Promise<void> {
    if (this.isGenerating) {
      return;
    }
    if (AuthStore.getInstance().token === null) {
      promptAction.showToast({ message: '请先登录后生成资讯' });
      return;
    }
    if (!UiStore.getInstance().getUiData().disclaimerAccepted) {
      promptAction.showToast({ message: '请先同意底部免责声明' });
      return;
    }
    this.isGenerating = true;
    try {
      const client = AuthStore.getInstance().getHttpClient();
      const wrapper = await client.request<GenerateWrapper>('POST', API_ARTICLES_GENERATE, null);
      this.categoryOptions = wrapper.data.categories ?? [];
      this.isGenerating = false;
      if (this.categoryOptions.length > 0) {
        this.showCategoryPicker = true;
      } else {
        promptAction.showToast({ message: '暂无可生成的主题' });
      }
    } catch (e) {
      this.isGenerating = false;
      promptAction.showToast({ message: (e as Error).message ?? '获取主题失败' });
    }
  }

  private async generateWithCategory(category: string): Promise<void> {
    this.showCategoryPicker = false;
    this.isGenerating = true;
    promptAction.showToast({ message: '正在生成资讯，请稍候...' });
    try {
      const client = AuthStore.getInstance().getHttpClient();
      const body: GenerateRequestBody = { category: category };
      const wrapper = await client.request<GenerateArticleWrapper>('POST', API_ARTICLES_GENERATE, body);
      promptAction.showToast({ message: '生成成功' });
      if (wrapper.data !== null && wrapper.data !== undefined && wrapper.data.id > 0) {
        this.homeStore.prependArticle(wrapper.data);
        this.homeData = this.homeStore.getHomeDataSnapshot();
        router.pushUrl({ url: 'pages/ArticleDetail', params: { article_id: wrapper.data.id } });
      }
    } catch (e) {
      promptAction.showToast({ message: (e as Error).message ?? '生成失败，请稍后重试' });
    } finally {
      this.isGenerating = false;
    }
  }

  @Builder
  BannerSection() {
    Swiper() {
      if (this.homeData.articles.length > 0) {
        ForEach(this.homeData.articles.slice(0, 5), (article: Article, index: number) => {
          Stack({ alignContent: Alignment.BottomStart }) {
            // Base layer: cover image or category gradient
            if (article.cover !== null) {
              Image(imageUrl(article.cover))
                .width('100%')
                .height('100%')
                .objectFit(ImageFit.Cover)
                .backgroundColor(COLOR_INK_100)
            } else {
              Column()
                .width('100%')
                .height('100%')
                .linearGradient({
                  angle: 135,
                  colors: [[this.bannerFrom(article.category), 0], [this.bannerTo(article.category), 1]]
                })
            }

            // Large decorative watermark icon (top-right)
            Column() {
              Icon({ name: this.bannerIcon(article.category), iconSize: 96, color: 'rgba(255,255,255,0.16)' })
            }
            .width('100%')
            .alignItems(HorizontalAlign.End)
            .padding({ right: SPACE_4, top: SPACE_4 })

            // Top "精选" badge
            Row() {
              Text('精选')
                .fontSize(TYPO_CAPTION.size)
                .fontWeight(FontWeight.Medium)
                .fontColor(COLOR_PAPER_50)
                .backgroundColor(COLOR_ACCENT_SAGE_500)
                .borderRadius(RADIUS_TAG)
                .padding({ left: SPACE_2, right: SPACE_2, top: 2, bottom: 2 })
            }
            .width('100%')
            .justifyContent(FlexAlign.Start)
            .padding({ left: SPACE_4, top: SPACE_4 })
            .position({ x: 0, y: 0 })

            // Bottom info panel with gradient scrim
            Column() {
              Row() {
                Text(article.category)
                  .fontSize(TYPO_CAPTION.size)
                  .fontColor(COLOR_PAPER_50)
                  .backgroundColor('rgba(255,255,255,0.22)')
                  .borderRadius(RADIUS_TAG)
                  .padding({ left: SPACE_2, right: SPACE_2, top: 2, bottom: 2 })
                Blank()
                Icon({ name: 'VIEW', iconSize: 12, color: 'rgba(255,255,255,0.85)' })
                Text(article.views.toString())
                  .fontSize(TYPO_CAPTION.size)
                  .fontColor('rgba(255,255,255,0.85)')
                  .margin({ left: SPACE_1 })
              }
              .width('100%')

              Text(article.title)
                .fontSize(TYPO_HEADLINE.size)
                .fontWeight(FontWeight.Bold)
                .fontColor(COLOR_PAPER_50)
                .maxLines(2)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
                .margin({ top: SPACE_2 })
                .textShadow({ radius: 8, color: 'rgba(0,0,0,0.5)', offsetX: 0, offsetY: 1 })

              Text(article.summary)
                .fontSize(TYPO_CAPTION.size)
                .fontColor('rgba(255,255,255,0.9)')
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
                .margin({ top: SPACE_1 })
            }
            .alignItems(HorizontalAlign.Start)
            .width('100%')
            .padding(SPACE_4)
            .linearGradient({
              angle: 180,
              colors: [['rgba(0,0,0,0)', 0], ['rgba(0,0,0,0.55)', 0.5], ['rgba(0,0,0,0.85)', 1]]
            })
          }
          .width('100%')
          .height('100%')
          .borderRadius(RADIUS_CARD_OUTER)
          .clip(true)
          .onClick(() => {
            router.pushUrl({ url: 'pages/ArticleDetail', params: { article_id: article.id } })
          })
        }, (article: Article, index: number) => article.id.toString())
      } else {
        ForEach(this.banners, (item: BannerItem, index: number) => {
          Column()
            .width('100%')
            .height('100%')
            .backgroundColor(item.color)
            .borderRadius(RADIUS_CARD_OUTER)
        }, (item: BannerItem, index: number) => index.toString())
      }
    }
    .autoPlay(true)
    .interval(4000)
    .loop(true)
    .itemSpace(SPACE_2)
    .indicator(
      Indicator.dot()
        .bottom(SPACE_2)
        .itemWidth(6)
        .itemHeight(6)
        .selectedItemWidth(18)
        .selectedItemHeight(6)
        .color('rgba(255,255,255,0.5)')
        .selectedColor(COLOR_PAPER_50)
    )
    .width('100%')
    .height(SPACE_12 + SPACE_12)
    .borderRadius(RADIUS_CARD_OUTER)
    .shadow({ radius: SHADOW_AMBIENT_E2.radius, color: SHADOW_AMBIENT_E2.color, offsetX: 0, offsetY: SHADOW_AMBIENT_E2.offsetY })
    .margin({ left: SPACE_4, right: SPACE_4, top: SPACE_2 })
  }

  private bannerFrom(category: string): string {
    if (category.indexOf('饮食') >= 0) { return COLOR_ACCENT_SAGE_500; }
    if (category.indexOf('运动') >= 0) { return COLOR_ACCENT_CLAY_500; }
    if (category.indexOf('生活') >= 0) { return COLOR_ACCENT_MIST_500; }
    return COLOR_ACCENT_SAND_500;
  }

  private bannerTo(category: string): string {
    if (category.indexOf('饮食') >= 0) { return COLOR_ACCENT_SAGE_300; }
    if (category.indexOf('运动') >= 0) { return COLOR_ACCENT_CLAY_300; }
    if (category.indexOf('生活') >= 0) { return COLOR_ACCENT_SAGE_300; }
    return COLOR_ACCENT_CLAY_300;
  }

  private bannerIcon(category: string): string {
    if (category.indexOf('饮食') >= 0) { return 'FORK_KNIFE'; }
    if (category.indexOf('运动') >= 0) { return 'RUN'; }
    if (category.indexOf('生活') >= 0) { return 'CHECK'; }
    return 'NEWS';
  }

  @Builder
  CategoryTabs() {
    Scroll() {
      Row({ space: SPACE_2 }) {
        ForEach(NEWS_CATEGORIES, (cat: string) => {
          Text(cat)
            .fontSize(TYPO_BODY.size)
            .fontColor(this.currentCategory === cat ? COLOR_PAPER_50 : COLOR_INK_600)
            .fontWeight(this.currentCategory === cat ? FontWeight.Medium : FontWeight.Normal)
            .backgroundColor(this.currentCategory === cat ? COLOR_ACCENT_SAGE_500 : COLOR_PAPER_50)
            .borderRadius(RADIUS_PILL)
            .border(this.currentCategory === cat ? { width: 0 } : { width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
            .padding({ left: SPACE_4, right: SPACE_4, top: SPACE_2, bottom: SPACE_2 })
            .onClick(() => { this.selectCategory(cat); })
        }, (cat: string) => cat)
      }
      .padding({ left: SPACE_4, right: SPACE_4 })
    }
    .scrollable(ScrollDirection.Horizontal)
    .scrollBar(BarState.Off)
    .width('100%')
    .margin({ top: SPACE_3 })
  }

  private selectCategory(cat: string): void {
    if (this.currentCategory === cat) {
      return;
    }
    this.currentCategory = cat;
    this.searchQuery = '';
    this.homeStore.setArticleCategory(cat === '全部' ? '' : cat);
    this.homeStore.refreshArticles(true).then(() => {
      this.homeData = this.homeStore.getHomeDataSnapshot();
    });
  }

  @Builder
  SearchBar() {
    Row() {
      Search({
        value: this.searchQuery,
        placeholder: '搜索资讯'
      })
        .onChange((value: string) => {
          this.searchQuery = value;
          this.filteredArticles = filterArticles(this.homeData.articles, value);
        })
        .layoutWeight(1)
    }
    .backgroundColor(COLOR_PAPER_50)
    .borderRadius(RADIUS_CELL)
    .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
    .padding(SPACE_3)
    .margin({ left: SPACE_4, right: SPACE_4 })
  }

  @Builder
  ArticleCard(article: Article) {
    PressableCard({
      marginBottom: SPACE_3,
      onTap: () => {
        router.pushUrl({ url: 'pages/ArticleDetail', params: { article_id: article.id } })
      }
    }) {
      Row() {
        ArticleCover({ cover: article.cover, category: article.category, coverWidth: 60, coverHeight: 60, radius: RADIUS_MEDIA, iconSize: 24 })

        Column() {
          Text(article.title)
            .fontSize(TYPO_SUBTITLE.size)
            .fontWeight(TYPO_SUBTITLE.weight)
            .fontColor(COLOR_INK_700)
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })

          Text(article.summary)
            .fontSize(TYPO_BODY.size)
            .fontWeight(TYPO_BODY.weight)
            .fontColor(COLOR_INK_500)
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .margin({ top: SPACE_1 })

          Row() {
            Text(article.category)
              .fontSize(TYPO_CAPTION.size)
              .fontColor(COLOR_ACCENT_SAGE_500)
              .backgroundColor(COLOR_PAPER_100)
              .borderRadius(RADIUS_TAG)
              .padding({
                left: SPACE_2,
                right: SPACE_2,
                top: SPACE_1,
                bottom: SPACE_1
              })

            Blank()

            Icon({
              name: 'VIEW',
              iconSize: 12,
              color: COLOR_INK_400
            })

            Text(article.views.toString())
              .fontSize(TYPO_CAPTION.size)
              .fontColor(COLOR_INK_400)
              .margin({ left: SPACE_1 })

            Text(timeAgo(Date.parse(article.created_at)))
              .fontSize(TYPO_CAPTION.size)
              .fontColor(COLOR_INK_400)
              .margin({ left: SPACE_2 })
          }
          .width('100%')
        }
        .layoutWeight(1)
        .margin({ left: SPACE_3 })
      }
      .width('100%')
    }
  }

  @Builder
  GenerateFab() {
    Row() {
      if (this.isGenerating) {
        LoadingProgress().width(20).height(20).color(COLOR_PAPER_50)
      } else {
        Icon({ name: 'EDIT', iconSize: 18, color: COLOR_PAPER_50 })
      }
      Text(this.isGenerating ? '生成中' : '生成资讯')
        .fontSize(TYPO_LABEL.size).fontWeight(FontWeight.Medium).fontColor(COLOR_PAPER_50)
        .margin({ left: SPACE_2 })
    }
    .padding({ left: SPACE_4, right: SPACE_4, top: SPACE_3, bottom: SPACE_3 })
    .backgroundColor(COLOR_ACCENT_SAGE_500)
    .borderRadius(RADIUS_PILL)
    .margin({ right: SPACE_4, bottom: SPACE_9 + SPACE_4 })
    .shadow({ radius: SHADOW_AMBIENT_E2.radius, color: SHADOW_AMBIENT_E2.color, offsetX: 0, offsetY: SHADOW_AMBIENT_E2.offsetY })
    .onClick(() => { this.startGenerate(); })
  }

  @Builder
  CategoryPicker() {
    Column() {
      Column() {
        Text('选择生成主题')
          .fontSize(TYPO_TITLE.size).fontWeight(TYPO_TITLE.weight).fontColor(COLOR_INK_700)
          .width('100%')
        Text('AI 将为你生成一篇专属健康资讯')
          .fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_400)
          .width('100%').margin({ top: SPACE_1 })

        ForEach(this.categoryOptions, (item: ArticleGenerateCategoryItem) => {
          Row() {
            Column() {
              Row() {
                Text(item.label)
                  .fontSize(TYPO_BODY.size).fontWeight(FontWeight.Medium).fontColor(COLOR_INK_700)
                if (item.recommended === true) {
                  Text('推荐')
                    .fontSize(10).fontColor(COLOR_PAPER_50)
                    .backgroundColor(COLOR_ACCENT_SAGE_500).borderRadius(RADIUS_TAG)
                    .padding({ left: SPACE_2, right: SPACE_2, top: 1, bottom: 1 })
                    .margin({ left: SPACE_2 })
                }
              }
              if (item.reason !== null && item.reason.length > 0) {
                Text(item.reason)
                  .fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_500)
                  .width('100%').margin({ top: 2 })
              }
            }
            .layoutWeight(1).alignItems(HorizontalAlign.Start)
            Icon({ name: 'CHEVRON_RIGHT', iconSize: 16, color: COLOR_INK_300 })
          }
          .width('100%')
          .padding({ top: SPACE_3, bottom: SPACE_3 })
          .border({ width: { bottom: STROKE_HAIRLINE.width }, color: STROKE_HAIRLINE.color })
          .onClick(() => { this.generateWithCategory(item.label); })
        }, (item: ArticleGenerateCategoryItem) => item.label)

        Button('取消')
          .fontSize(TYPO_BODY.size).fontColor(COLOR_INK_600)
          .backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_PILL)
          .width('100%').height(SPACE_9).margin({ top: SPACE_4 })
          .onClick(() => { this.showCategoryPicker = false; })
      }
      .width('100%')
      .backgroundColor(COLOR_PAPER_50)
      .borderRadius({ topLeft: RADIUS_CARD_OUTER, topRight: RADIUS_CARD_OUTER })
      .padding(SPACE_4)
    }
    .width('100%').height('100%')
    .justifyContent(FlexAlign.End)
    .backgroundColor('rgba(0,0,0,0.4)')
    .onClick(() => { this.showCategoryPicker = false; })
  }

  build() {
    Stack({ alignContent: Alignment.BottomEnd }) {
      Scroll() {
      Column() {
        this.BannerSection()
        this.SearchBar()
        this.CategoryTabs()

        if (this.isLoadingContent()) {
          SkeletonLoader({ variant: 'lines', count: 5, lineHeight: SPACE_12 })
        }
        else if (!this.homeData.isLoadingArticles && this.homeData.articles.length === 0) {
          EmptyState({ title: EMPTY_MESSAGES.NO_ARTICLES, description: '暂无健康科普文章' })
        }
        else {
          Column() {
            ForEach(
              this.searchQuery === '' ? this.homeData.articles : this.filteredArticles,
              (article: Article, index: number) => {
                FadeInUp({ index: index }) {
                  this.ArticleCard(article)
                }
              },
              (article: Article) => article.id.toString()
            )

            if (this.searchQuery !== '' && this.filteredArticles.length === 0) {
              Text('未找到相关资讯')
                .fontSize(TYPO_BODY.size)
                .fontWeight(TYPO_BODY.weight)
                .fontColor(COLOR_INK_400)
                .textAlign(TextAlign.Center)
                .width('100%')
            }
          }
          .margin({ left: SPACE_4, right: SPACE_4 })

          if (this.homeData.isLoadingArticles && this.homeData.articles.length > 0) {
            Text('加载更多...')
              .fontSize(TYPO_LABEL.size)
              .fontColor(COLOR_INK_400)
              .textAlign(TextAlign.Center)
              .width('100%')
          }
          else if (!this.homeData.articlesHasMore && this.homeData.articles.length > 0) {
            Text('\u2014\u2014 没有更多了 \u2014\u2014')
              .fontSize(TYPO_CAPTION.size)
              .fontColor(COLOR_INK_300)
              .textAlign(TextAlign.Center)
              .width('100%')
          }
        }

        Blank().height(SPACE_9 + SPACE_7)
      }
    }
    .backgroundColor(COLOR_PAPER_100)
    .onReachEnd(() => { this.homeStore.loadMoreArticles() })

      this.GenerateFab()

      if (this.showCategoryPicker) {
        this.CategoryPicker()
      }
    }
    .width('100%').height('100%')
  }
}
