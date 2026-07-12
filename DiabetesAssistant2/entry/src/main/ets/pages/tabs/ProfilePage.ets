import { router } from '@kit.ArkUI';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { fileIo } from '@kit.CoreFileKit';
import { http } from '@kit.NetworkKit';
import { AuthStore } from '../../stores/AuthStore';
import { ChatStore } from '../../stores/ChatStore';
import { RiskFormStore } from '../../stores/RiskFormStore';
import { UiStore } from '../../stores/UiStore';
import { User } from '../../types/models';
import { imageUrl } from '../../utils/Helpers';
import { UpdateProfileRequest } from '../../types/api';
import { Icon } from '../../components/Icon';
import { EmptyState } from '../../components/EmptyState';
import { BASE_URL, API_UPLOAD_AVATAR, API_USER_PROFILE } from '../../common/constants/ApiEndpoints';
import {
  COLOR_PAPER_50, COLOR_PAPER_100,
  COLOR_ACCENT_CLAY_500, COLOR_ACCENT_SAGE_500, COLOR_ACCENT_MIST_500,
  COLOR_DANGER_600,
  COLOR_INK_700, COLOR_INK_500, COLOR_INK_400, COLOR_INK_100,
  TYPO_TITLE, TYPO_BODY, TYPO_CAPTION,
  RADIUS_CELL, RADIUS_PILL,
  STROKE_HAIRLINE,
  SPACE_1, SPACE_2, SPACE_3, SPACE_4, SPACE_7, SPACE_9
} from '../../common/constants/DesignTokens';
import { RISK, HEALTH_ADVICE, CHANGE_PASSWORD, ADMIN, LOGIN, PUNCH, COLLECTIONS } from '../../common/constants/RouteNames';

export interface MenuItemData {
  text: string;
  iconName: string;
  routeName: string;
  adminOnly: boolean;
  isLogout: boolean;
}

export const PROFILE_MENU_ITEMS: MenuItemData[] = [
  { text: '糖尿病风险预测', iconName: 'INFO', routeName: RISK, adminOnly: false, isLogout: false },
  { text: '打卡记录与分析', iconName: 'CHECK', routeName: PUNCH, adminOnly: false, isLogout: false },
  { text: '我的收藏', iconName: 'STAR', routeName: COLLECTIONS, adminOnly: false, isLogout: false },
  { text: '健康建议', iconName: 'INFO', routeName: HEALTH_ADVICE, adminOnly: false, isLogout: false },
  { text: '修改密码', iconName: 'EDIT', routeName: CHANGE_PASSWORD, adminOnly: false, isLogout: false },
  { text: '智能管理', iconName: 'WARNING', routeName: ADMIN, adminOnly: true, isLogout: false },
  { text: '退出登录', iconName: 'LOGOUT', routeName: '', adminOnly: false, isLogout: true },
];

@Component
export struct ProfilePage {
  @StorageLink('AUTH_USER') user: User | null = null;
  @StorageLink('AUTH_ROLE') role: 'user' | 'admin' | null = null;
  @State isUploading: boolean = false;

  @Builder
  ProfileHeader() {
    Column() {
      Stack() {
        if (this.user && this.user.avatar) {
          Image(imageUrl(this.user.avatar))
            .objectFit(ImageFit.Cover)
            .width(100)
            .height(100)
            .borderRadius(50)
            .clip(true)
            .backgroundColor(COLOR_INK_100)
        } else {
          Stack() {
            Circle({ width: 100, height: 100 })
              .fill(COLOR_INK_100)
            Icon({ name: 'USER', iconSize: 36, color: COLOR_INK_400 })
          }
          .width(100)
          .height(100)
        }

        Column() {
          Icon({ name: 'EDIT', iconSize: 14, color: COLOR_ACCENT_SAGE_500 })
        }
        .width(28).height(28)
        .borderRadius(14)
        .backgroundColor(COLOR_PAPER_50)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .position({ x: 72, y: 72 })
      }
      .width(100).height(100)
      .onClick(() => { this.pickAndUploadAvatar(); })

      Text(this.user ? this.user.username : '')
        .fontSize(TYPO_TITLE.size)
        .fontWeight(TYPO_TITLE.weight)
        .fontColor(COLOR_INK_700)
        .textAlign(TextAlign.Center)
        .margin({ top: SPACE_3 })
      Text(this.role === 'admin' ? '管理员' : '普通用户')
        .fontSize(TYPO_CAPTION.size)
        .fontWeight(TYPO_CAPTION.weight)
        .fontColor(this.role === 'admin' ? COLOR_ACCENT_CLAY_500 : COLOR_ACCENT_SAGE_500)
        .backgroundColor(COLOR_PAPER_100)
        .borderRadius(RADIUS_PILL)
        .padding({ left: SPACE_3, right: SPACE_3, top: SPACE_1, bottom: SPACE_1 })
        .margin({ top: SPACE_2 })

      if (this.isUploading) {
        Text('上传中...')
          .fontSize(TYPO_CAPTION.size).fontColor(COLOR_ACCENT_MIST_500)
          .margin({ top: SPACE_1 })
      }
    }
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor(COLOR_PAPER_50)
    .borderRadius(RADIUS_CELL)
    .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
    .padding(SPACE_4)
    .margin({ left: SPACE_4, right: SPACE_4 })
  }

