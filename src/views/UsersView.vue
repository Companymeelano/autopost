<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useCms } from '../stores/cms'
import { apiFetch } from '../utils/api'
import { toFa } from '../utils/format'

const cms = useCms()
const users = ref([])
const roles = ref([])
const busy = ref(false)
const error = ref('')
const form = reactive({ username: '', password: '', role: 'editor' })
const formErr = ref({})
const pwFor = ref(null)
const pwVal = ref('')
const rolesOpen = ref(false)

async function load() {
  if (!cms.online) { error.value = 'مدیریت کاربران به اتصال سرور نیاز دارد.'; return }
  busy.value = true
  error.value = ''
  try {
    users.value = (await apiFetch('/users')).items
    roles.value = (await apiFetch('/roles')).roles
  } catch (e) { error.value = e.message } finally { busy.value = false }
}

async function create() {
  formErr.value = {}
  const uname = form.username.trim()
  try {
    await apiFetch('/users', { method: 'POST', body: { username: uname, password: form.password, role: form.role } })
    Object.assign(form, { username: '', password: '' })
    cms.toast(`کاربر «${uname}» ساخته شد.`)
    load()
  } catch (e) { formErr.value = { ...(e.fields || {}), form: e.message } }
}

async function setRole(u, role) {
  try {
    await apiFetch(`/users/${encodeURIComponent(u.username)}/role`, { method: 'PUT', body: { role } })
    cms.toast(`نقش «${u.username}» به ${role} تغییر کرد.`)
    load()
  } catch (e) { cms.toast(e.message, true) }
}
async function resetPw(u) {
  if (pwVal.value.length < 8) { cms.toast('رمز جدید حداقل ۸ نویسه.', true); return }
  try {
    await apiFetch(`/users/${encodeURIComponent(u.username)}/password`, { method: 'POST', body: { password: pwVal.value } })
    cms.toast(`رمز «${u.username}» بازنشانی شد.`)
    pwFor.value = null; pwVal.value = ''
  } catch (e) { cms.toast(e.message, true) }
}
async function remove(u) {
  if (!window.confirm(`حذف کاربر «${u.username}»؟ نشست‌های او نیز باطل می‌شود.`)) return
  try {
    await apiFetch(`/users/${encodeURIComponent(u.username)}`, { method: 'DELETE' })
    cms.toast(`کاربر «${u.username}» حذف شد.`)
    load()
  } catch (e) { cms.toast(e.message, true) }
}
onMounted(load)
</script>

<template>
  <section>
    <h2 class="section-title"><i class="fas fa-users"></i> کاربران و نقش‌ها</h2>
    <div v-if="!cms.online" class="offline-note"><i class="fas fa-plug"></i> احراز هویت و نقش‌ها سمت سرور انجام می‌شود؛ برای مدیریت کاربران، سرور را اجرا کنید.</div>
    <template v-else>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      <div class="data-card-3d" style="margin-bottom:20px;">
        <h3 style="margin-bottom:12px;"><i class="fas fa-user-plus"></i> افزودن کاربر</h3>
        <form class="field-row-2" @submit.prevent="create">
          <div class="form-group-3d">
            <label for="nu-username">نام کاربری</label>
            <input id="nu-username" v-model="form.username" class="cms-input" dir="ltr" :class="{ invalid: formErr.username }" autocomplete="off" />
            <span v-if="formErr.username" class="field-error">{{ formErr.username }}</span>
          </div>
          <div class="form-group-3d">
            <label for="nu-pass">رمز عبور (حداقل ۸ نویسه)</label>
            <input id="nu-pass" v-model="form.password" type="password" class="cms-input" :class="{ invalid: formErr.password }" autocomplete="new-password" />
            <span v-if="formErr.password" class="field-error">{{ formErr.password }}</span>
          </div>
          <div class="form-group-3d">
            <label for="nu-role">نقش</label>
            <select id="nu-role" v-model="form.role" class="cms-input cms-select">
              <option v-for="r in roles" :key="r.role" :value="r.role">{{ r.label }} ({{ r.role }})</option>
            </select>
          </div>
          <div class="form-group-3d" style="display:flex;align-items:flex-end;">
            <button class="cms-btn" type="submit" style="width:100%;" :disabled="busy"><i class="fas fa-plus"></i> ساخت کاربر</button>
          </div>
        </form>
        <p v-if="formErr.form" class="field-error">{{ formErr.form }}</p>
        <button class="linkish" @click="rolesOpen = !rolesOpen"><i class="fas fa-shield-alt"></i> {{ rolesOpen ? 'بستن' : 'مشاهده' }} سطح دسترسی نقش‌ها</button>
        <ul v-if="rolesOpen" class="perm-list">
          <li v-for="r in roles" :key="r.role"><strong>{{ r.label }}</strong> ({{ r.role }}): <code>{{ r.perms.join('، ') }}</code></li>
        </ul>
      </div>

      <div class="data-card-3d">
        <h3 style="margin-bottom:12px;"><i class="fas fa-users"></i> کاربران سیستم ({{ toFa(users.length) }})</h3>
        <table class="data-table-3d" style="font-size:.8rem;">
          <thead><tr><th>نام کاربری</th><th>نقش</th><th>تاریخ ساخت</th><th style="width:220px;">عملیات</th></tr></thead>
          <tbody>
            <tr v-for="u in users" :key="u.username">
              <td><i class="fas fa-user" style="margin-inline-end:6px;color:var(--primary);"></i>{{ u.username }}<template v-if="u.username === cms.user"> <span class="status-chip chip-green">شما</span></template></td>
              <td>
                <select class="cms-input cms-select" style="padding:4px 8px;width:auto;font-size:.78rem;" :value="u.role"
                        :disabled="u.username === cms.user" @change="setRole(u, $event.target.value)">
                  <option v-for="r in roles" :key="r.role" :value="r.role">{{ r.label }}</option>
                </select>
              </td>
              <td style="color:var(--text-muted);">{{ new Date(u.created_at).toLocaleString('fa-IR') }}</td>
              <td style="white-space:nowrap;">
                <button class="cms-btn" style="padding:5px 8px;margin:0;width:auto;background:#333;color:#fff;box-shadow:none;font-size:.72rem;" @click="pwFor = pwFor === u.username ? null : u.username">
                  <i class="fas fa-key"></i> بازنشانی رمز
                </button>
                <button v-if="u.username !== cms.user" class="cms-btn" style="padding:5px 8px;margin:0 6px 0 0;width:auto;background:var(--accent-hot-red);font-size:.72rem;" @click="remove(u)">
                  <i class="fas fa-trash"></i> حذف
                </button>
              </td>
            </tr>
            <tr v-if="pwFor">
              <td colspan="4" style="padding:8px 12px;">
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                  <span style="font-size:.78rem;color:var(--text-muted);">رمز جدید برای «{{ pwFor }}»:</span>
                  <input v-model="pwVal" type="password" class="cms-input" style="width:220px;padding:6px 10px;" placeholder="حداقل ۸ نویسه" @keyup.enter="resetPw({ username: pwFor })" />
                  <button class="cms-btn" style="width:auto;padding:6px 14px;margin:0;" @click="resetPw({ username: pwFor })">ثبت</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.linkish { background: none; border: none; color: var(--primary); cursor: pointer; font: inherit; font-size: .8rem; padding: 6px 0 0; }
.perm-list { font-size: .75rem; color: var(--text-muted); margin: 8px 0 0; padding-inline-start: 18px; }
.perm-list code { direction: ltr; unicode-bidi: embed; }
</style>
