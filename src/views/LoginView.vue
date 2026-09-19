<script setup>
import { reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCms } from '../stores/cms'
import { validateLogin } from '../utils/validation'

const cms = useCms()
const router = useRouter()
const route = useRoute()
const form = reactive({ username: 'admin', password: '' })
const errors = ref({})
const busy = ref(false)

async function submit() {
  errors.value = validateLogin(form.username, form.password)
  if (Object.keys(errors.value).length) return
  busy.value = true
  const r = await cms.login(form.username, form.password) // آنلاین → /api/auth/login | آفلاین → شبیه‌سازی محلی
  busy.value = false
  if (r.ok) {
    cms.toast('ورود موفقیت‌آمیز. به پنل مدیریت خوش آمدید.')
    router.push(route.query.to || '/dashboard')
  } else {
    errors.value = { ...(r.fields || {}), form: r.form || 'خطای نامشخص.' }
  }
}
</script>

<template>
  <main id="login-page">
    <div class="auth-container">
      <h2 class="auth-title"><i class="fas fa-lock"></i> پنل مدیریت PanahFit</h2>
      <p class="login-hint">
        لطفاً برای دسترسی، وارد حساب کاربری خود شوید.
        <br>
        <template v-if="cms.online">
          <span style="color:#6ee7b7;"><i class="fas fa-server"></i> اتصال سرور برقرار است — احراز هویت سمت سرور انجام می‌شود.</span>
        </template>
        <template v-else>
          (محیط نمایشی آفلاین — نام کاربری: <strong>admin</strong> | رمز عبور: <strong>12345</strong>)
        </template>
      </p>
      <form @submit.prevent="submit">
        <div class="form-group-3d">
          <label for="cms-username">نام کاربری / ایمیل</label>
          <input id="cms-username" v-model="form.username" type="text" class="cms-input"
                 :class="{ invalid: errors.username }" placeholder="نام کاربری یا ایمیل" autocomplete="username" />
          <span v-if="errors.username" class="field-error">{{ errors.username }}</span>
        </div>
        <div class="form-group-3d">
          <label for="cms-password">رمز عبور</label>
          <input id="cms-password" v-model="form.password" type="password" class="cms-input"
                 :class="{ invalid: errors.password }" placeholder="رمز عبور" autocomplete="current-password" />
          <span v-if="errors.password" class="field-error">{{ errors.password }}</span>
        </div>
        <p v-if="errors.form" class="field-error" style="text-align:center;" role="alert">{{ errors.form }}</p>
        <button class="cms-btn" type="submit" :disabled="busy">
          <i class="fas" :class="busy ? 'fa-spinner fa-spin' : 'fa-sign-in-alt'"></i>
          {{ busy ? 'در حال بررسی...' : 'ورود به پنل' }}
        </button>
      </form>
    </div>
  </main>
</template>

<style scoped>
.login-hint { color: var(--text-muted); font-size: 0.8rem; margin-bottom: 20px; text-align: center; }
</style>
