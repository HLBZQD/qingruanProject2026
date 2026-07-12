import { router, promptAction } from '@kit.ArkUI';
import { HomeStore, HomeData } from '../../stores/HomeStore';
import { UiStore } from '../../stores/UiStore';
import { Doctor } from '../../types/models';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { ErrorRetry } from '../../components/ErrorRetry';
import { EmptyState, EMPTY_MESSAGES } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { imageUrl } from '../../utils/Helpers';
import {
  COLOR_PAPER_50, COLOR_PAPER_100,
  COLOR_ACCENT_SAGE_500,
  COLOR_INK_800, COLOR_INK_700, COLOR_INK_600, COLOR_INK_500, COLOR_INK_400,
  COLOR_INK_300, COLOR_INK_100,
  TYPO_TITLE, TYPO_SUBTITLE, TYPO_BODY, TYPO_CAPTION, TYPO_EYEBROW,
  RADIUS_CELL, RADIUS_PILL_MINI,
  STROKE_HAIRLINE,
  SHADOW_AMBIENT_E2,
  SPACE_1, SPACE_2, SPACE_3, SPACE_4, SPACE_7, SPACE_9
} from '../../common/constants/DesignTokens';

interface RouterParams {
  doctor_id: number;
}

export function filterDoctors(doctors: Doctor[], query: string): Doctor[] {
  if (doctors === null || doctors === undefined) {
    return [];
  }
  if (query === '') {
    return [...doctors];
  }
  const normalizedQuery: string = query.toLowerCase();
  return doctors.filter((d: Doctor) => d.name.toLowerCase().includes(normalizedQuery));
}

export interface DoctorGroup {
  department: string;
  doctors: Doctor[];
}

export function groupByDepartment(doctors: Doctor[]): DoctorGroup[] {
  const groups: DoctorGroup[] = [];
  for (let i = 0; i < doctors.length; i++) {
    const doctor: Doctor = doctors[i];
    let found: DoctorGroup | null = null;
    for (let j = 0; j < groups.length; j++) {
      if (groups[j].department === doctor.department) {
        found = groups[j];
        break;
      }
    }
    if (found === null) {
      groups.push({ department: doctor.department, doctors: [doctor] });
    } else {
      found.doctors.push(doctor);
    }
  }
  return groups;
}

const SUGGESTED_QUESTIONS: string[] = [
  '我的血糖偏高，饮食上要注意什么？',
  '糖尿病前期可以逆转吗？',
  '运动对控制血糖有帮助吗？'
];

@Component
export struct ConsultationPage {
  @State searchQuery: string = '';
  @State filteredDoctors: Doctor[] = [];
  private homeStore: HomeStore = HomeStore.getInstance();
  @State homeData: HomeData = this.homeStore.getHomeData();

  aboutToAppear(): void {
    try { this.homeStore.refreshDoctors().then(() => { this.homeData = this.homeStore.getHomeDataSnapshot(); }); } catch (_e) { /* ignore */ }
  }

  private isLoadingContent(): boolean {
    return this.homeData.isLoadingDoctors && this.homeData.doctors.length === 0;
  }

  private currentDoctors(): Doctor[] {
    return this.searchQuery === '' ? this.homeData.doctors : this.filteredDoctors;
  }

  private goAiChat(): void {
    const uiData = UiStore.getInstance().getUiData();
    if (!uiData.disclaimerAccepted) {
      promptAction.showToast({ message: '请先同意免责声明' });
      return;
    }
    router.pushUrl({ url: 'pages/AiChatPage' });
  }

  private goAiChatWith(question: string): void {
    const uiData = UiStore.getInstance().getUiData();
    if (!uiData.disclaimerAccepted) {
      promptAction.showToast({ message: '请先同意免责声明' });
      return;
    }
    router.pushUrl({ url: 'pages/AiChatPage', params: { question: question } });
  }

  @Builder
  SearchBar() {
    Row() {
      Search({
        value: this.searchQuery,
        placeholder: '搜索医师'
      })
        .onChange((value: string) => {
          this.searchQuery = value;
          this.filteredDoctors = filterDoctors(this.homeData.doctors, value);
        })
        .layoutWeight(1)
    }
    .backgroundColor(COLOR_PAPER_50)
    .borderRadius(RADIUS_CELL)
    .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
    .padding(SPACE_3)
    .margin({ left: SPACE_4, right: SPACE_4, top: SPACE_3, bottom: SPACE_3 })
  }

