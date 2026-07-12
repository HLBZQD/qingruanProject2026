import { describe, it, expect } from '@ohos/hypium';
import { HomeStore, HomeData } from '../main/ets/stores/HomeStore';
import { Article } from '../main/ets/types/models';
import { EMPTY_MESSAGES } from '../main/ets/components/EmptyState';
import { filterArticles } from '../main/ets/pages/tabs/NewsPage';

export default function newsPageTest(): void {
  describe('NewsPageTest', () => {
    it('NewsPage 模块可 import', 0, () => {
      let caught: boolean = false;
      try {
        require('../main/ets/pages/tabs/NewsPage');
      } catch (_e) {
        caught = true;
      }
      expect(caught).assertFalse();
    });

    it('HomeStore.getInstance() 可获取且 getHomeData().articles 为数组', 0, () => {
      const store: HomeStore = HomeStore.getInstance();
      expect(store !== null).assertTrue();
      const data: HomeData = store.getHomeData();
      expect(Array.isArray(data.articles)).assertTrue();
    });

    it('filterArticles 纯函数正确性', 0, () => {
      const articles: Article[] = [
        { id: 1, title: '糖尿病饮食指南', cover: null, author: '张三', category: '饮食',
          tags: [], summary: '', views: 0, created_at: '2025-01-01' },
        { id: 2, title: '运动与血糖', cover: null, author: '李四', category: '运动',
          tags: [], summary: '', views: 0, created_at: '2025-01-02' },
        { id: 3, title: '糖尿病的预防', cover: null, author: '王五', category: '预防',
          tags: [], summary: '', views: 0, created_at: '2025-01-03' },
      ];

      const all = filterArticles(articles, '');
      expect(all.length).assertEqual(3);
      expect(all !== articles).assertTrue();

      const titleMatch = filterArticles(articles, '糖尿病');
      expect(titleMatch.length).assertEqual(2);

      const categoryMatch = filterArticles(articles, '运动');
      expect(categoryMatch.length).assertEqual(1);
      expect(categoryMatch[0].id).assertEqual(2);

      const caseMatch = filterArticles(articles, 'DIABETES');
      expect(caseMatch.length).assertEqual(0);

      const noMatch = filterArticles(articles, '不存在');
      expect(noMatch.length).assertEqual(0);
    });

    it('EMPTY_MESSAGES.NO_ARTICLES === \'暂无相关资讯\'', 0, () => {
      expect(EMPTY_MESSAGES.NO_ARTICLES).assertEqual('暂无相关资讯');
    });

    it('编译验证', 0, () => {
      expect(true).assertTrue();
    });
  });
}
