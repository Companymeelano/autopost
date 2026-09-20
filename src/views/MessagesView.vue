<script setup>
import { useCms } from '../stores/cms'
const cms = useCms()

const notifications = [
  { icon: 'fa-exclamation-circle', color: 'var(--accent-hot-red)', text: 'سفارش جدید #۹۰۵۵ ثبت و پرداخت شد. (۲ دقیقه پیش)' },
  { icon: 'fa-exclamation-triangle', color: 'var(--accent-new)', text: 'موجودی محصول «کفش باشگاهی» به زیر ۱۰ عدد رسید.' },
  { icon: 'fa-check-circle', color: 'var(--text-muted)', text: 'API درگاه پرداخت با موفقیت متصل شد.' },
]

function openMsg(id) { cms.openModal('پیام مشتری', 'message', { messageId: id }) }
</script>

<template>
  <section>
    <h2 class="section-title"><i class="fas fa-inbox"></i> پیام‌ها و اعلان‌های ورودی</h2>

    <div class="data-card-3d" style="margin-bottom: 20px;">
      <h3 style="color: var(--accent-hot-red); margin-bottom: 15px;"><i class="fas fa-bell"></i> اعلان‌های سیستمی و سفارشات جدید</h3>
      <ul class="notify-list">
        <li v-for="(n, i) in notifications" :key="i" :style="{ color: n.color, borderBottom: i < notifications.length - 1 ? '1px dashed var(--border-dark)' : 'none' }">
          <i class="fas" :class="n.icon"></i> {{ n.text }}
        </li>
      </ul>
    </div>

    <div class="data-card-3d">
      <h3 style="color: var(--success); margin-bottom: 15px;"><i class="fas fa-comment-dots"></i> پیام‌های ورودی مشتریان</h3>
      <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 15px;">پیام‌های جدید از طریق فرم تماس یا سیستم تیکتینگ.</p>
      <div class="table-scroll-wrap">
        <table class="data-table-3d" style="font-size: 0.8rem;">
          <thead>
            <tr><th scope="col">وضعیت</th><th scope="col">موضوع</th><th scope="col">نام مشتری</th><th scope="col">تاریخ</th><th scope="col">عملیات</th></tr>
          </thead>
          <tbody>
            <tr v-for="m in cms.messages" :key="m.id">
              <td>
                <span v-if="m.status === 'new'" class="status-chip chip-red">جدید</span>
                <span v-else class="status-chip chip-green">پاسخ داده شد</span>
              </td>
              <td>{{ m.subject }}</td>
              <td>{{ m.customer }}</td>
              <td>{{ m.date }}</td>
              <td>
                <button class="cms-btn" style="padding:5px 8px;margin:0;width:auto;background:var(--accent-new);" @click="openMsg(m.id)">
                  {{ m.status === 'new' ? 'مشاهده/پاسخ' : 'مشاهده' }}
                </button>
              </td>
            </tr>
            <tr v-if="!cms.messages.length"><td colspan="5" style="text-align:center;color:var(--text-muted);">پیامی وجود ندارد.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.notify-list { list-style-type: none; padding: 0; margin: 0; }
.notify-list li { padding: 10px 0; font-size: 0.9rem; }
.chip-red { color: var(--accent-hot-red); background: rgba(255, 0, 85, 0.12); border: 1px solid var(--accent-hot-red); }
.chip-green { color: var(--success); background: rgba(0, 255, 200, 0.12); border: 1px solid var(--success); }
</style>