  @Builder
  AiConsultCard() {
    Column() {
      Row() {
        Column() {
          Icon({ name: 'CHAT', iconSize: 28, color: COLOR_PAPER_50 })
        }
        .width(52).height(52)
        .borderRadius(26)
        .backgroundColor('rgba(255,255,255,0.22)')
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)

        Column() {
          Row() {
            Text('AI 健康助手')
              .fontSize(TYPO_TITLE.size)
              .fontWeight(TYPO_TITLE.weight)
              .fontColor(COLOR_PAPER_50)
            Text('在线')
              .fontSize(TYPO_EYEBROW.size)
              .fontColor(COLOR_PAPER_50)
              .backgroundColor('rgba(255,255,255,0.25)')
              .borderRadius(RADIUS_PILL_MINI)
              .padding({ left: SPACE_2, right: SPACE_2, top: 2, bottom: 2 })
              .margin({ left: SPACE_2 })
          }
          Text('随时提问，即时解答健康疑问')
            .fontSize(TYPO_CAPTION.size)
            .fontColor('rgba(255,255,255,0.85)')
            .margin({ top: SPACE_1 })
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
        .margin({ left: SPACE_3 })

        Icon({ name: 'CHEVRON_RIGHT', iconSize: 18, color: COLOR_PAPER_50 })
      }
      .width('100%')

      Column() {
        ForEach(SUGGESTED_QUESTIONS, (q: string) => {
          Row() {
            Text(q)
              .fontSize(TYPO_CAPTION.size)
              .fontColor(COLOR_PAPER_50)
              .layoutWeight(1)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
            Icon({ name: 'CHEVRON_RIGHT', iconSize: 12, color: 'rgba(255,255,255,0.7)' })
          }
          .width('100%')
          .backgroundColor('rgba(255,255,255,0.14)')
          .borderRadius(RADIUS_PILL_MINI)
          .padding({ left: SPACE_3, right: SPACE_3, top: SPACE_2, bottom: SPACE_2 })
          .margin({ top: SPACE_2 })
          .onClick(() => { this.goAiChatWith(q); })
        }, (q: string) => q)
      }
      .width('100%')
      .margin({ top: SPACE_3 })
    }
    .width('100%')
    .backgroundColor(COLOR_ACCENT_SAGE_500)
    .borderRadius(RADIUS_CELL)
    .padding(SPACE_4)
    .margin({ left: SPACE_4, right: SPACE_4, top: SPACE_1, bottom: SPACE_4 })
    .shadow({ radius: SHADOW_AMBIENT_E2.radius, color: SHADOW_AMBIENT_E2.color, offsetX: 0, offsetY: SHADOW_AMBIENT_E2.offsetY })
    .onClick(() => { this.goAiChat(); })
  }

  @Builder
  DoctorListItem(doctor: Doctor) {
    Row() {
      Stack() {
        Circle()
          .width(40)
          .height(40)
          .fill(COLOR_INK_100)
        if (doctor.avatar !== null) {
          Image(imageUrl(doctor.avatar))
            .width(40)
            .height(40)
            .borderRadius(20)
            .clip(true)
            .backgroundColor(COLOR_INK_100)
        } else {
          Text(doctor.name[0])
            .fontSize(TYPO_TITLE.size)
            .fontWeight(TYPO_TITLE.weight)
            .fontColor(COLOR_INK_500)
        }
      }

      Column() {
        Text(doctor.name)
          .fontSize(TYPO_SUBTITLE.size)
          .fontWeight(TYPO_SUBTITLE.weight)
          .fontColor(COLOR_INK_700)
        Text(doctor.department + ' \u00B7 ' + doctor.title)
          .fontSize(TYPO_CAPTION.size)
          .fontWeight(TYPO_CAPTION.weight)
          .fontColor(COLOR_INK_400)
        Text(doctor.description)
          .fontSize(TYPO_CAPTION.size)
          .fontWeight(TYPO_CAPTION.weight)
          .fontColor(COLOR_INK_500)
          .maxLines(2)
      }
      .layoutWeight(1)
      .margin({ left: SPACE_3 })
      Icon({ name: 'CHEVRON_RIGHT', iconSize: 16, color: COLOR_INK_300 })
    }
    .width('100%')
    .backgroundColor(COLOR_PAPER_50)
    .borderRadius(RADIUS_CELL)
    .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
    .padding(SPACE_3)
    .margin({ left: SPACE_4, right: SPACE_4, bottom: SPACE_3 })
    .onClick(() => {
      router.pushUrl({
        url: 'pages/DoctorChat',
        params: { doctor_id: doctor.id } as RouterParams
      })
    })
  }

  @Builder
  DepartmentHeader(department: string, count: number) {
    Row() {
      Column()
        .width(3).height(14)
        .backgroundColor(COLOR_ACCENT_SAGE_500)
        .borderRadius(2)
      Text(department)
        .fontSize(TYPO_SUBTITLE.size)
        .fontWeight(TYPO_SUBTITLE.weight)
        .fontColor(COLOR_INK_800)
        .margin({ left: SPACE_2 })
      Text(count.toString() + ' 位')
        .fontSize(TYPO_CAPTION.size)
        .fontColor(COLOR_INK_400)
        .margin({ left: SPACE_2 })
    }
    .width('100%')
    .padding({ left: SPACE_4, right: SPACE_4, top: SPACE_2, bottom: SPACE_2 })
  }

  build() {
    Scroll() {
      Column() {
        this.SearchBar()
        if (this.isLoadingContent()) {
          Column() {
            SkeletonLoader({ variant: 'avatar-list' })
            SkeletonLoader({ variant: 'avatar-list' })
            SkeletonLoader({ variant: 'avatar-list' })
          }
        }
        else if (!this.homeData.isLoadingDoctors && this.homeData.doctors.length === 0) {
          EmptyState({ title: EMPTY_MESSAGES.NO_DOCTOR, description: '暂无可咨询的医师' })
        }
        else {
          this.AiConsultCard()

          if (this.currentDoctors().length === 0 && this.searchQuery !== '') {
            Text('无匹配医师')
              .fontSize(TYPO_BODY.size)
              .fontWeight(TYPO_BODY.weight)
              .fontColor(COLOR_INK_400)
              .textAlign(TextAlign.Center)
              .width('100%')
              .padding(SPACE_4)
          } else {
            ForEach(groupByDepartment(this.currentDoctors()), (group: DoctorGroup) => {
              this.DepartmentHeader(group.department, group.doctors.length)
              ForEach(group.doctors, (doctor: Doctor) => {
                this.DoctorListItem(doctor)
              }, (doctor: Doctor) => doctor.id.toString())
            }, (group: DoctorGroup) => group.department)
          }

          Blank().height(SPACE_4)
        }
      }
    }
    .backgroundColor(COLOR_PAPER_100)
  }
}
