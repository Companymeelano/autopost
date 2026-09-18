import { createRouter, createWebHashHistory } from 'vue-router'
import { useCms } from './stores/cms'
import LoginView from './views/LoginView.vue'
import DashboardView from './views/DashboardView.vue'
import ProductsView from './views/ProductsView.vue'
import ProductEditView from './views/ProductEditView.vue'
import PostsView from './views/PostsView.vue'
import PricingView from './views/PricingView.vue'
import MessagesView from './views/MessagesView.vue'
import AIView from './views/AIView.vue'
import SettingsView from './views/SettingsView.vue'

export const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login', name: 'login', component: LoginView },
  { path: '/dashboard', name: 'dashboard', component: DashboardView, meta: { auth: true, nav: 'dashboard', title: 'داشبورد و گزارش‌گیری' } },
  { path: '/products', name: 'products', component: ProductsView, meta: { auth: true, nav: 'products', title: 'مدیریت محصولات' } },
  { path: '/products/new', name: 'product-new', component: ProductEditView, meta: { auth: true, nav: 'products', title: 'افزودن محصول' } },
  { path: '/products/:id(\\d+)/edit', name: 'product-edit', component: ProductEditView, meta: { auth: true, nav: 'products', title: 'ویرایش محصول' } },
  { path: '/posts', name: 'posts', component: PostsView, meta: { auth: true, nav: 'posts', title: 'مدیریت محتوا و پست‌ها' } },
  { path: '/pricing', name: 'pricing', component: PricingView, meta: { auth: true, nav: 'pricing', title: 'قیمت‌گذاری و تخفیفات' } },
  { path: '/messages', name: 'messages', component: MessagesView, meta: { auth: true, nav: 'messages', title: 'پیام‌ها و درخواست‌ها' } },
  { path: '/ai', name: 'ai', component: AIView, meta: { auth: true, nav: 'ai', title: 'تولید محتوای هوشمند' } },
  { path: '/audit', name: 'audit', component: () => import('./views/AuditView.vue'), meta: { auth: true, nav: 'audit', title: 'گزارش ممیزی' } },
  { path: '/users', name: 'users', component: () => import('./views/UsersView.vue'), meta: { auth: true, nav: 'users', title: 'کاربران و نقش‌ها' } },
  { path: '/payments', name: 'payments', component: () => import('./views/PaymentView.vue'), meta: { auth: true, nav: 'payments', title: 'پرداخت و تراکنش‌ها' } },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { auth: true, nav: 'settings', title: 'تنظیمات' } },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]

export function makeRouter() {
  const router = createRouter({ history: createWebHashHistory(), routes })
  // گارد احراز هویت — هر مسیر auth بدون لاگین به /login با query برمی‌گردد
  router.beforeEach((to) => {
    const cms = useCms()
    if (to.meta.auth && !cms.authed) return { path: '/login', query: to.fullPath !== '/dashboard' ? { to: to.fullPath } : {} }
    if (to.path === '/login' && cms.authed) return { path: to.query.to || '/dashboard' }
    return true
  })
  router.afterEach((to) => {
    document.title = (to.meta.title ? to.meta.title + ' — ' : '') + 'PanahFit CMS'
  })
  return router
}
