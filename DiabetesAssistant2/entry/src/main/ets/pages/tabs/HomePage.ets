import { router } from '@kit.ArkUI';
import { HomeStore } from '../../stores/HomeStore';
import { Doctor, Article, DiabetesType } from '../../types/models';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { EmptyState, EMPTY_MESSAGES } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { PressableCard } from '../../components/PressableCard';
import { FadeInUp } from '../../components/FadeInUp';
import { ArticleCover } from '../../components/ArticleCover';
import { timeAgo, imageUrl } from '../../utils/Helpers';
import {
  COLOR_INK_800, COLOR_INK_700, COLOR_INK_500, COLOR_INK_400,
  COLOR_INK_300, COLOR_INK_100,
  COLOR_ACCENT_SAGE_500, COLOR_ACCENT_CLAY_500,
  COLOR_ACCENT_MIST_500, COLOR_ACCENT_SAND_500,
  COLOR_PAPER_50, COLOR_PAPER_100,
  TYPO_HEADLINE, TYPO_SUBTITLE, TYPO_BODY, TYPO_BODY_STRONG,
  TYPO_TITLE, TYPO_LABEL, TYPO_CAPTION,
  RADIUS_CARD_OUTER, RADIUS_CELL, RADIUS_MEDIA, RADIUS_TAG,
  STROKE_HAIRLINE,
  SPACE_1, SPACE_2, SPACE_3, SPACE_4, SPACE_7, SPACE_9, SPACE_12
} from '../../common/constants/DesignTokens';

interface BannerItem { color: string; }

@Component
export struct HomePage {
  private homeStore: HomeStore = HomeStore.getInstance();
  @State doctors: Doctor[] = [];
  @State articles: Article[] = [];
  @State diabetesTypes: DiabetesType[] = [];
  @State showContent: boolean = false;
  private banners: BannerItem[] = [
    { color: COLOR_ACCENT_SAGE_500 },
    { color: COLOR_ACCENT_CLAY_500 },
    { color: COLOR_ACCENT_MIST_500 }
  ];

  aboutToAppear(): void {
    try {
      this.homeStore.refreshAll().then(() => {
        const snapshot = this.homeStore.getHomeDataSnapshot();
        this.doctors = [...snapshot.doctors];
        this.articles = [...snapshot.articles];
        this.diabetesTypes = [...snapshot.diabetesTypes];
        this.showContent = true;
      });
    } catch (_e) { /* ignore */ }
  }

  build() {
    Scroll() {
      Column({ space: SPACE_4 }) {
        Swiper() {
          if (this.articles.length > 0) {
            ForEach(this.articles.slice(0, 3), (article: Article, index: number) => {
            Stack({ alignContent: Alignment.BottomStart }) {
                Image(imageUrl(article.cover)).width('100%').height(SPACE_12 + SPACE_7)
                  .borderRadius(RADIUS_CARD_OUTER).objectFit(ImageFit.Cover)
                Column() {
                  Text(article.category)
                    .fontSize(TYPO_CAPTION.size).fontColor(COLOR_PAPER_50)
                    .backgroundColor('rgba(255,255,255,0.25)')
                    .borderRadius(RADIUS_TAG)
                    .padding({ left: SPACE_2, right: SPACE_2, top: 2, bottom: 2 })
                  Text(article.title)
                    .fontSize(TYPO_TITLE.size).fontWeight(FontWeight.Bold).fontColor(COLOR_PAPER_50)
                    .maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis })
                    .margin({ top: SPACE_1 })
                    .textShadow({ radius: 8, color: 'rgba(0,0,0,0.6)', offsetX: 0, offsetY: 1 })
                }
                .width('100%').alignItems(HorizontalAlign.Start).padding(SPACE_4)
                .linearGradient({
                  angle: 180,
                  colors: [['rgba(0,0,0,0)', 0], ['rgba(0,0,0,0.75)', 1]]
                })
                .borderRadius({ bottomLeft: RADIUS_CARD_OUTER, bottomRight: RADIUS_CARD_OUTER })
              }
              .width('100%').height(SPACE_12 + SPACE_7)
            }, (_item: Article, i: number) => i.toString())
          } else {
            ForEach(this.banners, (item: BannerItem, index: number) => {
              Column()
                .width('100%').height(SPACE_12 + SPACE_7)
                .borderRadius(RADIUS_CARD_OUTER).backgroundColor(item.color)
                .justifyContent(FlexAlign.Center)
              Text(item.color === COLOR_ACCENT_SAGE_500 ? '糖尿病预防与管理' :
                   item.color === COLOR_ACCENT_CLAY_500 ? '科学饮食与运动方案' : 'AI智能健康助手')
                .fontSize(TYPO_HEADLINE.size).fontColor(COLOR_PAPER_50)
            }, (_item: BannerItem, i: number) => i.toString())
          }
        }
        .autoPlay(true).loop(true).width('100%').height(SPACE_12 + SPACE_7)
        .margin({ left: SPACE_4, right: SPACE_4 })

        if (this.showContent) {
          Column() {
            Row() {
              Text('咨询医师').fontSize(TYPO_HEADLINE.size).fontWeight(TYPO_HEADLINE.weight).fontColor(COLOR_INK_800)
            }
            .width('100%').padding({ left: SPACE_4, right: SPACE_4 })

            if (this.doctors.length > 0) {
              Scroll() {
                Row({ space: SPACE_3 }) {
                  ForEach(this.doctors, (doctor: Doctor) => {
                    PressableCard({
                      cardWidth: 140,
                      onTap: () => { router.pushUrl({ url: 'pages/DoctorChat', params: { doctor_id: doctor.id } }) }
                    }) {
                      Column() {
                        Stack() {
                          Circle().width(SPACE_9).height(SPACE_9).fill(COLOR_INK_100)
                          if (doctor.avatar !== null) {
                            Image(imageUrl(doctor.avatar)).width(SPACE_9).height(SPACE_9)
                              .borderRadius(SPACE_9 / 2).clip(true)
                          } else {
                            Text(doctor.name[0]).fontSize(TYPO_TITLE.size).fontColor(COLOR_INK_500)
                          }
                        }
                        Text(doctor.name).fontSize(TYPO_SUBTITLE.size).fontWeight(TYPO_SUBTITLE.weight).fontColor(COLOR_INK_700).maxLines(1)
                        Text(doctor.department).fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_400).maxLines(1)
                      }
                      .width('100%')
                    }
                  }, (doctor: Doctor) => doctor.id.toString())
                }
              }
              .scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).width('100%')
            } else {
              EmptyState({ title: '暂无医师', description: '暂无在线咨询医师' })
            }
          }