  async pickAndUploadAvatar(): Promise<void> {
    try {
      let picker = new photoAccessHelper.PhotoViewPicker();
      let result = await picker.select({
        MIMEType: photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE,
        maxSelectNumber: 1
      });
      if (result.photoUris.length === 0) {
        return;
      }

      this.isUploading = true;
      let uri = result.photoUris[0];

      let file = fileIo.openSync(uri, fileIo.OpenMode.READ_ONLY);
      let stat = fileIo.statSync(uri);
      let buf = new ArrayBuffer(stat.size);
      fileIo.readSync(file.fd, buf);
      fileIo.closeSync(file);

      let token = AuthStore.getInstance().token;
      let boundary = '----HarmonyOS' + Date.now();

      let headerStr = '--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="avatar.jpg"\r\nContent-Type: image/jpeg\r\n\r\n';
      let footerStr = '\r\n--' + boundary + '--\r\n';

      let headerBuf = this.stringToBuffer(headerStr);
      let footerBuf = this.stringToBuffer(footerStr);

      let totalLen = headerBuf.byteLength + buf.byteLength + footerBuf.byteLength;
      let uploadData = new ArrayBuffer(totalLen);
      let uploadView = new Uint8Array(uploadData);
      uploadView.set(new Uint8Array(headerBuf), 0);
      uploadView.set(new Uint8Array(buf), headerBuf.byteLength);
      uploadView.set(new Uint8Array(footerBuf), headerBuf.byteLength + buf.byteLength);

      let httpReq = http.createHttp();
      let response = await httpReq.request(BASE_URL + API_UPLOAD_AVATAR, {
        method: http.RequestMethod.POST,
        header: {
          'Content-Type': 'multipart/form-data; boundary=' + boundary,
          'Authorization': 'Bearer ' + (token ?? '')
        },
        extraData: uploadData
      });

      httpReq.destroy();

      let resultStr = response.result as string;
      let parsed = JSON.parse(resultStr) as Record<string, Object>;
      let avatarUrl = ((parsed['data'] as Record<string, Object>)['url'] as string) ?? (parsed['url'] as string) ?? '';

      if (avatarUrl.length > 0) {
        let client = AuthStore.getInstance().getHttpClient();
        let body: UpdateProfileRequest = { avatar: avatarUrl, username: null };
        await client.request<Object>('PUT', API_USER_PROFILE, body);

        if (this.user !== null) {
          this.user.avatar = avatarUrl;
          AppStorage.setOrCreate('AUTH_USER', this.user);
        }
      }
    } catch (e) {
      console.error('avatar upload failed: ' + JSON.stringify(e));
    } finally {
      this.isUploading = false;
    }
  }

  private stringToBuffer(str: string): ArrayBuffer {
    let buf = new ArrayBuffer(str.length);
    let view = new Uint8Array(buf);
    for (let i = 0; i < str.length; i++) {
      view[i] = str.charCodeAt(i);
    }
    return buf;
  }

  @Builder
  MenuRow(item: MenuItemData) {
    Row() {
      Icon({ name: item.iconName, iconSize: 20, color: item.isLogout ? COLOR_DANGER_600 : COLOR_INK_500 })
      Text(item.text)
        .fontSize(TYPO_BODY.size)
        .fontWeight(TYPO_BODY.weight)
        .fontColor(item.isLogout ? COLOR_DANGER_600 : COLOR_INK_700)
        .margin({ left: SPACE_2 })
        .layoutWeight(1)
      Icon({ name: 'CHEVRON_RIGHT', iconSize: 16, color: COLOR_INK_400 })
    }
    .backgroundColor(COLOR_PAPER_50)
    .padding(SPACE_4)
    .height(SPACE_9)
    .border({ width: { bottom: STROKE_HAIRLINE.width }, color: STROKE_HAIRLINE.color })
  }

  showLogoutDialog(): void {
    AlertDialog.show({
      title: '退出登录',
      message: '确定要退出当前账号吗？',
      confirm: {
        value: '确定',
        fontColor: COLOR_DANGER_600,
        action: () => {
          this.doLogout();
        }
      },
      cancel: () => {}
    });
  }

  private async doLogout(): Promise<void> {
    try { ChatStore.getInstance().clearAll(); } catch (_) {}
    try { await RiskFormStore.getInstance().clearFormData(); } catch (_) {}
    try { UiStore.getInstance().resetState(); } catch (_) {}
    await AuthStore.getInstance().clearAuth();
    router.replaceUrl({ url: 'pages/' + LOGIN });
  }

  aboutToAppear(): void {
  }

  build() {
    if (this.user === null) {
      EmptyState({
        title: '未登录',
        description: '请先登录后查看个人中心',
        actionText: '去登录',
        onAction: () => {
          AuthStore.getInstance().clearAuth();
          router.replaceUrl({ url: 'pages/' + LOGIN });
        }
      })
    } else {
      Scroll() {
        Column() {
          this.ProfileHeader()
          Blank().height(SPACE_4)
          Column() {
            ForEach(PROFILE_MENU_ITEMS, (item: MenuItemData) => {
              if (item.adminOnly && this.role !== 'admin') {
              } else if (item.isLogout) {
                Column() {
                  this.MenuRow(item)
                }
                .onClick(() => {
                  this.showLogoutDialog();
                })
              } else {
                Column() {
                  this.MenuRow(item)
                }
                .onClick(() => {
                  router.pushUrl({ url: 'pages/' + item.routeName });
                })
              }
            })
          }
          .backgroundColor(COLOR_PAPER_50)
          .borderRadius(RADIUS_CELL)
          .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
          .margin({ left: SPACE_4, right: SPACE_4 })
          Blank().height(SPACE_9 + SPACE_7)
        }
      }
      .backgroundColor(COLOR_PAPER_100)
      .height('100%')
    }
  }
}
