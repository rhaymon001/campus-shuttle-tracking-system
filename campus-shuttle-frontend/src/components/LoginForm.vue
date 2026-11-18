<template>
  <div class="form-wrap">
    <p class="eyebrow rise" style="--i:1">Sign in</p>
    <h2 class="rise" style="--i:2">Welcome back</h2>
    <p class="subtitle rise" style="--i:3">Sign in to track shuttles and hold your seat.</p>

    <div v-if="serverError" class="banner banner-danger" role="alert">
      <AlertTriangle :size="16" />
      <span>{{ serverError }}</span>
    </div>

    <form @submit="onSubmit" class="form-layout rise" style="--i:4" novalidate>
      <div class="field">
        <label for="email">Email address</label>
        <div class="input-wrapper">
          <Mail :size="16" class="input-icon" />
          <input id="email" v-model="email" class="input" type="email" autocomplete="email" placeholder="username@gmail.com" :class="{ 'has-error': errors.email }" />
        </div>
        <span class="error-msg" role="alert">{{ errors.email }}</span>
      </div>

      <div class="field">
        <label for="password">Password</label>
        <PasswordInput id="password" v-model="password" autocomplete="current-password" placeholder="Enter your password" :has-error="!!errors.password" />
        <span class="error-msg" role="alert">{{ errors.password }}</span>
      </div>

      <button type="submit" :disabled="isSubmitting" class="btn submit">
        <Loader2 v-if="isSubmitting" :size="16" class="spin" />
        <span>{{ isSubmitting ? 'Signing in…' : 'Sign in' }}</span>
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useForm, useField } from 'vee-validate';
import * as yup from 'yup';
import { Mail, Lock, AlertTriangle, Loader2 } from 'lucide-vue-next';
import PasswordInput from './PasswordInput.vue';
import { useAuthStore } from '../stores/auth';
import { useRouter } from 'vue-router';
import { ROLE_HOME } from '../router';


const router = useRouter();
const authStore = useAuthStore();
const serverError = ref('');

const validationSchema = yup.object({
  email: yup.string().required('Email address is mandatory').email('Must be a valid email format'),
  password: yup.string().required('Password is mandatory').min(6, 'Password must be at least 6 characters')
});

const { handleSubmit, errors, isSubmitting } = useForm({ validationSchema });

const { value: email } = useField('email');
const { value: password } = useField('password');

const onSubmit = handleSubmit(async (values) => {
  serverError.value = '';
  try {
    const loggedInUser = await authStore.loginUser(values);
    // Route each role to its dedicated workspace
    router.push(ROLE_HOME[loggedInUser.role] || '/dashboard');
  } catch (err) {
    serverError.value = err
  }
});
</script>

<style scoped>
h2 { font-size: 40px; font-weight: 700; letter-spacing: -.035em; margin: 10px 0 8px; }
.subtitle { color: var(--muted); margin-bottom: 28px; }
.form-layout { display: flex; flex-direction: column; gap: 6px; }
label { font: 600 12px var(--font-body); color: var(--muted); }
.input-wrapper { position: relative; display: flex; align-items: center; }
.input-icon { position: absolute; left: 14px; color: var(--stale); pointer-events: none; }
.input { padding-left: 42px; }
.input:focus ~ .input-icon, .input-wrapper:focus-within .input-icon { color: var(--brand); }
.error-msg { font-size: 12px; color: var(--live); min-height: 18px; }
.submit { width: 100%; margin-top: 6px; min-height: 48px; font-size: 15px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.banner { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 10px; font-size: 14px; margin-bottom: 18px; line-height: 1.4; animation: rise .35s var(--ease); }
.banner svg { flex: none; margin-top: 2px; }
.banner-danger { background: var(--danger-bg); color: var(--live); box-shadow: inset 3px 0 0 var(--live); }
</style>
