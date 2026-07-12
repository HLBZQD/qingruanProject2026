import { describe, it, expect } from '@ohos/hypium';
import { HomeStore } from '../main/ets/stores/HomeStore';
import { HomeData } from '../main/ets/stores/HomeStore';
import { HttpClient } from '../main/ets/network/HttpClient';

function initializeHomeStore(): HomeStore {
  const httpClient = new HttpClient();
  return HomeStore.getInstance(httpClient);
}

export default function homeStoreTest(): void {
  describe('HomeStoreTest', () => {
    it('getInstance 不传参抛出 Error', 0, () => {
      let caught: boolean = false;
      let errorMsg: string = '';
      try {
        HomeStore.getInstance();
      } catch (_e) {
        caught = true;
        errorMsg = (_e as Error).message;
      }
      expect(caught).assertTrue();
      expect(errorMsg.indexOf('HttpClient required') !== -1).assertTrue();
    });

    it('getInstance 传参返回同一引用', 0, () => {
      const inst1 = initializeHomeStore();
      const inst2 = HomeStore.getInstance();
      expect(inst1 === inst2).assertTrue();
    });

    it('HomeData doctors 初始为 []', 0, () => {
      const hd = new HomeData();
      expect(hd.doctors.length).assertEqual(0);
    });

    it('HomeData articles 初始为 []', 0, () => {
      const hd = new HomeData();
      expect(hd.articles.length).assertEqual(0);
    });

    it('HomeData advice 初始为 null', 0, () => {
      const hd = new HomeData();
      expect(hd.advice).assertNull();
    });

    it('HomeData isLoadingDoctors 初始为 false', 0, () => {
      const hd = new HomeData();
      expect(hd.isLoadingDoctors).assertFalse();
    });

    it('HomeData isLoadingArticles 初始为 false', 0, () => {
      const hd = new HomeData();
      expect(hd.isLoadingArticles).assertFalse();
    });

    it('HomeData isLoadingAdvice 初始为 false', 0, () => {
      const hd = new HomeData();
      expect(hd.isLoadingAdvice).assertFalse();
    });

    it('HomeData isRefreshing 初始为 false', 0, () => {
      const hd = new HomeData();
      expect(hd.isRefreshing).assertFalse();
    });

    it('HomeData errorMessage 初始为 null', 0, () => {
      const hd = new HomeData();
      expect(hd.errorMessage).assertNull();
    });

    it('HomeData articlesPage 初始为 1', 0, () => {
      const hd = new HomeData();
      expect(hd.articlesPage).assertEqual(1);
    });

    it('HomeData articlesHasMore 初始为 false', 0, () => {
      const hd = new HomeData();
      expect(hd.articlesHasMore).assertFalse();
    });

    it('refreshAll 方法签名存在', 0, () => {
      expect(typeof (HomeStore.prototype as Record<string, Function>)['refreshAll'])
        .assertEqual('function');
    });

    it('refreshDoctors 方法签名存在', 0, () => {
      expect(typeof (HomeStore.prototype as Record<string, Function>)['refreshDoctors'])
        .assertEqual('function');
    });

    it('refreshArticles 方法签名存在', 0, () => {
      expect(typeof (HomeStore.prototype as Record<string, Function>)['refreshArticles'])
        .assertEqual('function');
    });

    it('loadMoreArticles 方法签名存在', 0, () => {
      expect(typeof (HomeStore.prototype as Record<string, Function>)['loadMoreArticles'])
        .assertEqual('function');
    });

    it('refreshAdvice 方法签名存在', 0, () => {
      expect(typeof (HomeStore.prototype as Record<string, Function>)['refreshAdvice'])
        .assertEqual('function');
    });

    it('getDoctors 方法签名存在', 0, () => {
      expect(typeof (HomeStore.prototype as Record<string, Function>)['getDoctors'])
        .assertEqual('function');
    });

    it('getArticles 方法签名存在', 0, () => {
      expect(typeof (HomeStore.prototype as Record<string, Function>)['getArticles'])
        .assertEqual('function');
    });

    it('getAdvice 方法签名存在', 0, () => {
      expect(typeof (HomeStore.prototype as Record<string, Function>)['getAdvice'])
        .assertEqual('function');
    });

    it('isLoadingDoctors 方法签名存在', 0, () => {
      expect(typeof (HomeStore.prototype as Record<string, Function>)['isLoadingDoctors'])
        .assertEqual('function');
    });

    it('isLoadingArticles 方法签名存在', 0, () => {
      expect(typeof (HomeStore.prototype as Record<string, Function>)['isLoadingArticles'])
        .assertEqual('function');
    });

    it('isLoadingAdvice 方法签名存在', 0, () => {
      expect(typeof (HomeStore.prototype as Record<string, Function>)['isLoadingAdvice'])
        .assertEqual('function');
    });

    it('isRefreshing 方法签名存在', 0, () => {
      expect(typeof (HomeStore.prototype as Record<string, Function>)['isRefreshing'])
        .assertEqual('function');
    });

    it('getError 方法签名存在', 0, () => {
      expect(typeof (HomeStore.prototype as Record<string, Function>)['getError'])
        .assertEqual('function');
    });

    it('hasMoreArticles 方法签名存在', 0, () => {
      expect(typeof (HomeStore.prototype as Record<string, Function>)['hasMoreArticles'])
        .assertEqual('function');
    });

    it('getDoctors 初始返回 []', 0, () => {
      const inst = initializeHomeStore();
      expect(inst.getDoctors().length).assertEqual(0);
    });

    it('getAdvice 初始返回 null', 0, () => {
      const inst = initializeHomeStore();
      expect(inst.getAdvice()).assertNull();
    });

    it('hasMoreArticles 初始返回 false', 0, () => {
      const inst = initializeHomeStore();
      expect(inst.hasMoreArticles()).assertFalse();
    });

    it('getHomeData 返回同一引用', 0, () => {
      const inst = initializeHomeStore();
      const d1 = inst.getHomeData();
      const d2 = inst.getHomeData();
      expect(d1 === d2).assertTrue();
    });
  });
}