          Column() {
            Row() {
              Text('健康科普').fontSize(TYPO_HEADLINE.size).fontWeight(TYPO_HEADLINE.weight).fontColor(COLOR_INK_800)
            }
            .width('100%').padding({ left: SPACE_4, right: SPACE_4 })

            if (this.articles.length > 0) {
              ForEach(this.articles, (article: Article, index: number) => {
                FadeInUp({ index: index }) {
                  PressableCard({
                    marginHorizontal: SPACE_4,
                    marginBottom: SPACE_3,
                    onTap: () => { router.pushUrl({ url: 'pages/ArticleDetail', params: { article_id: article.id } }) }
                  }) {
                  Row() {
                    Column() {
                      ArticleCover({ cover: article.cover, category: article.category, coverWidth: 56, coverHeight: 56, radius: RADIUS_MEDIA, iconSize: 24 })
                    }
                    Column() {
                      Text(article.title).fontSize(TYPO_SUBTITLE.size).fontWeight(TYPO_SUBTITLE.weight).fontColor(COLOR_INK_700).maxLines(2)
                      Text(article.summary).fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_500).maxLines(2).margin({ top: SPACE_1 })
                      Row() {
                        Text(article.category).fontSize(TYPO_CAPTION.size).fontColor(COLOR_ACCENT_SAGE_500)
                        Blank()
                        Text(timeAgo(Date.parse(article.created_at))).fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_400)
                      }
                    }
                    .layoutWeight(1).margin({ left: SPACE_3 })
                  }
                  .width('100%')
                  }
                }
              }, (article: Article) => article.id.toString())
            } else {
              EmptyState({ title: EMPTY_MESSAGES.NO_ARTICLES, description: '暂无健康科普文章' })
            }
          }

          Column() {
            Row() {
              Text('了解糖尿病').fontSize(TYPO_HEADLINE.size).fontWeight(TYPO_HEADLINE.weight).fontColor(COLOR_INK_800)
            }
            .width('100%').padding({ left: SPACE_4, right: SPACE_4 })

            if (this.diabetesTypes.length > 0) {
              Grid() {
                ForEach(this.diabetesTypes, (item: DiabetesType, index: number) => {
                  GridItem() {
                    PressableCard({
                      onTap: () => { router.pushUrl({ url: 'pages/DiabetesDetail', params: { name: item.name, patho: item.pathogenesis, manif: item.manifestation, treat: item.treatment } }) }
                    }) {
                      Column() {
                        if (item.image !== null) {
                          Image(imageUrl(item.image))
                            .width('100%').height(100)
                            .borderRadius(RADIUS_CELL).objectFit(ImageFit.Cover)
                        } else {
                          Stack() {
                            Circle().width(40).height(40).fill(this.getDiabetesTypeColor(index))
                            Text(this.getDiabetesTypeShortName(index)).fontSize(TYPO_LABEL.size).fontColor(COLOR_PAPER_50)
                          }
                        }
                        Text(item.name).fontSize(TYPO_BODY_STRONG.size).fontColor(COLOR_INK_700).margin({ top: SPACE_2 })
                      }
                      .width('100%')
                    }
                  }
                }, (item: DiabetesType) => item.id.toString())
              }
              .columnsTemplate('1fr 1fr').columnsGap(SPACE_3).rowsGap(SPACE_3)
              .padding({ left: SPACE_4, right: SPACE_4 })
            } else {
              EmptyState({ title: '暂无类型数据', description: '糖尿病类型数据加载中' })
            }
          }
        } else {
          SkeletonLoader({ variant: 'card', count: 3, loading: true })
        }

        Blank().height(SPACE_9 + SPACE_7)
      }
      .width('100%').padding({ top: SPACE_4 })
    }
    .scrollable(ScrollDirection.Vertical).scrollBar(BarState.Off)
    .backgroundColor(COLOR_PAPER_100)
  }

  private getDiabetesTypeColor(index: number): string {
    if (index === 0) { return COLOR_ACCENT_SAGE_500 }
    if (index === 1) { return COLOR_ACCENT_CLAY_500 }
    if (index === 2) { return COLOR_ACCENT_MIST_500 }
    return COLOR_ACCENT_SAND_500
  }

  private getDiabetesTypeShortName(index: number): string {
    if (index === 0) { return '1型' }
    if (index === 1) { return '2型' }
    if (index === 2) { return '妊娠' }
    return '其他'
  }
}
