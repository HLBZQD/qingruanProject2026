import { HttpClient } from '../network/HttpClient';
import { Doctor, Article, HealthAdvice, DiabetesType } from '../types/models';
import { ApiError } from '../types/api';
import { API_DOCTORS, API_ARTICLES, API_HEALTH_ADVICE } from '../common/constants/ApiEndpoints';

interface PaginationResponse<T> {
  data: T[];
  has_more: boolean;
}

interface BackendWrapper<T> {
  data: T;
}

export class HomeData {
  doctors: Doctor[] = [];
  articles: Article[] = [];
  advice: HealthAdvice | null = null;
  isLoadingDoctors: boolean = false;
  isLoadingArticles: boolean = false;
  isLoadingAdvice: boolean = false;
  isRefreshing: boolean = false;
  errorMessage: string | null = null;
  articlesPage: number = 1;
  articlesHasMore: boolean = false;
  diabetesTypes: DiabetesType[] = [];
  isLoadingTypes: boolean = false;
}

class HomeStore {
  private static instance: HomeStore | null = null;
  private httpClient: HttpClient;
  private homeData: HomeData;
  private generatedArticles: Article[] = [];
  private articleCategory: string = '';

  private constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
    this.homeData = new HomeData();
  }

  static getInstance(httpClient?: HttpClient): HomeStore {
    if (HomeStore.instance !== null) {
      return HomeStore.instance;
    }
    const client: HttpClient = httpClient ?? new HttpClient({ tokenProvider: null, onUnauthorized: null });
    HomeStore.instance = new HomeStore(client);
    return HomeStore.instance;
  }

  getHomeData(): HomeData {
    return this.homeData;
  }

  getHomeDataSnapshot(): HomeData {
    const snapshot: HomeData = new HomeData();
    snapshot.doctors = [...this.homeData.doctors];
    snapshot.articles = [...this.homeData.articles];
    snapshot.advice = this.homeData.advice;
    snapshot.isLoadingDoctors = this.homeData.isLoadingDoctors;
    snapshot.isLoadingArticles = this.homeData.isLoadingArticles;
    snapshot.isLoadingAdvice = this.homeData.isLoadingAdvice;
    snapshot.isRefreshing = this.homeData.isRefreshing;
    snapshot.errorMessage = this.homeData.errorMessage;
    snapshot.articlesPage = this.homeData.articlesPage;
    snapshot.articlesHasMore = this.homeData.articlesHasMore;
    snapshot.diabetesTypes = [...this.homeData.diabetesTypes];
    snapshot.isLoadingTypes = this.homeData.isLoadingTypes;
    return snapshot;
  }

  async refreshAll(): Promise<void> {
    this.homeData.isRefreshing = true;
    try {
      const wrapDoctors = this._fetchDoctors().then(
        (d: Doctor[]) => { this.homeData.doctors = d; return 'fulfilled'; },
        () => 'rejected'
      );
      const wrapArticles = this._fetchArticles(1).then(
        (r: PaginationResponse<Article>) => {
          this.homeData.articles = r.data;
          this.homeData.articlesHasMore = r.has_more;
          this.homeData.articlesPage = 1;
          return 'fulfilled';
        },
        () => 'rejected'
      );
      const wrapAdvice = this._fetchAdvice().then(
        (d: HealthAdvice) => { this.homeData.advice = d; return 'fulfilled'; },
        () => 'rejected'
      );
      const wrapDiabetesTypes = this.fetchDiabetesTypes().then(
        () => 'fulfilled',
        () => 'rejected'
      );
      const results: string[] = await Promise.all([wrapDoctors, wrapArticles, wrapAdvice, wrapDiabetesTypes]);
      if (results.indexOf('rejected') !== -1) {
        this.homeData.errorMessage = '部分数据加载失败';
      }
    } finally {
      this.homeData.isRefreshing = false;
    }
  }

  async refreshDoctors(): Promise<void> {
    this.homeData.isLoadingDoctors = true;
    try {
      this.homeData.doctors = await this._fetchDoctors();
    } catch (e) {
      this.homeData.errorMessage = (e as ApiError).message ?? '数据加载失败，请下拉刷新重试';
    } finally {
      this.homeData.isLoadingDoctors = false;
    }
  }

  async refreshArticles(reset: boolean): Promise<void> {
    this.homeData.isLoadingArticles = true;
    if (reset) {
      this.homeData.articlesPage = 1;
      this.homeData.articles = [];
    }
    try {
      const response: PaginationResponse<Article> = await this._fetchArticles(this.homeData.articlesPage);
      if (reset) {
        this.homeData.articles = this.mergeGenerated(response.data);
      } else {
        this.homeData.articles = [...this.homeData.articles, ...response.data];
      }
      this.homeData.articlesHasMore = response.has_more;
    } catch (e) {
      this.homeData.errorMessage = (e as ApiError).message;
    } finally {
      this.homeData.isLoadingArticles = false;
    }
  }

  async loadMoreArticles(): Promise<void> {
    if (!this.homeData.articlesHasMore || this.homeData.isLoadingArticles) {
      return;
    }
    this.homeData.articlesPage += 1;
    await this.refreshArticles(false);
  }

  async refreshAdvice(): Promise<void> {
    this.homeData.isLoadingAdvice = true;
    try {
      this.homeData.advice = await this._fetchAdvice();
    } catch (e) {
      console.warn('[HomeStore] refreshAdvice failed:', JSON.stringify(e));
    } finally {
      this.homeData.isLoadingAdvice = false;
    }
  }

  async fetchDiabetesTypes(): Promise<void> {
    this.homeData.isLoadingTypes = true;
    try {
      const response: DiabetesType[] = await this.httpClient.request<BackendWrapper<DiabetesType[]>>(
        'GET', '/api/diabetes-types'
      ).then((r: BackendWrapper<DiabetesType[]>) => r.data);
      this.homeData.diabetesTypes = response;
    } catch (err) {
      this.homeData.errorMessage = (err as ApiError).message ?? '类型数据加载失败';
    } finally {
      this.homeData.isLoadingTypes = false;
    }
  }

  getDoctors(): Doctor[] {
    return this.homeData.doctors;
  }

  getArticles(): Article[] {
    return this.homeData.articles;
  }

  setArticleCategory(category: string): void {
    this.articleCategory = category;
  }

  getArticleCategory(): string {
    return this.articleCategory;
  }

  prependArticle(article: Article): void {
    this.generatedArticles = [article, ...this.generatedArticles];
    this.homeData.articles = [article, ...this.homeData.articles];
  }

  private mergeGenerated(list: Article[]): Article[] {
    if (this.generatedArticles.length === 0) {
      return list;
    }
    const generatedIds = new Set<number>();
    for (let i = 0; i < this.generatedArticles.length; i++) {
      generatedIds.add(this.generatedArticles[i].id);
    }
    const filtered: Article[] = [];
    for (let i = 0; i < list.length; i++) {
      if (!generatedIds.has(list[i].id)) {
        filtered.push(list[i]);
      }
    }
    return [...this.generatedArticles, ...filtered];
  }

  getAdvice(): HealthAdvice | null {
    return this.homeData.advice;
  }

  getDiabetesTypes(): DiabetesType[] {
    return this.homeData.diabetesTypes;
  }

  isLoadingDoctors(): boolean {
    return this.homeData.isLoadingDoctors;
  }

  isLoadingArticles(): boolean {
    return this.homeData.isLoadingArticles;
  }

  isLoadingAdvice(): boolean {
    return this.homeData.isLoadingAdvice;
  }

  isLoadingDiabetesTypes(): boolean {
    return this.homeData.isLoadingTypes;
  }

  isRefreshing(): boolean {
    return this.homeData.isRefreshing;
  }

  getError(): string | null {
    return this.homeData.errorMessage;
  }

  hasMoreArticles(): boolean {
    return this.homeData.articlesHasMore;
  }

  private _fetchDoctors(): Promise<Doctor[]> {
    return this.httpClient.request<BackendWrapper<Doctor[]>>('GET', API_DOCTORS).then((r: BackendWrapper<Doctor[]>) => r.data);
  }

  private _fetchArticles(page: number): Promise<PaginationResponse<Article>> {
    let url: string = API_ARTICLES + '?page=' + String(page);
    if (this.articleCategory.length > 0) {
      url += '&category=' + encodeURIComponent(this.articleCategory);
    }
    return this.httpClient.request<BackendWrapper<Article[]>>('GET', url).then((r: BackendWrapper<Article[]>) => {
      const result: PaginationResponse<Article> = { data: r.data, has_more: false };
      return result;
    });
  }

  private _fetchAdvice(): Promise<HealthAdvice> {
    return this.httpClient.request<HealthAdvice>('GET', API_HEALTH_ADVICE);
  }
}

export { HomeStore };
